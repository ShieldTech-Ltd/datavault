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
 assert.match(html, /class="dv-button secondary dv-notification-action"[^>]*>Mark read/);
 assert.match(html, /class="dv-notification-time"/);
 assert.match(html, /class="dv-notification-link"/);
 assert.match(render({signedIn:true,items:[],loading:false,error:'Unavailable',onRetry(){}}),/Retry/);
 }finally{await vite.close();}
});
import renderer,{act} from 'react-test-renderer';
test('opening inbox after a confirmed event refreshes an initially empty read without reload',async()=>{
 let confirmed=false,reads=0,component;
 const priorFetch=globalThis.fetch;
 globalThis.__notificationAccount={state:{session:{account:{address:'0x'+'11'.repeat(20)},csrfToken:'csrf'},error:''},client:{signIn:async()=>{}}};
 globalThis.fetch=async()=>{reads++;return new Response(JSON.stringify({items:confirmed?[{id:1,type:'collection_registered',sourceId:'tx',collectionId:'c',collectionName:'Confirmed collection',amountWei:null,createdAt:1,readAt:null}]:[],unreadCount:confirmed?1:0,nextCursor:null}));};
 const vite=await createServer({optimizeDeps:{noDiscovery:true},server:{middlewareMode:true},appType:'custom',logLevel:'silent',plugins:[{name:'account-fixture',enforce:'pre',transform(code,id){if(id.endsWith('/src/production/account.tsx'))return 'export function useAccount(){return globalThis.__notificationAccount;}';}}]});
 try{
 const {default:Notifications}=await vite.ssrLoadModule('/src/production/Notifications.tsx');
 await act(async()=>{component=renderer.create(React.createElement(Notifications));});
 assert.equal(reads,1);
 confirmed=true;
 await act(async()=>{component.root.findByProps({'aria-controls':'notification-inbox'}).props.onClick();});
 assert.match(JSON.stringify(component.toJSON()),/Confirmed collection/);
 assert.equal(reads,2);
 const refreshButton=component.root.findAllByType('button').find(button=>button.children.includes('Refresh'));
 assert.ok(refreshButton);
 assert.equal(refreshButton.props.className,'dv-button secondary dv-notification-action');
 }finally{component?.unmount();globalThis.fetch=priorFetch;delete globalThis.__notificationAccount;await vite.close();}
});
