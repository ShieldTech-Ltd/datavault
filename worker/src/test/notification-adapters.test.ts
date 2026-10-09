import {expect,it} from 'vitest';
import worker from '../index';
import {sqliteD1} from './sqlite-d1';
import type {Env} from '../lib/types';
const contract='0x'+'ab'.repeat(20),address='0x'+'11'.repeat(20);
async function fixture(){
 const store=sqliteD1(),env={DB:store.db,CHAIN_ID:'31337',CONTRACT_ADDRESS:contract} as Env,account=`31337:${contract}:${address}`;
 await env.DB.prepare('INSERT INTO accounts(account_id,address,chain_id,contract_address,created_at,updated_at) VALUES (?,?,31337,?,1,1)').bind(account,address,contract).run();
 await env.DB.prepare("INSERT INTO notification_events(chain_id,contract_address,event_type,source_id,recipient,collection_id,collection_name,created_at) VALUES (31337,?,'collection_registered','tx',?,'c','Name',1)").bind(contract,address).run();
 return {store,env,account};
}
const message=(body:any)=>({body,acked:0,retried:0,ack(){this.acked++;},retry(){this.retried++;}});
it('exports disabled-by-default scheduled and Queue adapters with no delivery',async()=>{
 expect(typeof (worker as any).scheduled).toBe('function');expect(typeof (worker as any).queue).toBe('function');
 const {store,env}=await fixture();try{
 await (worker as any).scheduled({},env);
 const msg=message({chainId:31337,contractAddress:contract,recipient:address});
 await (worker as any).queue({messages:[msg]},env);expect(msg.retried).toBe(1);expect(msg.acked).toBe(0);
 expect((await env.DB.prepare('SELECT * FROM notification_inbox').all()).results).toHaveLength(0);
 }finally{store.close();}
});
it('scheduled direct processing is idempotent and Queue signals do not claim delivery',async()=>{
 const {store,env}=await fixture();try{
 (env as any).NOTIFICATION_SCHEDULE_ENABLED='true';
 const signals:any[]=[];(env as any).NOTIFICATIONS_QUEUE={send:async(body:any)=>signals.push(body)};
 await (worker as any).scheduled({},env);expect(signals).toEqual([{chainId:31337,contractAddress:contract,recipient:address}]);
 expect((await env.DB.prepare('SELECT * FROM notification_inbox').all()).results).toHaveLength(0);
 delete (env as any).NOTIFICATIONS_QUEUE;
 await (worker as any).scheduled({},env);await (worker as any).scheduled({},env);
 expect((await env.DB.prepare('SELECT * FROM notification_inbox').all()).results).toHaveLength(1);
 }finally{store.close();}
});
it('Queue validates deployment and retries storage failures before acknowledging actual delivery',async()=>{
 const {store,env}=await fixture();try{
 (env as any).NOTIFICATIONS_QUEUE={send:async()=>{}};
 const wrong=message({chainId:10143,contractAddress:contract,recipient:address});
 await (worker as any).queue({messages:[wrong]},env);expect(wrong.acked).toBe(1);
 expect((await env.DB.prepare('SELECT * FROM notification_inbox').all()).results).toHaveLength(0);
 const original=env.DB.batch;env.DB.batch=async()=>{throw Error('storage unavailable');};
 const failed=message({chainId:31337,contractAddress:contract,recipient:address});
 await (worker as any).queue({messages:[failed]},env);expect(failed.retried).toBe(1);expect(failed.acked).toBe(0);
 const delivery=await env.DB.prepare('SELECT * FROM notification_deliveries').first<any>();expect(delivery.state).toBe('retry');expect(delivery.attempts).toBe(1);
 env.DB.batch=original;await env.DB.prepare('UPDATE notification_deliveries SET next_retry_at=0').run();
 const success=message(failed.body);await (worker as any).queue({messages:[success]},env);await (worker as any).queue({messages:[message(failed.body)]},env);
 expect(success.acked).toBe(1);expect((await env.DB.prepare('SELECT * FROM notification_inbox').all()).results).toHaveLength(1);
 }finally{store.close();}
});
it('Queue preserves current opt-out and bounds a provider batch to ten messages',async()=>{
 const {store,env,account}=await fixture();try{
 (env as any).NOTIFICATIONS_QUEUE={send:async()=>{}};
 await env.DB.prepare('UPDATE accounts SET notify_in_app=0 WHERE account_id=?').bind(account).run();
 const disabled=message({chainId:31337,contractAddress:contract,recipient:address});await (worker as any).queue({messages:[disabled]},env);
 expect(disabled.acked).toBe(1);expect((await env.DB.prepare('SELECT * FROM notification_inbox').all()).results).toHaveLength(0);
 expect((await env.DB.prepare('SELECT state FROM notification_deliveries').first<any>()).state).toBe('suppressed');
 await env.DB.prepare('UPDATE accounts SET notify_in_app=1 WHERE account_id=?').bind(account).run();
 await (worker as any).queue({messages:[message(disabled.body)]},env);
 expect((await env.DB.prepare('SELECT * FROM notification_inbox').all()).results).toHaveLength(0);
 const messages=Array.from({length:11},()=>message({chainId:10143,contractAddress:contract,recipient:address}));
 await (worker as any).queue({messages},env);expect(messages.slice(0,10).every(m=>m.acked===1)).toBe(true);expect(messages[10].retried).toBe(1);
 }finally{store.close();}
});

