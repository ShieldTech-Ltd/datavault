import { afterEach, beforeEach, expect, it } from 'vitest';
import worker from '../index';
import { sqliteD1 } from './sqlite-d1';
import { digest } from '../lib/account-session';
import type { Env } from '../lib/types';
let store: ReturnType<typeof sqliteD1>, env: Env;
const address='0x'+'11'.repeat(20), contract='0x'+'ab'.repeat(20), id='0x'+'cd'.repeat(32), token='aa'.repeat(32), csrf='bb'.repeat(32);
const account='10143:'+contract+':'+address;
beforeEach(async()=>{store=sqliteD1();env={DB:store.db,CHAIN_ID:'10143',CONTRACT_ADDRESS:contract} as Env;
store.sqlite.prepare('INSERT INTO accounts(account_id,address,chain_id,contract_address,created_at,updated_at) VALUES(?,?,?,?,?,?)').all(account,address,10143,contract,Date.now(),Date.now());
store.sqlite.prepare('INSERT INTO account_sessions(token_hash,account_id,csrf_token,expires_at,created_at) VALUES(?,?,?,?,?)').all(await digest(token),account,csrf,Date.now()+100000,Date.now());
store.sqlite.prepare("INSERT INTO collections(collection_id,owner_address,collection_name,content_hash,created_at,status,chain_id,contract_address) VALUES(?,?,?,?,?,'confirmed',?,?)").all(id,address,'Guide',id,Date.now(),10143,contract);
});
afterEach(()=>store.close());
const call=(path:string,method='GET',body?:unknown,auth=true,csrfValue=csrf)=>worker.fetch(new Request('https://vault.example/api/account/'+path,{method,headers:{Origin:'https://vault.example','Content-Type':'application/json',Cookie:auth?'dv_session='+token:'','x-csrf-token':csrfValue},...(body===undefined?{}:{body:JSON.stringify(body)})}),env);
it('requires session, CSRF and explicit per-save opt-in',async()=>{
expect((await call('saved-questions','POST',{collectionId:id,question:'private',optIn:true},false)).status).toBe(401);
expect((await call('saved-questions','POST',{collectionId:id,question:'private',optIn:true},true,'')).status).toBe(403);
for(const input of [{collectionId:id,question:'private'}, {collectionId:id,question:'x'.repeat(1001),optIn:true},{collectionId:id,question:'private',optIn:true,extra:1}])expect((await call('saved-questions','POST',input)).status).toBe(400);
expect((await call('saved-questions','POST',{collectionId:id,question:'private',optIn:true})).status).toBe(201);
});
it('idempotently bookmarks confirmed deployment collections and paginates privately',async()=>{
expect((await call('bookmarks','POST',{collectionId:id})).status).toBe(201);expect((await call('bookmarks','POST',{collectionId:id})).status).toBe(201);
const data=await (await call('bookmarks?limit=1')).json() as any;expect(data.items).toHaveLength(1);expect(data.nextCursor).toBeNull();
expect((await call('bookmarks?limit=51')).status).toBe(400);expect((await call('bookmarks','POST',{collectionId:'0x'+'ef'.repeat(32)})).status).toBe(404);
const removed=await call('bookmarks/'+data.items[0].id,'DELETE',{});expect(removed.status).toBe(200);expect((await (await call('bookmarks')).json() as any).items).toEqual([]);
expect((await call('bookmarks/'+data.items[0].id,'DELETE',{question:'do not accept extra text'})).status).toBe(400);
});
it('caps concurrent saves atomically, excludes expired rows and exports only own active items',async()=>{
for(let n=0;n<49;n++)store.sqlite.prepare('INSERT INTO account_saved_questions(account_id,collection_id,question,created_at,expires_at) VALUES(?,?,?,?,?)').all(account,id,'item'+n,Date.now(),Date.now()+86400000);
const responses=await Promise.all([1,2].map(n=>call('saved-questions','POST',{collectionId:id,question:'last'+n,optIn:true})));expect(responses.map(r=>r.status).sort()).toEqual([201,409]);
store.sqlite.prepare('UPDATE account_saved_questions SET expires_at=0 WHERE question=?').all('item0');
store.sqlite.prepare('INSERT INTO account_saved_questions(account_id,collection_id,question,created_at,expires_at) VALUES(?,?,?,?,?)').all('other',id,'other wallet secret',Date.now(),Date.now()+86400000);
const data=await (await call('saved-questions?limit=1')).json() as any;expect(data.items).toHaveLength(1);expect(data.nextCursor).toBeTruthy();
const exported=await (await call('export')).json() as any;expect(exported.savedQuestions).toHaveLength(49);expect(JSON.stringify(exported)).not.toContain('other wallet secret');expect(JSON.stringify(exported)).not.toContain('item0');
expect((await call('saved-questions/'+data.items[0].id,'DELETE',{})).status).toBe(200);
});
