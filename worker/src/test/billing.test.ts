import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import worker from '../index';
import {sqliteD1} from './sqlite-d1';
import {digest} from '../lib/account-session';
import type {Env} from '../lib/types';
vi.mock('../lib/chain-identity',()=>({rpcMatchesConfiguredChain:vi.fn(async()=>true)}));
vi.mock('../lib/policy',()=>({getOnChainCollection:vi.fn(async()=>({owner:'0x'+'11'.repeat(20)}))}));
let store:ReturnType<typeof sqliteD1>,env:Env;
const address='0x'+'11'.repeat(20),csrf='c'.repeat(64);
async function call(path='account/billing',method='GET',body?:unknown){return worker.fetch(new Request('https://vault.example/api/'+path,{method,headers:{Origin:'https://vault.example',Cookie:'dv_session='+'1'.repeat(64),'x-csrf-token':csrf,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}),env);}
beforeEach(async()=>{store=sqliteD1();env={DB:store.db,CHAIN_ID:'10143',CONTRACT_ADDRESS:'0x'+'ab'.repeat(20)} as Env;await env.DB.prepare('INSERT INTO accounts(account_id,address,chain_id,contract_address,created_at,updated_at) VALUES(?,?,?,?,1,1)').bind('a',address,10143,env.CONTRACT_ADDRESS).run();await env.DB.prepare('INSERT INTO account_sessions(token_hash,account_id,csrf_token,expires_at,created_at) VALUES(?,?,?,?,1)').bind(await digest('1'.repeat(64)),'a',csrf,Date.now()+1000000).run();});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();store.close();});
it('keeps wallet payments independent while subscriptions are unconfigured',async()=>{const response=await call();expect(response.status).toBe(200);expect(await response.json()).toMatchObject({available:false,plan:'free',limits:{activeKeys:5,ownedWorkspaces:5,workspaceMembers:50,importsPerDay:20,savedQuestions:50,uploadBytes:2097152},invoices:[]});expect((await call('account/billing/checkout','POST',{})).status).toBe(503);});
it('does not accept a browser redirect or client supplied billing ownership',async()=>{expect((await call('account/billing/checkout','POST',{customer:'cus_other',price:'price_free',returnUrl:'https://evil.example'})).status).toBe(400);const response=await call('account/billing?checkout=success');expect(await response.json()).toMatchObject({plan:'free'});});

import {accountQuotaSql,billingConfig,FREE_LIMITS} from '../lib/entitlements';
const caps={...FREE_LIMITS,activeKeys:8,ownedWorkspaces:8,workspaceMembers:60,savedQuestions:60,importsPerDay:30};
function configure(){Object.assign(env,{BILLING_MODE:'test',STRIPE_SECRET_KEY:'sk_test_'+'a'.repeat(24),STRIPE_WEBHOOK_SECRET:'whsec_'+'b'.repeat(24),STRIPE_PRICE_ID:'price_test',PUBLIC_ORIGIN:'https://vault.example',BILLING_LIMITS:JSON.stringify(caps)});}
it('requires explicit bounded limits, trusted origin, test keys and fixed upload ceiling',()=>{configure();expect(billingConfig(env)?.caps).toEqual(caps);for(const change of [{BILLING_MODE:'live'},{STRIPE_SECRET_KEY:'sk_live_'+'a'.repeat(24)},{BILLING_LIMITS:JSON.stringify({...caps,uploadBytes:4194304})},{BILLING_LIMITS:JSON.stringify({...caps,importsPerDay:Infinity})},{PUBLIC_ORIGIN:'https://vault.example/other'}]){configure();Object.assign(env,change);expect(billingConfig(env)).toBeNull();}});
it('retrieves real provider price and uses account-bound customer and checkout return URLs',async()=>{configure();const requests:{url:string;body:string}[]=[];vi.stubGlobal('fetch',vi.fn(async(url,init)=>{const u=String(url),body=String(init?.body??'');requests.push({url:u,body});if(u.includes('/prices/'))return Response.json({id:'price_test',active:true,livemode:false,type:'recurring',currency:'jpy',unit_amount:1200,recurring:{interval:'month',interval_count:1,usage_type:'licensed'}});if(u.includes('/subscriptions'))return Response.json({data:[],has_more:false});if(u.endsWith('/customers'))return Response.json({id:'cus_test',livemode:false});if(u.includes('/checkout/sessions'))return Response.json({id:'cs_test_1',customer:'cus_test',livemode:false,url:'https://checkout.stripe.com/c/pay/test',expires_at:Math.floor(Date.now()/1000)+3600});throw Error('unexpected');}));const info=await call();expect(await info.json()).toMatchObject({available:true,price:{amount:1200,currency:'jpy',interval:'month'}});const r=await call('account/billing/checkout','POST',{});expect(r.status).toBe(200);expect(await r.json()).toMatchObject({status:'pending',url:'https://checkout.stripe.com/c/pay/test'});const body=new URLSearchParams(requests.find(r=>r.url.includes('/checkout/sessions'))!.body);expect(body.get('customer')).toBe('cus_test');expect(body.get('line_items[0][price]')).toBe('price_test');expect(body.get('success_url')).toBe('https://vault.example/settings/billing?checkout=pending');expect(store.sqlite.prepare('SELECT status FROM billing_accounts').all()).toEqual([{status:'none'}]);vi.unstubAllGlobals();});

