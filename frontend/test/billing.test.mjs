import assert from 'node:assert/strict';
import {test} from 'node:test';
import React from 'react';
import {renderToString} from 'react-dom/server';
import {MemoryRouter} from 'react-router';
import {createServer} from 'vite';
const setup=()=>createServer({optimizeDeps:{noDiscovery:true},server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
test('billing view uses actual currency exponents and truthful disabled configuration',async()=>{
 const vite=await setup();try{
  let module={};try{module=await vite.ssrLoadModule('/src/production/Billing.tsx');}catch{}
  assert.equal(typeof module.BillingView,'function','Billing view must present provider state');
  assert.equal(module.formatBillingAmount(1200,'jpy'),'JP¥1,200');
  assert.equal(module.formatBillingAmount(1234,'usd'),'US$12.34');
  assert.match(module.formatBillingAmount(1234,'kwd'),/^KWD\s1\.234$/);
  assert.match(module.formatBillingAmount(500,'isk'),/^ISK\s5$/);
  assert.match(module.formatBillingAmount(500,'ugx'),/^UGX\s5$/);
  const disabled=renderToString(React.createElement(MemoryRouter,null,React.createElement(module.BillingView,{data:{available:false,plan:'free',limits:{activeKeys:5,ownedWorkspaces:5,workspaceMembers:50,importsPerDay:20,savedQuestions:50,uploadBytes:2097152},invoices:[]},busy:false,onAction:()=>{},onRefresh:()=>{}})));
  assert.match(disabled,/Subscriptions are unavailable/);assert.match(disabled,/Wallet query payments continue/);assert.doesNotMatch(disabled,/£|\$|sample invoice|Upgrade to Pro/);
  const pending=renderToString(React.createElement(MemoryRouter,null,React.createElement(module.BillingView,{data:{available:true,mode:'test',plan:'free',price:{amount:1200,currency:'jpy',interval:'month',intervalCount:1},limits:{},invoices:[],subscription:{status:'past_due',periodEnd:1,cancelAtPeriodEnd:false,fresh:true}},pending:true,busy:false,onAction:()=>{},onRefresh:()=>{}})));
  assert.match(pending,/JP¥1,200/);assert.match(pending,/Pending verification/);assert.match(pending,/past_due/);assert.match(pending,/Test mode/);
 }finally{await vite.close();}
});
test('billing responses and redirects are fenced when wallets switch',async()=>{
 const vite=await setup();try{
  const {AccountClient}=await vite.ssrLoadModule('/src/production/account-client.ts');
  const a='0x'+'11'.repeat(20),b='0x'+'22'.repeat(20);
  const session=address=>({account:{address,displayName:'',locale:'en-GB',notificationPreferences:{inApp:true,email:false},createdAt:1,updatedAt:1},csrfToken:'a'.repeat(64),expiresAt:new Date(Date.now()+86400000).toISOString()});
  let resolve;
  const network=async(url,init)=>url==='/api/auth/logout'?new Response(null,{status:204}):url==='/api/account'?Response.json(session(a)):new Promise(r=>{resolve=r;});
  const client=new AccountClient(10143,'0x'+'ab'.repeat(20),network);
  await client.setWallet({address:a},true);assert.equal(typeof client.billing,'function');assert.equal(typeof client.billingAction,'function');
  const pending=client.billing();await new Promise(r=>setImmediate(r));await client.setWallet({address:b},true);
  resolve(Response.json({available:true,plan:'pro',invoices:[{url:'https://invoice.stripe.com/private'}]}));assert.equal(await pending,null);
  await client.setWallet({address:a},true);
  const redirect=client.billingAction('checkout');await new Promise(r=>setImmediate(r));await client.setWallet(null,false);
  resolve(Response.json({status:'pending',url:'https://checkout.stripe.com/c/test'}));assert.equal(await redirect,null);
 }finally{await vite.close();}
});
