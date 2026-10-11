import type { Env } from '../lib/types';
import Stripe from 'stripe';
import type { AccountRow } from '../lib/account-session';
import { digest,randomToken } from '../lib/account-session';
import { billingAccount,billingConfig,currentEntitlements,FREE_LIMITS,type BillingAccount } from '../lib/entitlements';
import { providerLink, providerPrice, stripeClient } from '../lib/stripe-provider';
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
type BillingRow = { customer_id: string | null; status: string };
async function customer(env: Env, account: AccountRow): Promise<string> {
  await env.DB.prepare('INSERT INTO billing_accounts(account_id) VALUES(?) ON CONFLICT(account_id) DO NOTHING').bind(account.account_id).run();
  let row = await env.DB.prepare('SELECT customer_id FROM billing_accounts WHERE account_id=?').bind(account.account_id).first<BillingRow>();
  if (row?.customer_id) return row.customer_id;
  const created = await stripeClient(env).customers.create({ metadata: { account_id: account.account_id } },
    { idempotencyKey: 'dv-customer-test-' + await digest(`${account.chain_id}:${account.contract_address}:${account.account_id}:${billingConfig(env)!.origin}`) });
  if (created.livemode !== false || !/^cus_[A-Za-z0-9]+$/.test(created.id)) throw Error('Billing customer unavailable');
  await env.DB.prepare('UPDATE billing_accounts SET customer_id=? WHERE account_id=? AND customer_id IS NULL').bind(created.id, account.account_id).run();
  row = await env.DB.prepare('SELECT customer_id FROM billing_accounts WHERE account_id=?').bind(account.account_id).first<BillingRow>();
  if (!row?.customer_id) throw Error('Billing customer unavailable');
  return row.customer_id;
}
export async function handleBilling(request: Request, env: Env, account: AccountRow): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (!path.startsWith('/api/account/billing')) return null;
  const config = billingConfig(env);
  if (request.method === 'GET' && path === '/api/account/billing') {
    if (!config) return json({ available: false, plan: 'free', limits: FREE_LIMITS, invoices: [] });
    let row=await billingAccount(env,account.account_id),entitlements=currentEntitlements(env,row);
    let subscription=row?{status:row.status,periodEnd:row.period_end,cancelAtPeriodEnd:Boolean(row.cancel_at_period_end),fresh:entitlements.fresh}:null;
    try {
      const price = await providerPrice(env);
      if(row?.customer_id&&!entitlements.fresh){
        const token=await claim(env,row);
        try{const snapshot=await authoritative(env,row),verified=Date.now();
          const updated=await snapshotUpdate(env,row.account_id,token,snapshot,verified).run();
          if(updated.meta.changes!==1)throw Error('Billing reconciliation lease expired');
        }finally{await release(env,row.account_id,token);}
        row=await billingAccount(env,account.account_id);entitlements=currentEntitlements(env,row);
        subscription=row?{status:row.status,periodEnd:row.period_end,cancelAtPeriodEnd:Boolean(row.cancel_at_period_end),fresh:entitlements.fresh}:null;
      }
      const invoices=[];
      if(row?.customer_id){
        const result=await stripeClient(env).invoices.list({customer:row.customer_id,limit:20});
        for(const invoice of result.data){
          const url=providerLink(invoice.hosted_invoice_url,'invoice.stripe.com');
          if(invoice.customer!==row.customer_id||invoice.livemode!==false||!url||!Number.isSafeInteger(invoice.amount_paid)||!Number.isSafeInteger(invoice.created)||!/^[a-z]{3}$/.test(invoice.currency))continue;
          invoices.push({id:invoice.id,amount:invoice.amount_paid,currency:invoice.currency,status:invoice.status,createdAt:invoice.created*1000,url});
        }
      }
      return json({available:true,mode:'test',...entitlements,offeredLimits:config.caps,price,subscription,portalAvailable:Boolean(row?.customer_id),invoices});
    } catch {
      if(row)await env.DB.prepare('UPDATE billing_accounts SET verified_at=0 WHERE account_id=? AND verified_at=? AND lease_until<=?').bind(row.account_id,row.verified_at,Date.now()).run();
      return json({available:false,plan:'free',limits:FREE_LIMITS,subscription:subscription?{...subscription,fresh:false}:null,invoices:[],error:'Billing provider unavailable. Wallet query payments continue.'});
    }
  }
  if (request.method === 'POST' && ['/api/account/billing/checkout', '/api/account/billing/portal'].includes(path)) {
    try {
      if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw 0;
      const input = await request.json();
      if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length) throw 0;
    } catch { return json({ error: 'Billing accepts only an empty JSON object.' }, 400); }
    if (!config) return json({ error: 'Subscriptions are unavailable. Wallet query payments continue.' }, 503);
    let row=await billingAccount(env,account.account_id),token:string|undefined;
    try {
      const stripe = stripeClient(env);
      if (path.endsWith('/portal')) {
        if (!row?.customer_id) return json({ error: 'No billing account exists yet.' }, 409);
        token=await claim(env,row);
        const portal = await stripe.billingPortal.sessions.create({ customer: row.customer_id, return_url: config.origin + '/settings/billing' });
        const url = providerLink(portal.url, 'billing.stripe.com');
        if (!url) throw Error('Billing portal unavailable');
        return json({ url });
      }
      if(row)token=await claim(env,row);
      await providerPrice(env);
      const customerId = await customer(env, account);
      row=(await billingAccount(env,account.account_id))!;
      if(!token)token=await claim(env,row);
      // The lease may be acquired after another checkout committed. Re-read its durable state under the lease.
      row=(await billingAccount(env,account.account_id))!;
      const snapshot=await authoritative(env,row),verified=Date.now();
      const updated=await snapshotUpdate(env,row.account_id,token,snapshot,verified).run();
      if(updated.meta.changes!==1)throw Error('Billing reconciliation lease expired');
      if(!['none','canceled','incomplete_expired'].includes(snapshot.status))return json({error:'An existing subscription must be managed in the billing portal.'},409);
      const existing=providerLink(row.checkout_url,'checkout.stripe.com');
      if(existing&&row.checkout_expires>Date.now())return json({status:'pending',url:existing});
      const key=row.checkout_key&&row.checkout_expires===0?row.checkout_key:randomToken();
      const keyed=await env.DB.prepare('UPDATE billing_accounts SET checkout_key=?,checkout_expires=0 WHERE account_id=? AND lease_token=? AND lease_until>?').bind(key,row.account_id,token,Date.now()).run();
      if(keyed.meta.changes!==1)throw Error('Billing checkout lease expired');
      const session = await stripe.checkout.sessions.create({
        customer: customerId, mode: 'subscription', line_items: [{ price: config.price, quantity: 1 }],
        success_url: config.origin + '/settings/billing?checkout=pending', cancel_url: config.origin + '/settings/billing',
      },{idempotencyKey:'dv-checkout-test-'+key});
      const url = providerLink(session.url, 'checkout.stripe.com');
      if (session.livemode !== false || session.customer !== customerId || !url || !Number.isSafeInteger(session.expires_at) || session.expires_at*1000<=Date.now()) throw Error('Billing checkout unavailable');
      const saved=await env.DB.prepare('UPDATE billing_accounts SET checkout_id=?,checkout_url=?,checkout_expires=? WHERE account_id=? AND lease_token=? AND lease_until>?').bind(session.id,url,session.expires_at*1000,row.account_id,token,Date.now()).run();
      if(saved.meta.changes!==1)throw Error('Billing checkout lease expired');
      return json({ status: 'pending', url });
    } catch {
      if(row){
        if(token)await env.DB.prepare('UPDATE billing_accounts SET verified_at=0 WHERE account_id=? AND lease_token=? AND lease_until>?').bind(row.account_id,token,Date.now()).run();
      }
      return json({ error: 'Billing provider unavailable. Please retry.' }, 503);
    }finally{if(row&&token)await release(env,row.account_id,token);}
  }
  return json({ error: 'Not found' }, 404);
}