async function boundCustomer(){configure();await env.DB.prepare("INSERT INTO billing_accounts(account_id,customer_id) VALUES('a','cus_test')").run();}
function subscription(status='active',price='price_test',customer='cus_test') {
 return {id:'sub_test',customer,livemode:false,status,cancel_at_period_end:false,items:{data:[{price:{id:price},quantity:1,current_period_end:Math.floor(Date.now()/1000)+3600}]}};
}
function provider(sub=subscription(),invoices:unknown[]=[]){vi.stubGlobal('fetch',vi.fn(async(input)=>{
 const url=new URL(String(input));
 if(url.pathname.includes('/prices/'))return Response.json({id:'price_test',active:true,livemode:false,type:'recurring',currency:'jpy',unit_amount:1200,recurring:{interval:'month',interval_count:1,usage_type:'licensed'}});
 if(url.pathname==='/v1/subscriptions')return Response.json({data:[sub],has_more:false});
 if(url.pathname==='/v1/invoices')return Response.json({data:invoices,has_more:false});
 if(url.pathname==='/v1/billing_portal/sessions')return Response.json({url:'https://billing.stripe.com/p/session/test'});
 throw Error('unexpected');
}));}
async function webhook(event:Record<string,unknown>,timestamp=Math.floor(Date.now()/1000),alter=false){
 const raw=JSON.stringify(event),key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.STRIPE_WEBHOOK_SECRET!),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signature=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(timestamp+'.'+raw))),x=>x.toString(16).padStart(2,'0')).join('');
 return worker.fetch(new Request('https://vault.example/api/billing/webhook',{method:'POST',headers:{'Stripe-Signature':`t=${timestamp},v1=${signature}`,'Content-Type':'application/json'},body:raw+(alter?' ': '')}),env);
}
const event=(id='evt_test',extra:Record<string,unknown>={})=>({id,type:'customer.subscription.updated',livemode:false,data:{object:{customer:'cus_test',id:'sub_test',status:'active'}},...extra});
it('verifies raw signatures, rejects expired and future events, and ignores live mode',async()=>{
 await boundCustomer();provider();
 expect((await webhook(event(),undefined,true)).status).toBe(400);
 expect((await webhook(event(),Math.floor(Date.now()/1000)-301)).status).toBe(400);
 expect((await webhook(event(),Math.floor(Date.now()/1000)+301)).status).toBe(400);
 expect((await webhook(event('evt_live',{livemode:true}))).status).toBe(400);
 expect(store.sqlite.prepare('SELECT status FROM billing_accounts').all()).toEqual([{status:'none'}]);
});
it('reconciles authoritative state, deduplicates events, and downgrades reordered event payloads',async()=>{
 await boundCustomer();provider();
 expect((await webhook(event())).status).toBe(200);
 expect(await (await call()).json()).toMatchObject({plan:'pro',limits:{activeKeys:8},subscription:{status:'active'}});
 const network=vi.mocked(fetch);network.mockClear();
 expect((await webhook(event())).status).toBe(200);expect(network).not.toHaveBeenCalled();
 provider(subscription('past_due'));
 expect((await webhook(event('evt_older'))).status).toBe(200);
 expect(await (await call()).json()).toMatchObject({plan:'free',limits:{activeKeys:5},subscription:{status:'past_due'}});
});
it('rejects wrong prices and customer substitution without granting entitlements',async()=>{
 await boundCustomer();provider(subscription('active','price_wrong'));expect((await webhook(event())).status).toBe(200);
 expect(await (await call()).json()).toMatchObject({plan:'free'});
 provider(subscription('active','price_test','cus_other'));expect((await webhook(event('evt_other'))).status).toBe(503);
 expect(await (await call()).json()).toMatchObject({plan:'free'});
});
it('keeps failed reconciliation retryable and prevents metadata creating account ownership',async()=>{
 await boundCustomer();vi.stubGlobal('fetch',vi.fn(async()=>{throw Error('sk_test_do_not_expose');}));
 const failed=await webhook(event());expect(failed.status).toBe(503);expect(await failed.text()).not.toContain('sk_test');
 expect(store.sqlite.prepare('SELECT state,attempts FROM billing_events').all()).toEqual([{state:'pending',attempts:1}]);
 provider();expect((await webhook(event())).status).toBe(200);
 expect((await webhook(event('evt_unknown',{data:{object:{customer:'cus_unknown',metadata:{account_id:'a'}}}}))).status).toBe(200);
 expect(store.sqlite.prepare('SELECT customer_id FROM billing_accounts').all()).toEqual([{customer_id:'cus_test'}]);
});
it('fails closed on expiry and stale provider evidence while retaining subscription history',async()=>{
 await boundCustomer();provider();expect((await webhook(event())).status).toBe(200);
 await env.DB.prepare('UPDATE billing_accounts SET verified_at=?').bind(Date.now()-901000).run();
 vi.stubGlobal('fetch',vi.fn(async()=>{throw Error('provider unavailable');}));
 expect(await (await call()).json()).toMatchObject({plan:'free',subscription:{status:'active',fresh:false}});
 provider({...subscription(),items:{data:[{price:{id:'price_test'},quantity:1,current_period_end:Math.floor(Date.now()/1000)-1}]}});
 await env.DB.prepare('UPDATE billing_accounts SET verified_at=?,period_end=?').bind(Date.now(),Date.now()-1).run();
 expect(await (await call()).json()).toMatchObject({plan:'free'});
});
it('returns only owned invoices and safe links, and uses fixed portal return URLs',async()=>{
 await boundCustomer();provider(subscription(),[
 {id:'in_own',customer:'cus_test',livemode:false,currency:'jpy',amount_paid:1200,status:'paid',created:100,hosted_invoice_url:'https://invoice.stripe.com/i/test'},
 {id:'in_other',customer:'cus_other',livemode:false,currency:'jpy',amount_paid:1200,status:'paid',created:100,hosted_invoice_url:'https://invoice.stripe.com/i/private'},
 {id:'in_bad',customer:'cus_test',livemode:false,currency:'jpy',amount_paid:1200,status:'paid',created:100,hosted_invoice_url:'https://evil.example/secret'},
 ]);
 const info=await (await call()).json() as any;expect(info.invoices).toEqual([{id:'in_own',amount:1200,currency:'jpy',status:'paid',createdAt:100000,url:'https://invoice.stripe.com/i/test'}]);
 expect((await call('account/billing/portal','POST',{})).status).toBe(200);
 const [url,init]=vi.mocked(fetch).mock.calls.at(-1)!;expect(String(url)).toContain('/billing_portal/sessions');
 const body=new URLSearchParams(String(init?.body));expect(body.get('customer')).toBe('cus_test');expect(body.get('return_url')).toBe('https://vault.example/settings/billing');
});

