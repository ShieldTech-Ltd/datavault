import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const cacheDir=join(tmpdir(),'datavault-analytics-tests-'+process.pid);
import React from 'react';
import { renderToString } from 'react-dom/server';
import Renderer from 'react-test-renderer';
test('public resource hides old window immediately and rejects a delayed superseded response',async()=>{
 const vite=await createServer({cacheDir,optimizeDeps:{noDiscovery:true},server:{middlewareMode:true},appType:'custom',logLevel:'silent'});const originalFetch=globalThis.fetch;
 try{const {useResource}=await vite.ssrLoadModule('/src/production/data.tsx');let value,release;
 globalThis.fetch=async path=>path==='/old'?new Response('{"label":"old"}'):await new Promise(resolve=>{release=()=>resolve(new Response('{"label":"new"}'));});
 function Probe({path}){value=useResource(path);return React.createElement('span',null,value.data?.label??'empty');}
 let view;await Renderer.act(async()=>{view=Renderer.create(React.createElement(Probe,{path:'/old'}));});assert.equal(value.data.label,'old');
 view.update(React.createElement(Probe,{path:'/new'}));assert.equal(view.toJSON().children[0],'empty','Old-window data must be hidden in the first render before effects');
 await Renderer.act(async()=>{});await Renderer.act(async()=>{view.update(React.createElement(Probe,{path:null}));});release();await Renderer.act(async()=>{});assert.equal(value.data,null);view.unmount();
 }finally{globalThis.fetch=originalFetch;await vite.close();}
});
test('analytics displays real UTC controls and query offers private saved-item form actions',async()=>{
 const vite=await createServer({cacheDir,optimizeDeps:{noDiscovery:true},server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
 try{const {default:App}=await vite.ssrLoadModule('/src/App.tsx');const {WalletProvider}=await vite.ssrLoadModule('/src/lib/wallet.tsx');
 globalThis.window={location:{pathname:'/analytics',search:''}};let html=renderToString(React.createElement(WalletProvider,null,React.createElement(App)));assert.match(html,/Start date \(UTC\)/);assert.match(html,/exclusive/);
 globalThis.window={location:{pathname:'/query',search:''}};html=renderToString(React.createElement(WalletProvider,null,React.createElement(App)));assert.match(html,/Saved questions/);assert.match(html,/30 days/);
 }finally{delete globalThis.window;await vite.close();}
});
test('dated signed loads fence delayed wallet/window changes and CSV',async()=>{
 const vite=await createServer({cacheDir,optimizeDeps:{noDiscovery:true},server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
 try {
  const { SignedAnalyticsClient }=await vite.ssrLoadModule('/src/production/analytics-client.ts');
  let current='A',release,calls=0;
  const wallet={address:'0x'+'11'.repeat(20),getWalletClient:async()=>({getChainId:async()=>31337,signMessage:async()=>{await new Promise(resolve=>{release=resolve;});return 'sig';}})};
  const client=new SignedAnalyticsClient(31337,'0x'+'ab'.repeat(20),async()=>{calls++;return new Response('{}');});
  const pending=client.read(wallet,{start:'2026-10-01',end:'2026-10-10'},()=>current==='A');
  await new Promise(resolve=>setImmediate(resolve));current='B';release();assert.equal(await pending,null);assert.equal(calls,0);
  const immediate={...wallet,getWalletClient:async()=>({getChainId:async()=>31337,signMessage:async()=> 'sig'})};
  let url;const exporting=new SignedAnalyticsClient(31337,'0x'+'ab'.repeat(20),async path=>{url=path;return new Response('"Amount wei"\r\n"1"',{headers:{'Content-Type':'text/csv'}})});
  assert.ok(await exporting.read(immediate,{start:'2026-10-01',end:'2026-10-10'},()=>true,true));assert.match(url,/analytics\/export/);assert.match(url,/start=2026-10-01&end=2026-10-10/);
 } finally{await vite.close();}
});
test('workspace rejects delayed old-owner analytics and window changes during signing',async()=>{
 const vite=await createServer({cacheDir,optimizeDeps:{noDiscovery:true},server:{middlewareMode:true},appType:'custom',logLevel:'silent'});const originalFetch=globalThis.fetch;
 try {
 const {WalletProvider}=await vite.ssrLoadModule('/src/lib/wallet.tsx'),{WorkspaceProvider,useWorkspace}=await vite.ssrLoadModule('/src/production/data.tsx'),{monadTestnet}=await vite.ssrLoadModule('/src/lib/network.ts');
 const a='0x'+'11'.repeat(20),b='0x'+'22'.repeat(20),events={};let address=a,release,releaseSign,workspace,requests=0,delaySign=false;
 globalThis.window={ethereum:{on:(name,callback)=>events[name]=callback,removeListener:()=>{},request:async({method})=>method==='eth_accounts'?[address]:method==='eth_chainId'?'0x'+monadTestnet.chainId.toString(16):method==='personal_sign'?(delaySign?await new Promise(resolve=>{releaseSign=()=>resolve('0x'+'ab'.repeat(65));}):'0x'+'ab'.repeat(65)):null}};
 globalThis.fetch=async()=>{requests++;return await new Promise(resolve=>{release=()=>resolve(new Response(JSON.stringify({ownerAddress:a,periodDays:1,windowStart:'2026-10-08T00:00:00.000Z',windowEnd:'2026-10-09T00:00:00.000Z',aggregationLimit:10000,failureTimeField:'created_at',failedQueries:0,refundedQueries:0,daily:[{date:'2026-10-08',settledQueries:0,failedQueries:0,refundedQueries:0,knownAmounts:0,recordedRevenueWei:'0'}],confirmedCollections:0,paidQueries:0,recordedRevenueWei:'0',revenueCoverage:{knownAmounts:0,settledQueries:0},rankingAvailable:true,topCollections:[],recentActivity:[]})));});};
 function Probe(){workspace=useWorkspace();return React.createElement('span',null,workspace.analytics.data?.ownerAddress??'empty');}
 let view;await Renderer.act(async()=>{view=Renderer.create(React.createElement(WalletProvider,null,React.createElement(WorkspaceProvider,null,React.createElement(Probe))));});
 await Renderer.act(async()=>workspace.setWindow({start:'2026-10-08',end:'2026-10-09'}));
 let pending;await Renderer.act(async()=>{pending=workspace.load('analytics');await new Promise(resolve=>setImmediate(resolve));});assert.equal(requests,1);
 await Renderer.act(async()=>{address=b;events.accountsChanged([b]);});release();await Renderer.act(async()=>pending);assert.equal(workspace.analytics.data,null);
 delaySign=true;await Renderer.act(async()=>{pending=workspace.load('analytics');await new Promise(resolve=>setImmediate(resolve));});
 await Renderer.act(async()=>workspace.setWindow({start:'2026-10-07',end:'2026-10-09'}));releaseSign();await Renderer.act(async()=>pending);assert.equal(requests,1,'Window change while signing prevents request dispatch');assert.equal(workspace.analytics.data,null);view.unmount();
 }finally{globalThis.fetch=originalFetch;delete globalThis.window;await vite.close();}
});
test('saved questions require explicit opt-in and fence delayed private list after wallet change',async()=>{
 const vite=await createServer({cacheDir,optimizeDeps:{noDiscovery:true},server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
 try {
  const { AccountClient }=await vite.ssrLoadModule('/src/production/account-client.ts');
  let release;const address='0x'+'11'.repeat(20);const session={account:{address,displayName:'',locale:'en-GB',notificationPreferences:{inApp:true,email:false},createdAt:1,updatedAt:1},csrfToken:'ab'.repeat(32),expiresAt:new Date(Date.now()+86400000).toISOString()};
  const client=new AccountClient(31337,'0x'+'ab'.repeat(20),async(path,init)=>{if(path==='/api/account')return new Response(JSON.stringify(session));if(path.includes('saved-questions')&&init.method==='POST'){assert.equal(JSON.parse(init.body).optIn,true);assert.equal(init.headers['x-csrf-token'],session.csrfToken);return new Response('{"saved":true}');}if(path.includes('saved-questions'))return await new Promise(resolve=>{release=()=>resolve(new Response('{"items":[{"question":"secret"}],"nextCursor":null}'));});return new Response(null,{status:204});});
  await client.setWallet({address},true);assert.equal(await client.saveQuestion('id','private',false),null);assert.ok(await client.saveQuestion('id','private',true));
  const pending=client.savedItems('saved-questions');await new Promise(resolve=>setImmediate(resolve));await client.setWallet(null,false);release();assert.equal(await pending,null);
 }finally{await vite.close();}
});
test('saved-item selection cannot interrupt quoting, payment or recovery',async()=>{
 const vite=await createServer({cacheDir,optimizeDeps:{noDiscovery:true},server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
 try{const {savedQuestionMayFill}=await vite.ssrLoadModule('/src/production/SavedItems.tsx');for(const step of ['quoting','awaiting_wallet','confirming_open','answering','settlement_pending','failed'])assert.equal(savedQuestionMayFill(step),false);for(const step of ['idle','quoted','done'])assert.equal(savedQuestionMayFill(step),true);}finally{await vite.close();}
});