async function claim(env:Env,row:BillingAccount){
 const token=randomToken(),now=Date.now();
 const result=await env.DB.prepare('UPDATE billing_accounts SET lease_token=?,lease_until=? WHERE account_id=? AND lease_until<=?').bind(token,now+30000,row.account_id,now).run();
 if(result.meta.changes!==1)throw Error('Billing reconciliation busy');
 return token;
}
async function release(env:Env,id:string,token:string){await env.DB.prepare('UPDATE billing_accounts SET lease_token=NULL,lease_until=0 WHERE account_id=? AND lease_token=?').bind(id,token).run();}

async function authoritative(env:Env,row:BillingAccount){
 const config=billingConfig(env)!;
 const result=await stripeClient(env).subscriptions.list({customer:row.customer_id!,status:'all',limit:100});
 if(result.has_more||!Array.isArray(result.data))throw Error('Billing subscription unavailable');
 for(const s of result.data)if(s.customer!==row.customer_id||s.livemode!==false||!/^sub_[A-Za-z0-9]+$/.test(s.id))throw Error('Billing subscription unavailable');
 const current=result.data.filter(s=>!['canceled','incomplete_expired'].includes(s.status));
 // Ambiguous parallel subscriptions cannot grant a plan. The portal can resolve duplicates.
 const s=current.length===1?current[0]:current.length>1?null:result.data.sort((a,b)=>b.created-a.created)[0];
 const item=s?.items?.data?.length===1?s.items.data[0]:null;
 const price=item?.price?.id??null;
 const period=item?.current_period_end;
 const valid=price===config.price&&item?.quantity===1&&Number.isSafeInteger(period)&&period!>0;
 return {subscription:s?.id??null,price,status:current.length>1?'ambiguous':s?.status??'none',period:valid?period!*1000:0,cancel:s?.cancel_at_period_end?1:0,limits:JSON.stringify(valid?config.caps:FREE_LIMITS)};
}
function snapshotUpdate(env:Env,id:string,token:string,snapshot:Awaited<ReturnType<typeof authoritative>>,verified:number){
 return env.DB.prepare('UPDATE billing_accounts SET subscription_id=?,price_id=?,status=?,period_end=?,cancel_at_period_end=?,verified_at=?,limits_json=? WHERE account_id=? AND lease_token=? AND lease_until>?').bind(snapshot.subscription,snapshot.price,snapshot.status,snapshot.period,snapshot.cancel,verified,snapshot.limits,id,token,verified);
}