it('fences a delayed provider fetch after its customer lease expires',async()=>{
 await boundCustomer();let finish:(value:Response)=>void=()=>{};
 vi.stubGlobal('fetch',vi.fn(()=>new Promise<Response>(resolve=>{finish=resolve;})));
 const first=webhook(event());
 for(let n=0;n<100&& !vi.mocked(fetch).mock.calls.length;n++)await new Promise(r=>setTimeout(r,5));
 await env.DB.prepare('UPDATE billing_accounts SET lease_until=0').run();provider(subscription('past_due'));
 expect((await webhook(event('evt_new'))).status).toBe(200);
 finish(Response.json({data:[subscription()],has_more:false}));expect((await first).status).toBe(503);
 expect(store.sqlite.prepare('SELECT status FROM billing_accounts').all()).toEqual([{status:'past_due'}]);
 expect(store.sqlite.prepare('SELECT state FROM billing_events WHERE event_id=?').all('evt_test')).toEqual([{state:'pending'}]);
});
it('enforces higher saved-question limits atomically and preserves over-limit reads after downgrade',async()=>{
 await boundCustomer();provider();expect((await webhook(event())).status).toBe(200);
 const id='0x'+'cd'.repeat(32),now=Date.now();
 store.sqlite.prepare("INSERT INTO collections(collection_id,owner_address,collection_name,content_hash,created_at,status,chain_id,contract_address) VALUES(?,?,?,?,?,'confirmed',?,?)").all(id,address,'Guide',id,now,10143,env.CONTRACT_ADDRESS);
 store.sqlite.prepare("WITH RECURSIVE n(x) AS (VALUES(0) UNION ALL SELECT x+1 FROM n WHERE x<58) INSERT INTO account_saved_questions(account_id,collection_id,question,created_at,expires_at) SELECT 'a',?,'question'||x,?,? FROM n").all(id,now,now+86400000);
 const responses=await Promise.all([1,2].map(n=>call('account/saved-questions','POST',{collectionId:id,question:'last'+n,optIn:true})));
 expect(responses.map(r=>r.status).sort()).toEqual([201,409]);
 provider(subscription('past_due'));expect((await webhook(event('evt_downgrade'))).status).toBe(200);
 expect((await call('account/saved-questions','POST',{collectionId:id,question:'extra',optIn:true})).status).toBe(409);
 const read=await (await call('account/saved-questions?limit=50')).json() as any;expect(read.items).toHaveLength(50);expect(read.nextCursor).toBeTruthy();
 const exported=await (await call('account/export')).json() as any;expect(exported.savedQuestions).toHaveLength(60);
 expect((await call('account/saved-questions/'+read.items[0].id,'DELETE',{})).status).toBe(200);
});
it('creates workspaces with immutable creator billing ownership and configured owner caps',async()=>{
 await boundCustomer();provider();expect((await webhook(event())).status).toBe(200);
 for(let n=0;n<8;n++)expect((await call('account/workspaces','POST',{name:'Team '+n})).status).toBe(201);
 expect((await call('account/workspaces','POST',{name:'Too many'})).status).toBe(409);
 expect(store.sqlite.prepare('SELECT DISTINCT billing_account_id FROM workspaces').all()).toEqual([{billing_account_id:'a'}]);
});
it('applies configured key caps atomically and fails closed when configuration disappears',async()=>{
 await boundCustomer();provider();expect((await webhook(event())).status).toBe(200);
 const id='0x'+'cd'.repeat(32),now=Date.now();
 store.sqlite.prepare("INSERT INTO collections(collection_id,owner_address,collection_name,content_hash,created_at,status,chain_id,contract_address) VALUES(?,?,?,?,?,'confirmed',?,?)").all(id,address,'Guide',id,now,10143,env.CONTRACT_ADDRESS);
 for(let n=0;n<7;n++)store.sqlite.prepare('INSERT INTO developer_keys(id,account_id,chain_id,contract_address,name,secret_hash,display_prefix,scopes,collection_ids,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').all(String(n).padStart(64,'0'),'a',10143,env.CONTRACT_ADDRESS,'key'+n,'h'+n,'dv_public','["collections:read"]',JSON.stringify([id]),now,now+86400000);
 const input={name:'Last',collectionIds:[id],expiresInDays:1,scopes:['collections:read']};
 const responses=await Promise.all([1,2].map(()=>call('account/api-keys','POST',input)));expect(responses.map(r=>r.status).sort()).toEqual([201,409]);
 delete env.BILLING_MODE;expect((await call('account/api-keys','POST',input)).status).toBe(409);
 expect(await (await call('account/api-keys')).json()).toMatchObject({keys:expect.any(Array)});
});
it('uses configured daily import caps while keeping one inflight job',async()=>{
 await boundCustomer();provider();expect((await webhook(event())).status).toBe(200);const now=Date.now();
 store.sqlite.prepare("WITH RECURSIVE n(x) AS (VALUES(0) UNION ALL SELECT x+1 FROM n WHERE x<28) INSERT INTO github_import_jobs(id,account_id,repository,ref,paths,status,idempotency_key,created_at,expires_at) SELECT printf('%064d',x),'a','a/b','main','[]','failed','job'||x,?,? FROM n").all(now,now+86400000);
 vi.stubGlobal('fetch',vi.fn(async()=>{throw Error('provider unavailable');}));
 expect((await call('account/imports/github','POST',{repository:'octocat/Hello-World',ref:'main',paths:['README.md']})).status).toBe(201);
 expect((await call('account/imports/github','POST',{repository:'octocat/Hello-World',ref:'other',paths:['README.md']})).status).toBe(429);
 expect(store.sqlite.prepare('SELECT COUNT(*) AS n FROM github_import_jobs').all()).toEqual([{n:30}]);
});
it('bounds webhook requests independently of other JSON routes',async()=>{
 await boundCustomer();provider();
 expect((await webhook(event('evt_large',{padding:'x'.repeat(9000)}))).status).toBe(200);
 expect((await webhook(event('evt_oversize',{padding:'x'.repeat(65536)}))).status).toBe(413);
});
it('fails closed for new usage immediately after the exact freshness window',async()=>{
 await boundCustomer();provider();expect((await webhook(event())).status).toBe(200);
 await env.DB.prepare('UPDATE billing_accounts SET verified_at=999100001,period_end=2000000000000').run();
 // Freeze only the SQLite clock primitives: now is 1,000,000.5 seconds and evidence is 900,499 ms old.
 const sql=accountQuotaSql(env,'savedQuestions','a').replaceAll("strftime('%s','now')",'1000000').replaceAll("julianday('now')",'(2440587.5+1000000.5/86400)');
 expect(await env.DB.prepare(`SELECT ${sql} AS cap`).first()).toEqual({cap:50});
});
it('refreshes stale billing evidence from the current provider and fails closed on provider errors',async()=>{
 await boundCustomer();provider();expect((await webhook(event())).status).toBe(200);
 await env.DB.prepare('UPDATE billing_accounts SET verified_at=0').run();
 expect(await (await call()).json()).toMatchObject({plan:'pro',subscription:{fresh:true}});
 vi.stubGlobal('fetch',vi.fn(async()=>{throw Error('private outage');}));
 expect(await (await call()).json()).toMatchObject({plan:'free',available:false});
 expect(store.sqlite.prepare('SELECT verified_at FROM billing_accounts').all()).toEqual([{verified_at:0}]);
});
it('reuses an owned pending checkout under retries without duplicate subscriptions',async()=>{
 configure();let count=0;
 vi.stubGlobal('fetch',vi.fn(async(input)=>{const path=new URL(String(input)).pathname;
  if(path.startsWith('/v1/prices/'))return Response.json({id:'price_test',active:true,livemode:false,type:'recurring',currency:'usd',unit_amount:1234,recurring:{interval:'month',interval_count:1,usage_type:'licensed'}});
  if(path==='/v1/customers')return Response.json({id:'cus_test',livemode:false});
  if(path==='/v1/subscriptions')return Response.json({data:[],has_more:false});
  if(path==='/v1/checkout/sessions'){count++;return Response.json({id:'cs_test_1',customer:'cus_test',livemode:false,url:'https://checkout.stripe.com/c/pay/test',expires_at:Math.floor(Date.now()/1000)+3600});}
  throw Error('unexpected');
 }));
 expect((await call('account/billing/checkout','POST',{})).status).toBe(200);
 expect((await call('account/billing/checkout','POST',{})).status).toBe(200);expect(count).toBe(1);
 expect(store.sqlite.prepare('SELECT status FROM billing_accounts').all()).toEqual([{status:'none'}]);
});
it('rechecks pending checkout state after a delayed concurrent customer lease claim',async()=>{
 configure();let count=0,claims=0,finishFirst:()=>void=()=>{},bothEntered:()=>void=()=>{};
 const firstDone=new Promise<void>(resolve=>{finishFirst=resolve;});
 const bothClaims=new Promise<void>(resolve=>{bothEntered=resolve;});
 const base=env.DB;
 env.DB={...base,prepare(sql:string){const stmt=base.prepare(sql);if(sql.startsWith('UPDATE billing_accounts SET lease_token=?')){const run=stmt.run;stmt.run=(async()=>{if(++claims===1)await bothClaims;else{bothEntered();await firstDone;}return run();}) as typeof stmt.run;}if(sql.startsWith('UPDATE billing_accounts SET lease_token=NULL')){const run=stmt.run;stmt.run=(async()=>{const result=await run();finishFirst();return result;}) as typeof stmt.run;}return stmt;}} as D1Database;
 vi.stubGlobal('fetch',vi.fn(async(input)=>{const path=new URL(String(input)).pathname;
  if(path.startsWith('/v1/prices/'))return Response.json({id:'price_test',active:true,livemode:false,type:'recurring',currency:'usd',unit_amount:1234,recurring:{interval:'month',interval_count:1,usage_type:'licensed'}});
  if(path==='/v1/customers')return Response.json({id:'cus_test',livemode:false});
  if(path==='/v1/subscriptions')return Response.json({data:[],has_more:false});
  if(path==='/v1/checkout/sessions'){count++;return Response.json({id:'cs_test_1',customer:'cus_test',livemode:false,url:'https://checkout.stripe.com/c/pay/test',expires_at:Math.floor(Date.now()/1000)+3600});}
  throw Error('unexpected');
 }));
 const first=call('account/billing/checkout','POST',{});
 const second=call('account/billing/checkout','POST',{});
 expect((await first).status).toBe(200);expect((await second).status).toBe(200);expect(count).toBe(1);
});
it('uses creator seat limits while keeping another Owner invoices private',async()=>{
 await boundCustomer();provider();expect((await webhook(event())).status).toBe(200);
 const response=await call('account/workspaces','POST',{name:'Seats'}),w=(await response.json() as any).workspace.id;
 const other='0x'+'22'.repeat(20),now=Date.now();
 store.sqlite.prepare('INSERT INTO accounts(account_id,address,chain_id,contract_address,created_at,updated_at) VALUES(?,?,?,?,?,?)').all('b',other,10143,env.CONTRACT_ADDRESS,now,now);
 store.sqlite.prepare('INSERT INTO account_sessions(token_hash,account_id,csrf_token,expires_at,created_at) VALUES(?,?,?,?,?)').all(await digest('2'.repeat(64)),'b',csrf,now+100000,now);
 store.sqlite.prepare("INSERT INTO workspace_members(workspace_id,address,role,joined_at) VALUES(?,?,'Owner',?)").all(w,other,now);
 store.sqlite.prepare("WITH RECURSIVE n(x) AS (VALUES(100) UNION ALL SELECT x+1 FROM n WHERE x<147) INSERT INTO workspace_members(workspace_id,address,role,joined_at) SELECT ?,'0x'||printf('%040d',x),'Viewer',? FROM n").all(w,now);
 const target='0x'+'33'.repeat(20);
 store.sqlite.prepare('INSERT INTO accounts(account_id,address,chain_id,contract_address,created_at,updated_at) VALUES(?,?,?,?,?,?)').all('c',target,10143,env.CONTRACT_ADDRESS,now,now);
 store.sqlite.prepare('INSERT INTO account_sessions(token_hash,account_id,csrf_token,expires_at,created_at) VALUES(?,?,?,?,?)').all(await digest('3'.repeat(64)),'c',csrf,now+100000,now);
 const invite=await call(`workspaces/${w}/invitations`,'POST',{address:target,role:'Viewer'}),inviteId=(await invite.json() as any).invitation.id;
 const accept=()=>worker.fetch(new Request(`https://vault.example/api/workspaces/${w}/invitations/${inviteId}/accept`,{method:'POST',headers:{Origin:'https://vault.example',Cookie:'dv_session='+'3'.repeat(64),'x-csrf-token':csrf,'Content-Type':'application/json'},body:'{}'}),env);
 expect((await accept()).status).toBe(200);
 delete env.BILLING_MODE;
 const another='0x'+'44'.repeat(20);
 store.sqlite.prepare('INSERT INTO accounts(account_id,address,chain_id,contract_address,created_at,updated_at) VALUES(?,?,?,?,?,?)').all('d',another,10143,env.CONTRACT_ADDRESS,now,now);
 store.sqlite.prepare('INSERT INTO account_sessions(token_hash,account_id,csrf_token,expires_at,created_at) VALUES(?,?,?,?,?)').all(await digest('4'.repeat(64)),'d',csrf,now+100000,now);
 const next=await call(`workspaces/${w}/invitations`,'POST',{address:another,role:'Viewer'}),nextId=(await next.json() as any).invitation.id;
 const denied=await worker.fetch(new Request(`https://vault.example/api/workspaces/${w}/invitations/${nextId}/accept`,{method:'POST',headers:{Origin:'https://vault.example',Cookie:'dv_session='+'4'.repeat(64),'x-csrf-token':csrf,'Content-Type':'application/json'},body:'{}'}),env);
 expect(denied.status).toBe(409);expect(store.sqlite.prepare('SELECT COUNT(*) AS n FROM workspace_members WHERE workspace_id=?').all(w)).toEqual([{n:51}]);
 // Existing memberships remain readable above the free seat cap. New insertions fail closed.
 expect((await call(`workspaces/${w}/members`)).status).toBe(200);
 const privateBilling=await worker.fetch(new Request('https://vault.example/api/account/billing',{headers:{Cookie:'dv_session='+'2'.repeat(64)}}),env);
 expect(await privateBilling.json()).toMatchObject({plan:'free',invoices:[]});
});

