import Stripe from 'stripe';
import {billingConfig} from './entitlements';
import type {Env} from './types';
export const STRIPE_API_VERSION='2026-09-30.endive';
const DEADLINE=8000,MAX_BODY=512*1024;
export async function billingFetch(input:RequestInfo|URL,init?:RequestInit):Promise<Response>{
 const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
 if(url.origin!=='https://api.stripe.com'||url.username||url.password||!url.pathname.startsWith('/v1/'))throw Error('Billing transport rejected');
 const abort=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
 const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{abort.abort();reject(Error('Billing deadline'));},DEADLINE);});
 let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
 try{
  const response=await Promise.race([fetch(url.href,{...init,redirect:'manual',signal:abort.signal}),deadline]);
  if(response.status>=300&&response.status<400){void response.body?.cancel().catch(()=>{});throw Error('Billing redirect rejected');}
  if(Number(response.headers.get('content-length')??0)>MAX_BODY){void response.body?.cancel().catch(()=>{});throw Error('Billing response too large');}
  reader=response.body?.getReader();const chunks:Uint8Array[]=[];let total=0;
  if(reader)while(true){const part=await Promise.race([reader.read(),deadline]);if(part.done)break;total+=part.value.byteLength;if(total>MAX_BODY)throw Error('Billing response too large');chunks.push(part.value);}
  const body=new Uint8Array(total);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.length;}
  return new Response(body,{status:response.status,headers:response.headers});
 }finally{clearTimeout(timer);abort.abort();if(reader)void reader.cancel().catch(()=>{});}
}
export function stripeClient(env:Env){const config=billingConfig(env);if(!config)throw Error('Billing unavailable');return new Stripe(config.secret,{apiVersion:STRIPE_API_VERSION,maxNetworkRetries:0,timeout:DEADLINE,httpClient:Stripe.createFetchHttpClient(billingFetch as typeof fetch)});}
export async function providerPrice(env:Env){const config=billingConfig(env)!;const p=await stripeClient(env).prices.retrieve(config.price);if(p.id!==config.price||p.livemode!==false||!p.active||p.type!=='recurring'||p.recurring?.usage_type!=='licensed'||!Number.isSafeInteger(p.unit_amount)||p.unit_amount!<=0||!/^\w{3}$/.test(p.currency)||!['day','week','month','year'].includes(p.recurring.interval)||!Number.isSafeInteger(p.recurring.interval_count)||p.recurring.interval_count<1)throw Error('Billing price unavailable');return {amount:p.unit_amount!,currency:p.currency,interval:p.recurring.interval,intervalCount:p.recurring.interval_count};}
export function providerLink(value:unknown,host:'checkout.stripe.com'|'billing.stripe.com'|'invoice.stripe.com'):string|null{try{if(typeof value!=='string'||value.length>4096)return null;const url=new URL(value);return url.protocol==='https:'&&url.hostname===host&&!url.port&&!url.username&&!url.password?url.href:null;}catch{return null;}}