export async function handleBillingWebhook(request:Request,env:Env):Promise<Response>{
 const config=billingConfig(env);if(!config)return json({error:'Billing unavailable.'},503);
 let event:Stripe.Event;
 try{
   const header=request.headers.get('Stripe-Signature')??'';
   if(header.length>2048)throw 0;
   const parts=header.split(','),timestamps=parts.filter(p=>p.startsWith('t=')),signatures=parts.filter(p=>p.startsWith('v1='));
   if(timestamps.length!==1||!/^t=[0-9]{1,12}$/.test(timestamps[0])||signatures.length<1||signatures.length>8||signatures.some(p=>!/^v1=[a-fA-F0-9]{64}$/.test(p)))throw 0;
   if(Math.abs(Math.floor(Date.now()/1000)-Number(timestamps[0].slice(2)))>300)throw 0;
   const raw=await request.text();if(new TextEncoder().encode(raw).length>65536)return json({error:'Webhook too large.'},413);
   event=await stripeClient(env).webhooks.constructEventAsync(raw,header,config.webhookSecret,300,Stripe.createSubtleCryptoProvider());
   if(event.livemode!==false||!/^evt_[A-Za-z0-9]+$/.test(event.id)||typeof event.type!=='string')throw 0;
 }catch{return json({error:'Invalid billing webhook.'},400);}
 const object=event.data?.object as unknown as {customer?:unknown};
 const customerId=typeof object?.customer==='string'&&/^cus_[A-Za-z0-9]+$/.test(object.customer)?object.customer:null;
 const row=customerId?await env.DB.prepare('SELECT * FROM billing_accounts WHERE customer_id=? AND mode=\'test\'').bind(customerId).first<BillingAccount>():null;
 const supported=/^(customer\.subscription\.|invoice\.|checkout\.session\.)/.test(event.type);
 const state=row&&supported?'pending':'ignored',now=Date.now();
 await env.DB.prepare('INSERT INTO billing_events(event_id,mode,customer_id,state,created_at,completed_at) VALUES(?,\'test\',?,?,?,?) ON CONFLICT(event_id,mode) DO NOTHING').bind(event.id,customerId,state,now,state==='ignored'?now:null).run();
 const existing=await env.DB.prepare('SELECT state FROM billing_events WHERE event_id=? AND mode=\'test\'').bind(event.id).first<{state:string}>();
 if(existing?.state!=='pending'||!row)return json({received:true});
 let token:string|undefined;
 try{
   token=await claim(env,row);
   await env.DB.prepare('UPDATE billing_events SET attempts=attempts+1 WHERE event_id=? AND mode=\'test\' AND state=\'pending\'').bind(event.id).run();
   const snapshot=await authoritative(env,row),verified=Date.now();
   const results=await env.DB.batch([
    snapshotUpdate(env,row.account_id,token,snapshot,verified),
    env.DB.prepare('UPDATE billing_events SET state=\'done\',completed_at=? WHERE event_id=? AND mode=\'test\' AND state=\'pending\' AND EXISTS(SELECT 1 FROM billing_accounts WHERE account_id=? AND lease_token=? AND lease_until>?)').bind(verified,event.id,row.account_id,token,verified),
   ]);
   if(results[0].meta.changes!==1||results[1].meta.changes!==1)throw Error('Billing reconciliation lease expired');
   return json({received:true});
 }catch{if(token)await env.DB.prepare('UPDATE billing_accounts SET verified_at=0 WHERE account_id=? AND lease_token=? AND lease_until>?').bind(row.account_id,token,Date.now()).run();return json({error:'Billing reconciliation unavailable. Retry delivery.'},503);}
 finally{if(token)await release(env,row.account_id,token);}
}