for(const scenario of ['retry-backoff','active-lease','provider-disabled','provider-disabled-unqueued'] as const){
 it(`scheduled ${scenario} email rows cannot monopolize five slots ahead of later due in-app work`,async()=>{
  const {store,env}=await fixture();try{
   env.NOTIFICATION_SCHEDULE_ENABLED='true';let nativeCalls=0;
   // In-process fake binding only. No provider setup or actual emails.
   if(!scenario.startsWith('provider-disabled'))Object.assign(env,{PUBLIC_ORIGIN:'https://vault.example',EMAIL_FROM:'fake@example.test',EMAIL_LINK_SECRET:'test-only-secret-at-least-thirty-two-bytes',EMAIL:{send:async()=>{nativeCalls++;return {messageId:'fake-private-id'};}}});
   const statements:D1PreparedStatement[]=[],now=Date.now();
   for(let i=1;i<=5;i++){
    const earlyAddress='0x'+i.toString(16).padStart(40,'0'),id=`31337:${contract}:${earlyAddress}`;
    statements.push(env.DB.prepare('INSERT INTO accounts(account_id,address,chain_id,contract_address,created_at,updated_at) VALUES (?,?,31337,?,1,1)').bind(id,earlyAddress,contract));
    statements.push(env.DB.prepare('INSERT INTO account_email(account_id,verified_email,verified_at,email_version,notify_email,consent_version,opt_in_at,opt_in_event_id) VALUES (?,\'fake@example.test\',1,1,1,1,0,0)').bind(id));
    statements.push(env.DB.prepare("INSERT INTO notification_events(chain_id,contract_address,event_type,source_id,recipient,collection_id,collection_name,created_at) VALUES (31337,?,'collection_registered',?,?,'c','Name',1)").bind(contract,'early-'+i,earlyAddress));
    statements.push(env.DB.prepare("INSERT INTO notification_deliveries(account_id,event_id,state,attempts) SELECT ?,event_id,'delivered',1 FROM notification_events WHERE recipient=?").bind(id,earlyAddress));
    if(scenario!=='provider-disabled-unqueued')statements.push(env.DB.prepare('INSERT INTO email_outbox(account_id,event_id,email_version,consent_version,state,attempts,next_retry_at,lease_token,lease_expires_at) SELECT ?,event_id,1,1,?,1,?,\'fake-lease\',? FROM notification_events WHERE recipient=?').bind(id,scenario==='active-lease'?'sending':scenario==='retry-backoff'?'retry':'pending',scenario==='retry-backoff'?now+600000:0,now+600000,earlyAddress));
   }
   await env.DB.batch(statements);
   const signals:any[]=[];env.NOTIFICATIONS_QUEUE={send:async(body:any)=>{signals.push(body);}} as unknown as Queue;
   await worker.scheduled({} as ScheduledController,env);
   expect(signals).toEqual([{chainId:31337,contractAddress:contract,recipient:address}]);expect(nativeCalls).toBe(0);
   delete env.NOTIFICATIONS_QUEUE;await worker.scheduled({} as ScheduledController,env);
   expect((await env.DB.prepare('SELECT * FROM notification_inbox').all()).results).toHaveLength(1);expect(nativeCalls).toBe(0);
  }finally{store.close();}
 },20000);
}
it('scheduled provider-unavailable recovery still suppresses stale consent and dead-letters expired final leases',async()=>{
 for(const cleanup of ['suppressed','dead_letter'] as const){
  const {store,env,account}=await fixture();try{
   env.NOTIFICATION_SCHEDULE_ENABLED='true';
   await env.DB.batch([
    env.DB.prepare("INSERT INTO notification_deliveries(account_id,event_id,state,attempts) SELECT ?,event_id,'delivered',1 FROM notification_events").bind(account),
    env.DB.prepare('INSERT INTO account_email(account_id,verified_email,verified_at,email_version,notify_email,consent_version,opt_in_at,opt_in_event_id) VALUES (?,\'fake@example.test\',1,1,?,1,0,0)').bind(account,cleanup==='suppressed'?0:1),
    env.DB.prepare("INSERT INTO email_outbox(account_id,event_id,email_version,consent_version,state,attempts,lease_token,lease_expires_at) SELECT ?,event_id,1,1,'sending',5,'fake-lease',? FROM notification_events").bind(account,cleanup==='suppressed'?Date.now()+600000:Date.now()-1)
   ]);
   await worker.scheduled({} as ScheduledController,env);
   expect((await env.DB.prepare('SELECT state FROM email_outbox').first<any>()).state).toBe(cleanup);
  }finally{store.close();}
 }
},20000);
it('scheduled configured recovery selects due pending/retry/expired-lease and new email work',async()=>{
 for(const state of ['pending','retry','sending','unqueued'] as const){
  const {store,env,account}=await fixture();try{
   let sends=0;
   // In-process fake native binding only, never a provider call.
   Object.assign(env,{NOTIFICATION_SCHEDULE_ENABLED:'true',PUBLIC_ORIGIN:'https://vault.example',EMAIL_FROM:'fake@example.test',EMAIL_LINK_SECRET:'test-only-secret-at-least-thirty-two-bytes',EMAIL:{send:async()=>{sends++;return {messageId:'fake-private-id'};}}});
   const statements=[
    env.DB.prepare("INSERT INTO notification_deliveries(account_id,event_id,state,attempts) SELECT ?,event_id,'delivered',1 FROM notification_events").bind(account),
    env.DB.prepare('INSERT INTO account_email(account_id,verified_email,verified_at,email_version,notify_email,consent_version,opt_in_at,opt_in_event_id) VALUES (?,\'fake@example.test\',1,1,1,1,0,0)').bind(account)
   ];
   if(state!=='unqueued')statements.push(env.DB.prepare("INSERT INTO email_outbox(account_id,event_id,email_version,consent_version,state,attempts,next_retry_at,lease_token,lease_expires_at) SELECT ?,event_id,1,1,?,1,0,'fake-lease',0 FROM notification_events").bind(account,state));
   await env.DB.batch(statements);await worker.scheduled({} as ScheduledController,env);
   expect(sends).toBe(1);expect((await env.DB.prepare('SELECT state FROM email_outbox').first<any>()).state).toBe('accepted');
   await worker.scheduled({} as ScheduledController,env);expect(sends).toBe(1);
  }finally{store.close();}
 }
},20000);