it('persists authoritative downgrade before rejecting checkout',async()=>{
 await boundCustomer();provider();expect((await webhook(event())).status).toBe(200);
 provider(subscription('past_due'));
 expect((await call('account/billing/checkout','POST',{})).status).toBe(409);
 const row=await env.DB.prepare('SELECT * FROM billing_accounts WHERE account_id=?').bind('a').first<any>();
 expect(row.status).toBe('past_due');
});
it('invalidates cached grant on checkout price provider failure',async()=>{
 await boundCustomer();provider();expect((await webhook(event())).status).toBe(200);
 vi.stubGlobal('fetch',vi.fn(async()=>{throw Error('provider unavailable');}));
 expect((await call('account/billing/checkout','POST',{})).status).toBe(503);
 const row=await env.DB.prepare('SELECT * FROM billing_accounts WHERE account_id=?').bind('a').first<any>();
 expect(row.verified_at).toBe(0);
});

it('persists no-subscription evidence before reusing a pending checkout',async()=>{
 await boundCustomer();provider();expect((await webhook(event())).status).toBe(200);
 await env.DB.prepare('UPDATE billing_accounts SET checkout_url=?,checkout_expires=?').bind('https://checkout.stripe.com/c/pay/existing',Date.now()+60000).run();
 provider();const network=vi.mocked(fetch),original=network.getMockImplementation()!;
 network.mockImplementation(async(input,init)=>new URL(String(input)).pathname==='/v1/subscriptions'?Response.json({data:[],has_more:false}):original(input,init));
 expect(await (await call('account/billing/checkout','POST',{})).json()).toMatchObject({status:'pending'});
 expect(store.sqlite.prepare('SELECT status,period_end FROM billing_accounts').all()).toEqual([{status:'none',period_end:0}]);
 expect(await env.DB.prepare(`SELECT ${accountQuotaSql(env,'savedQuestions','a')} AS cap`).first()).toEqual({cap:50});
});
it.each(['subscriptions','checkout/sessions','billing_portal/sessions'])('invalidates paid evidence on provider failure at %s',async(failure)=>{
 await boundCustomer();provider();expect((await webhook(event())).status).toBe(200);
 provider();const network=vi.mocked(fetch),original=network.getMockImplementation()!;
 network.mockImplementation(async(input,init)=>{
  const path=new URL(String(input)).pathname;
  if(path==='/v1/'+failure)throw Error('provider unavailable');
  if(path==='/v1/subscriptions')return Response.json({data:[],has_more:false});
  return original(input,init);
 });
 expect((await call('account/billing/'+(failure==='billing_portal/sessions'?'portal':'checkout'),'POST',{})).status).toBe(503);
 expect(store.sqlite.prepare('SELECT verified_at FROM billing_accounts').all()).toEqual([{verified_at:0}]);
 expect(await env.DB.prepare(`SELECT ${accountQuotaSql(env,'savedQuestions','a')} AS cap`).first()).toEqual({cap:50});
});
it.each(['checkout','portal'])('fences failed %s provider calls from newer evidence',async(action)=>{
 await boundCustomer();provider();expect((await webhook(event())).status).toBe(200);
 const newer=Date.now()+1;
 vi.stubGlobal('fetch',vi.fn(async()=>{
  await env.DB.prepare("UPDATE billing_accounts SET lease_token='new-owner',lease_until=?,verified_at=?").bind(Date.now()+30000,newer).run();
  throw Error('old provider failure');
 }));
 expect((await call('account/billing/'+action,'POST',{})).status).toBe(503);
 expect(store.sqlite.prepare('SELECT lease_token,verified_at FROM billing_accounts').all()).toEqual([{lease_token:'new-owner',verified_at:newer}]);
});
it.each([
 {age:899999,period:1000000501,cap:60},
 {age:900000,period:1000000501,cap:50},
 {age:900499,period:1000000501,cap:50},
 {age:-1000,period:1000000501,cap:60},
 {age:-1001,period:1000000501,cap:50},
 {age:0,period:1000000500,cap:50},
])('uses precise quota evidence boundaries $age and period $period',async({age,period,cap})=>{
 await boundCustomer();provider();expect((await webhook(event())).status).toBe(200);
 await env.DB.prepare('UPDATE billing_accounts SET verified_at=?,period_end=?').bind(1000000500-age,period).run();
 const sql=accountQuotaSql(env,'savedQuestions','a').replaceAll("julianday('now')",'(2440587.5+1000000.5/86400)');
 expect(await env.DB.prepare(`SELECT ${sql} AS cap`).first()).toEqual({cap});
});
