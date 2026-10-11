import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
test('official Stripe SDK executes bounded no-follow transport and async WebCrypto verification in workerd',async()=>{
 const bundle=await build({stdin:{contents:`
 import Stripe from 'stripe';
 import {billingFetch,providerPrice,stripeClient} from './src/lib/stripe-provider.ts';
 import {FREE_LIMITS} from './src/lib/entitlements.ts';
 export default {async fetch(){
  const env={BILLING_MODE:'test',STRIPE_SECRET_KEY:'sk_test_'+'a'.repeat(24),STRIPE_WEBHOOK_SECRET:'whsec_'+'b'.repeat(24),STRIPE_PRICE_ID:'price_test',PUBLIC_ORIGIN:'https://vault.example',BILLING_LIMITS:JSON.stringify(FREE_LIMITS)};
  const raw=JSON.stringify({id:'evt_test',livemode:false}),t=Math.floor(Date.now()/1000);
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.STRIPE_WEBHOOK_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const sig=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(t+'.'+raw))),n=>n.toString(16).padStart(2,'0')).join('');
  const event=await stripeClient(env).webhooks.constructEventAsync(raw,'t='+t+',v1='+sig,env.STRIPE_WEBHOOK_SECRET,300,Stripe.createSubtleCryptoProvider());
  let manual=false,calls=0;
  globalThis.fetch=async(url,init)=>{calls++;manual=init.redirect==='manual';return Response.json({id:'price_test',active:true,livemode:false,type:'recurring',currency:'jpy',unit_amount:1200,recurring:{interval:'month',interval_count:1,usage_type:'licensed'}});};
  const price=await providerPrice(env);
  globalThis.fetch=async(url,init)=>{calls++;manual=manual&&init.redirect==='manual';return new Response('',{status:307,headers:{Location:'https://evil.example'}});};
  let redirect=false,host=false;
  try{await billingFetch('https://api.stripe.com/v1/prices/price_test');}catch{redirect=true;}
  try{await billingFetch('https://evil.example/v1/prices/price_test');}catch{host=true;}
  return Response.json({signature:event.id==='evt_test',price:price.amount,manual,redirect,host,calls});
 }};`,resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'browser',conditions:['worker'],target:'es2022'});
 const mf=new Miniflare({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2024-10-01'});
 try{const response=await mf.dispatchFetch('https://fixture.example/');assert.equal(response.status,200);assert.deepEqual(await response.json(),{signature:true,price:1200,manual:true,redirect:true,host:true,calls:2});}
 finally{await mf.dispose();}
});
