import { expect, it } from 'vitest';
import worker from '../index';
import { sqliteD1 } from './sqlite-d1';
import type { Env } from '../lib/types';
it('requires independent observations and rejects unauthorized ingestion', async () => {
 const store = sqliteD1();
 try {
 const env = {DB:store.db, CHAIN_ID:'31337', CONTRACT_ADDRESS:'0x'+'ab'.repeat(20), MONITOR_SECRET:'x'.repeat(32)} as Env;
 const status = await worker.fetch(new Request('https://vault.example/api/status'), env);
 expect(status.status).toBe(200);
 expect((await status.json() as any).availabilityPercent).toBe(null);
 const denied = await worker.fetch(new Request('https://vault.example/api/status/observations',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}),env);
 expect(denied.status).toBe(401);
 } finally {store.close();}
});
it('atomically emits a private-safe event when registration becomes confirmed', async () => {
 const store=sqliteD1(); try {
 await store.db.prepare(`INSERT INTO collections(collection_id,owner_address,collection_name,content_hash,created_at,status,chain_id,contract_address) VALUES ('c','owner','Name','secret',1,'staging',31337,'contract')`).run();
 await store.db.prepare(`UPDATE collections SET status='confirmed',confirmed_tx='tx' WHERE collection_id='c'`).run();
 const rows=await store.db.prepare('SELECT * FROM notification_events').all();
 expect(rows.results).toHaveLength(1);
 expect(JSON.stringify(rows.results)).not.toContain('secret');
 await store.db.prepare(`UPDATE collections SET status='confirmed' WHERE collection_id='c'`).run();
 expect((await store.db.prepare('SELECT * FROM notification_events').all()).results).toHaveLength(1);
 } finally {store.close();}
});
it('keeps failure samples distinct from missing coverage and rejects invalid intervals', async () => {
 const store=sqliteD1();try{
 const env={DB:store.db,CHAIN_ID:'31337',CONTRACT_ADDRESS:'0x'+'ab'.repeat(20),MONITOR_SECRET:'x'.repeat(32)} as Env;
 const end=Math.floor(Date.now()/300000)*300000;
 const get=async()=>await (await worker.fetch(new Request('https://vault.example/api/status'),env)).json() as any;
 const submit=(samples:any[],secret=env.MONITOR_SECRET)=>worker.fetch(new Request('https://vault.example/api/status/observations',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${secret}`},body:JSON.stringify({samples})}),env);
 expect((await submit([{component:'model',status:'up',timestamp:end}])).status).toBe(400);
 expect((await submit([{component:'worker_api',status:'up',timestamp:end+300000}])).status).toBe(400);
 expect((await submit([{component:'worker_api',status:'up',timestamp:end-1}])).status).toBe(400);
 for(let i=0;i<250;i+=50)expect((await submit(Array.from({length:50},(_,j)=>({component:'worker_api',status:i+j===0?'down':'up',timestamp:end-300000*(250-i-j)})))).status).toBe(200);
 const status=await get();expect(status.validSamples).toBe(250);expect(status.coverage).toBeCloseTo(250/288);expect(status.availabilityPercent).toBeCloseTo(99.6);
 expect((await submit([{component:'worker_api',status:'up',timestamp:end-300000}])).status).toBe(409);
 await store.db.prepare('DELETE FROM service_observations WHERE sample_at<?').bind(end-300000*20).run();
 const missing=await get();expect(missing.validSamples).toBe(20);expect(missing.availabilityPercent).toBe(null);expect(missing.status).toBe('unknown');
 }finally{store.close();}
});
it('health checks only operational D1 and fixed R2 connectivity', async()=>{
 const store=sqliteD1();try{
 const keys:string[]=[];
 const env={DB:store.db,CHAIN_ID:'31337',CONTRACT_ADDRESS:'0x'+'ab'.repeat(20),COLLECTION_STORE:{head:async(key:string)=>{keys.push(key);return null;}}} as unknown as Env;
 const response=await worker.fetch(new Request('https://vault.example/api/health'),env);expect(response.status).toBe(200);
 expect(await response.json()).toMatchObject({model:'not_monitored',payment:'not_monitored',components:{d1:true,r2:true}});expect(keys).toEqual(['__datavault_health_probe__']);
 env.COLLECTION_STORE={head:async()=>{throw Error('secret');}} as unknown as R2Bucket;
 const failure=await worker.fetch(new Request('https://vault.example/api/health'),env);expect(failure.status).toBe(503);expect(await failure.text()).not.toContain('secret');
 }finally{store.close();}
});
it('bounds operational probes at the Worker entry quota',async()=>{
 const store=sqliteD1();try{
 let heads=0;const env={DB:store.db,CHAIN_ID:'31337',CONTRACT_ADDRESS:'0x'+'ab'.repeat(20),COLLECTION_STORE:{head:async()=>{heads++;return null;}}} as unknown as Env;
 for(let i=0;i<30;i++)expect((await worker.fetch(new Request('https://vault.example/api/health'),env)).status).toBe(200);
 expect((await worker.fetch(new Request('https://vault.example/api/health'),env)).status).toBe(429);expect(heads).toBe(30);
 }finally{store.close();}
});
import { consumeNotifications, reconcileNotifications } from '../lib/notifications';
it('recovers historical confirmed events and duplicate inbox delivery after emit crash',async()=>{
 const store=sqliteD1();try{
 const env={DB:store.db,CHAIN_ID:'31337',CONTRACT_ADDRESS:'0x'+'ab'.repeat(20)} as Env;
 const address='0x'+'11'.repeat(20),account_id=`31337:${env.CONTRACT_ADDRESS}:${address}`;
 await store.db.prepare(`INSERT INTO accounts(account_id,address,chain_id,contract_address,created_at,updated_at) VALUES (?,?,31337,?,1,1)`).bind(account_id,address,env.CONTRACT_ADDRESS).run();
 await store.db.prepare(`INSERT INTO collections(collection_id,owner_address,collection_name,content_hash,created_at,status,confirmed_tx,chain_id,contract_address) VALUES ('historical',?,'Safe name','PRIVATE SOURCE',1,'confirmed','historical_tx',31337,?)`).bind(address,env.CONTRACT_ADDRESS).run();
 await reconcileNotifications(env);await reconcileNotifications(env);
 expect((await store.db.prepare('SELECT * FROM notification_events').all()).results).toHaveLength(1);
 const account=await store.db.prepare('SELECT * FROM accounts WHERE account_id=?').bind(account_id).first<any>();
 await consumeNotifications(env,account);await consumeNotifications(env,account);
 expect((await store.db.prepare('SELECT * FROM notification_inbox').all()).results).toHaveLength(1);
 const delivery=await store.db.prepare('SELECT * FROM notification_deliveries').first<any>();expect(delivery.state).toBe('delivered');expect(delivery.attempts).toBe(1);
 expect((await store.db.prepare('SELECT collection_cursor FROM notification_cursors').first<any>()).collection_cursor).toBeGreaterThan(0);
 }finally{store.close();}
});
it('emits payout only for settled state and excludes question answer and lease secrets',async()=>{
 const store=sqliteD1();try{
 await store.db.prepare(`INSERT INTO collections(collection_id,owner_address,collection_name,content_hash,created_at,status,chain_id,contract_address) VALUES ('c','owner','Name','PRIVATE SOURCE',1,'confirmed',31337,'contract')`).run();
 await store.db.prepare(`INSERT INTO queries(request_id,collection_id,buyer_address,policy_version,created_at,chain_id,contract_address,question_digest,answer_text,lease_token,amount_wei,outcome) VALUES ('r','c','buyer',1,1,31337,'contract','PRIVATE QUESTION','PRIVATE ANSWER','PRIVATE LEASE','9007199254740993001','settlement_pending')`).run();
 await store.db.prepare(`UPDATE queries SET outcome='settlement_pending',settle_tx_hash='tx' WHERE request_id='r'`).run();expect((await store.db.prepare('SELECT * FROM notification_events').all()).results).toHaveLength(0);
 await store.db.prepare(`UPDATE queries SET outcome='settled',settled_at=2 WHERE request_id='r'`).run();
 const event=await store.db.prepare('SELECT * FROM notification_events').first<any>();expect(event.event_type).toBe('payout_settled');expect(event.amount_wei).toBe('9007199254740993001');expect(event.recipient).toBe('owner');expect(JSON.stringify(event)).not.toContain('PRIVATE');
 }finally{store.close();}
});
it('never acknowledges an unavailable observation store as duplicate delivery',async()=>{
 const store=sqliteD1();try{
 const env={DB:store.db,CHAIN_ID:'31337',CONTRACT_ADDRESS:'0x'+'ab'.repeat(20),MONITOR_SECRET:'x'.repeat(32)} as Env;
 const original=env.DB.batch;env.DB.batch=async()=>{throw Error('D1 unavailable');};
 const response=await worker.fetch(new Request('https://vault.example/api/status/observations',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${env.MONITOR_SECRET}`},body:JSON.stringify({samples:[{component:'worker_api',status:'down',timestamp:Math.floor(Date.now()/300000)*300000}]})}),env);
 expect(response.status).toBe(503);env.DB.batch=original;
 }finally{store.close();}
});
