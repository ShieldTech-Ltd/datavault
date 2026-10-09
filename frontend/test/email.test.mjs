import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { createServer } from 'vite';
test('email deep links offer explicit confirmation without link-GET consumption',async()=>{
 const vite=await createServer({optimizeDeps:{noDiscovery:true},server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
 try{
 const {default:App}=await vite.ssrLoadModule('/src/App.tsx');const {WalletProvider}=await vite.ssrLoadModule('/src/lib/wallet.tsx');
 for(const [path,label] of [['/settings/email-verify','Confirm your email'],['/settings/email-unsubscribe','Confirm unsubscribe']]){
 globalThis.window={location:{pathname:path,search:'',hash:'#token=test-only'}};
 const html=renderToString(React.createElement(WalletProvider,null,React.createElement(App)));
 assert.match(html,new RegExp(label));assert.match(html,/href="\/settings"/);assert.doesNotMatch(html,/test-only/);
 }
 }finally{delete globalThis.window;await vite.close();}
});
test('email client uses session CSRF and supports explicit verified consent',async()=>{
 const vite=await createServer({optimizeDeps:{noDiscovery:true},server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
 try{
 const {AccountClient}=await vite.ssrLoadModule('/src/production/account-client.ts');const address='0x'+'11'.repeat(20),csrf='ab'.repeat(32);
 const session={account:{address,displayName:'',locale:'en-GB',notificationPreferences:{inApp:true,email:true},email:{verifiedEmail:'fake@example.test',verifiedAt:1},createdAt:1,updatedAt:1},csrfToken:csrf,expiresAt:new Date(Date.now()+86400000).toISOString()};
 const calls=[];const client=new AccountClient(31337,'0x'+'ab'.repeat(20),async(url,init)=>{calls.push([url,init]);return new Response(JSON.stringify(url==='/api/account'?session:{status:'verified'}));});
 await client.setWallet({address,getWalletClient:async()=>({getChainId:async()=>31337})},true);assert.equal(client.state.session?.account.notificationPreferences.email,true);
 assert.equal(typeof client.verifyEmail,'function');await client.verifyEmail('test-token');const request=calls.find(([url])=>url==='/api/account/email/verify');assert.equal(request[1].headers['x-csrf-token'],csrf);assert.deepEqual(JSON.parse(request[1].body),{token:'test-token'});
 }finally{await vite.close();}
});
