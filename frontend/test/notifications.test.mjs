import assert from 'node:assert/strict';
import {test} from 'node:test';
import React from 'react';
import {renderToString} from 'react-dom/server';
import {createServer} from 'vite';
test('inbox presents sign-in, safe exact-wei items and empty state',async()=>{
 const vite=await createServer({optimizeDeps:{noDiscovery:true},server:{middlewareMode:true},appType:'custom',logLevel:'silent'});try{
 let module={};try{module=await vite.ssrLoadModule('/src/production/Notifications.tsx');}catch{}
 assert.equal(typeof module.InboxView,'function');
 const render=props=>renderToString(React.createElement(module.InboxView,props));
 assert.match(render({signedIn:false,items:[],loading:false,error:'',onSignIn(){}}),/Sign in/);
 assert.match(render({signedIn:true,items:[],loading:false,error:''}),/No notifications/);
 const html=render({signedIn:true,items:[{id:1,type:'payout_settled',sourceId:'0x'+'ab'.repeat(32),collectionId:'0x'+'cd'.repeat(32),collectionName:'Name',amountWei:'9007199254740993001',createdAt:1,readAt:null}],loading:false,error:'',onRead(){}});
 assert.match(html,/9007199254740993001 wei/);assert.match(html,/Mark read/);assert.match(html,/\/collections\/0x/);assert.match(html,/Payout settled/);
 assert.match(render({signedIn:true,items:[],loading:false,error:'Unavailable',onRetry(){}}),/Retry/);
 }finally{await vite.close();}
});
