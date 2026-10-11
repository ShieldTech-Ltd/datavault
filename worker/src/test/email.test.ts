import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import worker from '../index';
import { sqliteD1 } from './sqlite-d1';
import type { Env, NotificationWork } from '../lib/types';
import * as notificationAdapter from '../lib/notification-adapters';
vi.setConfig({testTimeout:20000});

// Fake native binding only. No network, sender configuration or actual delivery.
const alice=privateKeyToAccount(('0x'+'11'.repeat(32)) as `0x${string}`), bob=privateKeyToAccount(('0x'+'22'.repeat(32)) as `0x${string}`);
const origin='https://vault.example';
let store:ReturnType<typeof sqliteD1>,env:Env,messages:any[],failSend:boolean;
function call(path:string,method='GET',input?:unknown,session?:any,requestOrigin:string|null=origin) {
 return worker.fetch(new Request(origin+'/api/'+path,{method,headers:{'Content-Type':'application/json',...(requestOrigin?{Origin:requestOrigin}:{}),Cookie:session?.cookie??'','x-csrf-token':session?.csrfToken??'','CF-Connecting-IP':session?.ip??'test-ip'},...(input===undefined?{}:{body:JSON.stringify(input)})}),env);
}
async function login(wallet=alice){
 const challenge=await call('auth/challenge','POST',{address:wallet.address}), data=await challenge.json() as any;
 const response=await call('auth/verify','POST',{message:data.message,signature:await wallet.signMessage({message:data.message})},{cookie:challenge.headers.get('set-cookie')!.split(';')[0]});
 return {...await response.json() as any,cookie:response.headers.get('set-cookie')!.split(';')[0]};
}
function token(){return new URL(messages.at(-1).text.match(/https:\/\/\S+/)[0]).hash.slice(7);}
async function verified(session:any){expect((await call('account/email/challenge','POST',{email:'owner@example.test'},session)).status).toBe(202);expect((await call('account/email/verify','POST',{token:token()},session)).status).toBe(200);}
beforeEach(()=>{
 store=sqliteD1();messages=[];failSend=false;
 env={DB:store.db,CHAIN_ID:'10143',CONTRACT_ADDRESS:'0x'+'ab'.repeat(20),PUBLIC_ORIGIN:origin,EMAIL_FROM:'notify@example.test',EMAIL_LINK_SECRET:'test-only-secret-at-least-thirty-two-bytes',EMAIL:{send:async(message:any)=>{if(failSend)throw new Error('private provider error');messages.push(message);return {messageId:'private-message-id'};}}} as unknown as Env;
});
afterEach(()=>{vi.restoreAllMocks();store.close();});
it('issues an accepted, digest-only challenge with trusted fragment link and private status',async()=>{
 const a=await login(),b=await login(bob);
 const response=await call('account/email/challenge','POST',{email:' OWNER@Example.Test '},a);
 expect(response.status).toBe(202);const text=await response.text(),raw=token();
 expect(text).not.toContain(raw);expect(messages[0].to).toBe('owner@example.test');expect(messages[0].text).toContain(origin+'/settings/email-verify#token=');expect(messages[0].html).toContain('Confirm email');
 const rows=store.sqlite.prepare('SELECT * FROM email_challenges').all();expect(JSON.stringify(rows)).not.toContain(raw);expect(rows[0].token_hash).toMatch(/^[a-f0-9]{64}$/);expect(rows[0].state).toBe('accepted');
 expect(await (await call('account/email','GET',undefined,b)).json()).toMatchObject({verifiedEmail:null,pendingEmail:null});
 expect(JSON.stringify(await (await call('account/export','GET',undefined,a)).json())).not.toContain(raw);
});
it('requires own session, CSRF and explicit POST confirmation; rejects replay and concurrent verification',async()=>{
 const a=await login(),b=await login(bob);await call('account/email/challenge','POST',{email:'owner@example.test'},a);const raw=token();
 expect((await call('account/email/verify','POST',{token:raw},b)).status).toBe(400);
 expect((await call('account/email/verify','POST',{token:raw},{cookie:a.cookie})).status).toBe(403);
 expect((await call('account/email/verify?token='+raw,'GET',undefined,a)).status).toBe(404);
 const results=await Promise.all([0,1].map(()=>call('account/email/verify','POST',{token:raw},a)));expect(results.map(r=>r.status).sort()).toEqual([200,400]);
 const profile=await (await call('account','GET',undefined,a)).json() as any;expect(profile.account.notificationPreferences.email).toBe(false);expect(profile.account.email.verifiedEmail).toBe('owner@example.test');
 expect((await call('account/email/verify','POST',{token:raw},a)).status).toBe(400);
});
it('rejects expiry, changed trusted origin, changed deployment and malformed email',async()=>{
 const a=await login();for(const email of ['bad','x\r\nBcc: victim@example.test','owner@example.test\r\n','x'.repeat(255)+'@example.test'])expect((await call('account/email/challenge','POST',{email},a)).status).toBe(400);
 await call('account/email/challenge','POST',{email:'owner@example.test'},a);const raw=token();env.PUBLIC_ORIGIN='https://other.example';expect((await call('account/email/verify','POST',{token:raw},a)).status).toBe(400);env.PUBLIC_ORIGIN=origin;
 env.CONTRACT_ADDRESS='0x'+'cd'.repeat(20);expect((await call('account/email/verify','POST',{token:raw},a)).status).toBe(401);env.CONTRACT_ADDRESS='0x'+'ab'.repeat(20);
 vi.spyOn(Date,'now').mockReturnValue(Date.now()+900001);expect((await call('account/email/verify','POST',{token:raw},a)).status).toBe(400);
});
it('fails closed without configuration and never verifies a provider-rejected challenge',async()=>{
 const a=await login();delete env.EMAIL;expect((await call('account/email/challenge','POST',{email:'owner@example.test'},a)).status).toBe(503);
 env.EMAIL={send:async()=>{throw new Error('private-error-with-recipient');}} as SendEmail;
 const response=await call('account/email/challenge','POST',{email:'owner@example.test'},a);expect(response.status).toBe(503);expect(await response.text()).not.toContain('private-error');
 expect(store.sqlite.prepare('SELECT state FROM email_challenges').all()[0].state).toBe('send_failed');expect(await (await call('account/email','GET',undefined,a)).json()).toMatchObject({verifiedEmail:null,status:'send_failed'});
 expect((await call('account','PATCH',{notificationPreferences:{email:true}},a)).status).toBe(400);
});
it('bounds challenges with cooldown and five per rolling hour for both account and IP',async()=>{
 const a=await login(),now=Date.now();let clock=now;vi.spyOn(Date,'now').mockImplementation(()=>clock);
 expect((await call('account/email/challenge','POST',{email:'owner@example.test'},a)).status).toBe(202);
 expect((await call('account/email/challenge','POST',{email:'owner@example.test'},a)).status).toBe(429);
 for(let i=1;i<5;i++){clock+=61000;expect((await call('account/email/challenge','POST',{email:'owner@example.test'},a)).status).toBe(202);}
 clock+=61000;expect((await call('account/email/challenge','POST',{email:'owner@example.test'},a)).status).toBe(429);
 const b=await login(bob);expect((await call('account/email/challenge','POST',{email:'other@example.test'},b)).status).toBe(429);
});
it('enables consent only for a verified address and strictly boolean values; removing revokes challenges',async()=>{
 const a=await login();expect((await call('account','PATCH',{notificationPreferences:{email:true}},a)).status).toBe(400);await verified(a);
 expect((await call('account','PATCH',{notificationPreferences:{email:'true'}},a)).status).toBe(400);
 expect((await call('account','PATCH',{notificationPreferences:{email:true,inApp:false}},a)).status).toBe(200);
 expect((await (await call('account','GET',undefined,a)).json() as any).account.notificationPreferences).toEqual({email:true,inApp:false});
 expect((await call('account/email','DELETE',{},a)).status).toBe(200);
 expect((await (await call('account','GET',undefined,a)).json() as any).account.notificationPreferences.email).toBe(false);
 expect((await call('account/email/verify','POST',{token:token()},a)).status).toBe(400);
});
async function event(time=Date.now()+1,type='payout_settled',source=crypto.randomUUID()){
 await env.DB.prepare(`INSERT OR IGNORE INTO notification_events(chain_id,contract_address,event_type,source_id,recipient,collection_id,collection_name,created_at) VALUES (10143,?,?,?,?,'c','PRIVATE COLLECTION NAME',?)`).bind(env.CONTRACT_ADDRESS,type,source,alice.address.toLowerCase(),time).run();
}
async function deliver(a:any){
 expect(typeof (notificationAdapter as any).consumeEmailNotifications).toBe('function');
 await (notificationAdapter as any).consumeEmailNotifications(env,a.account.address);
}
it('queues only safe post-opt-in events once and re-enabling excludes old backlog',async()=>{
 const a=await login();await verified(a);await event();await call('account','PATCH',{notificationPreferences:{email:true}},a);await deliver(a);expect(messages).toHaveLength(1);
 const now=Date.now()+1;await event(now,'payout_settled','new');await event(now,'payout_settled','new');await event(now,'query_failed');await deliver(a);await deliver(a);
 expect(messages).toHaveLength(2);expect(messages[1].text).not.toContain('PRIVATE COLLECTION NAME');expect(messages[1].subject).toBe('DataVault payout settled');
 expect(store.sqlite.prepare('SELECT * FROM email_outbox').all()).toHaveLength(1);
 await call('account','PATCH',{notificationPreferences:{email:false}},a);await event();await call('account','PATCH',{notificationPreferences:{email:true}},a);await deliver(a);expect(messages).toHaveLength(2);
 // A historical event first discovered by reconciliation after the new epoch.
 await event(1);await deliver(a);expect(messages).toHaveLength(2);
});
it('blocks queued old-address and withdrawn-consent delivery, with separate in-app settings',async()=>{
 const a=await login();await verified(a);await call('account','PATCH',{notificationPreferences:{email:true}},a);await event();failSend=true;await deliver(a);
 expect(store.sqlite.prepare('SELECT state FROM email_outbox').all()[0].state).toBe('retry');
 failSend=false;await call('account','PATCH',{notificationPreferences:{email:false}},a);await deliver(a);expect(messages).toHaveLength(1);
 await call('account','PATCH',{notificationPreferences:{email:true}},a);await event();failSend=true;await deliver(a);failSend=false;
 vi.spyOn(Date,'now').mockReturnValue(Date.now()+61000);expect((await call('account/email/challenge','POST',{email:'replacement@example.test'},a)).status).toBe(202);await deliver(a);expect(messages).toHaveLength(2);
 expect((await (await call('account','GET',undefined,a)).json() as any).account.notificationPreferences).toEqual({inApp:true,email:false});
});
it('uses atomic delivery leases under concurrent consumers and records private provider acceptance',async()=>{
 const a=await login();await verified(a);await call('account','PATCH',{notificationPreferences:{email:true}},a);await event();
 await Promise.all([deliver(a),deliver(a)]);expect(messages).toHaveLength(2);
 const row=store.sqlite.prepare('SELECT * FROM email_outbox').all()[0];expect(row.state).toBe('accepted');expect(row.provider_message_id).toBe('private-message-id');expect(row.attempts).toBe(1);
 const exported=JSON.stringify(await (await call('account/export','GET',undefined,a)).json());expect(exported).not.toContain('private-message-id');
});
it('bounds failures to five attempts with backoff and dead letter; provider crash may duplicate after lease expiry',async()=>{
 const a=await login();await verified(a);await call('account','PATCH',{notificationPreferences:{email:true}},a);await event();let clock=Date.now();vi.spyOn(Date,'now').mockImplementation(()=>clock);failSend=true;
 for(let i=0;i<5;i++){await deliver(a);const row=store.sqlite.prepare('SELECT * FROM email_outbox').all()[0];expect(row.attempts).toBe(i+1);await deliver(a);expect(store.sqlite.prepare('SELECT attempts FROM email_outbox').all()[0].attempts).toBe(i+1);clock+=3600000;}
 expect(store.sqlite.prepare('SELECT state FROM email_outbox').all()[0].state).toBe('dead_letter');failSend=false;await deliver(a);expect(messages).toHaveLength(1);
 await event(clock+1);let accepted=0;env.EMAIL={send:async(message:any)=>{messages.push(message);accepted++;if(accepted===1)throw new Error('provider accepted then transport failed');return {messageId:'private-message-id'};}} as SendEmail;
 await deliver(a);clock+=3600000;await deliver(a);expect(accepted).toBe(2);expect(messages).toHaveLength(3);
},20000);
it('public unsubscribe requires a purpose/deployment signed token and only disables email on POST',async()=>{
 const a=await login();await verified(a);await call('account','PATCH',{notificationPreferences:{email:true}},a);await event();await deliver(a);
 const link=new URL(messages[1].text.match(/https:\/\/\S+email-unsubscribe\S+/)[0]);const raw=link.hash.slice(7);
 expect((await call('email/unsubscribe?token='+encodeURIComponent(raw),'GET')).status).toBe(404);
 expect((await call('email/unsubscribe','POST',{token:raw+'tamper'})).status).toBe(400);
 env.CONTRACT_ADDRESS='0x'+'cd'.repeat(20);expect((await call('email/unsubscribe','POST',{token:raw})).status).toBe(400);env.CONTRACT_ADDRESS='0x'+'ab'.repeat(20);
 const payload=JSON.parse(atob(raw.split('.')[0].replace(/-/g,'+').replace(/_/g,'/')));payload.purpose='account-export';
 const encode=(value:string)=>btoa(value).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');const altered=encode(JSON.stringify(payload));
 const signingKey=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.EMAIL_LINK_SECRET!),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signature=new Uint8Array(await crypto.subtle.sign('HMAC',signingKey,new TextEncoder().encode(altered)));
 expect((await call('email/unsubscribe','POST',{token:altered+'.'+encode(String.fromCharCode(...signature))})).status).toBe(400);
 env.PUBLIC_ORIGIN='https://other.example';expect((await call('email/unsubscribe','POST',{token:raw})).status).toBe(400);env.PUBLIC_ORIGIN=origin;
 expect((await call('email/unsubscribe','POST',{token:raw},undefined,null)).status).toBe(200);
 const profile=(await (await call('account','GET',undefined,a)).json() as any).account;expect(profile.notificationPreferences).toEqual({inApp:true,email:false});expect(profile.email.verifiedEmail).toBe('owner@example.test');
 expect(messages[1].headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
 const headerURL=messages[1].headers['List-Unsubscribe'].slice(1,-1);
 const oneclick=await worker.fetch(new Request(headerURL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'List-Unsubscribe=One-Click'}),env);expect(oneclick.status).toBe(200);
});
it('acknowledges queue work only after acceptance is persisted and recovers accept-before-D1 failure honestly',async()=>{
 const a=await login();await verified(a);await call('account','PATCH',{notificationPreferences:{email:true}},a);await event();
 env.NOTIFICATIONS_QUEUE={send:async()=>{}} as unknown as Queue;let ack=0,retry=0,failCommit=true;
 const real=env.DB;env.DB={...real,prepare:(sql:string)=>{
  const statement=real.prepare(sql);if(sql.includes("SET state='accepted',provider_message_id")&&failCommit){failCommit=false;return {bind:()=>({run:async()=>{throw new Error('D1 temporarily unavailable after provider acceptance');}})} as unknown as D1PreparedStatement;}return statement;
 }} as D1Database;
 const batch=()=>({messages:[{body:{chainId:10143,contractAddress:env.CONTRACT_ADDRESS,recipient:a.account.address},ack:()=>{ack++;},retry:()=>{retry++;}}]}) as unknown as MessageBatch<NotificationWork>;
 await worker.queue(batch(),env);expect(ack).toBe(0);expect(retry).toBe(1);expect(messages).toHaveLength(2);
 vi.spyOn(Date,'now').mockReturnValue(Date.now()+3600000);await worker.queue(batch(),env);expect(ack).toBe(1);expect(messages).toHaveLength(3);expect(store.sqlite.prepare('SELECT state FROM email_outbox').all()[0].state).toBe('accepted');
});
it('an expired old provider attempt cannot overwrite a newer fencing lease acceptance',async()=>{
 const a=await login();await verified(a);await call('account','PATCH',{notificationPreferences:{email:true}},a);await event();
 let release!:()=>void,firstResolve!:()=>void;const firstSubmitted=new Promise<void>(resolve=>{firstResolve=resolve;});let calls=0;
 env.EMAIL={send:async()=>{calls++;if(calls===1){firstResolve();await new Promise<void>(resolve=>{release=resolve;});return {messageId:'old-private-id'};}return {messageId:'new-private-id'};}} as SendEmail;
 const first=deliver(a);await firstSubmitted;vi.spyOn(Date,'now').mockReturnValue(Date.now()+120001);await deliver(a);release();await first;
 const row=store.sqlite.prepare('SELECT * FROM email_outbox').all()[0];expect(row.state).toBe('accepted');expect(row.provider_message_id).toBe('new-private-id');expect(row.attempts).toBe(2);expect(calls).toBe(2);
});
it('rejects native binding missing message IDs and blocks opt-in when configured provider is withdrawn',async()=>{
 const a=await login();env.EMAIL={send:async(message:any)=>{messages.push(message);return undefined;}} as unknown as SendEmail;
 expect((await call('account/email/challenge','POST',{email:'owner@example.test'},a)).status).toBe(503);expect((await call('account/email/verify','POST',{token:token()},a)).status).toBe(400);
 vi.spyOn(Date,'now').mockReturnValue(Date.now()+61000);env.EMAIL={send:async(message:any)=>{messages.push(message);return {messageId:'private-message-id'};}} as SendEmail;await verified(a);
 delete env.EMAIL;expect((await call('account','PATCH',{notificationPreferences:{email:true}},a)).status).toBe(400);expect((await call('account','PATCH',{notificationPreferences:{email:false}},a)).status).toBe(200);
});
it('rechecks consent after asynchronous signing and immediately before external submission',async()=>{
 const a=await login();await verified(a);await call('account','PATCH',{notificationPreferences:{email:true}},a);await event();
 const sign=crypto.subtle.sign.bind(crypto.subtle);vi.spyOn(crypto.subtle,'sign').mockImplementation(async(algorithm,key,data)=>{
  await call('account','PATCH',{notificationPreferences:{email:false}},a);return sign(algorithm,key,data);
 });
 await deliver(a);expect(messages).toHaveLength(1);expect(store.sqlite.prepare('SELECT state FROM email_outbox').all()[0].state).toBe('suppressed');
});
it('bounds recovery enqueue to fifty new rows and sends ten per consumer without starving later events',async()=>{
 const a=await login();await verified(a);await call('account','PATCH',{notificationPreferences:{email:true}},a);
 await env.DB.batch(Array.from({length:51},(_,i)=>env.DB.prepare(`INSERT INTO notification_events(chain_id,contract_address,event_type,source_id,recipient,collection_id,collection_name,created_at) VALUES (10143,?,'collection_registered',?,?,'c','Name',?)`).bind(env.CONTRACT_ADDRESS,'batch-'+i,a.account.address,Date.now()+1)));
 await deliver(a);expect(store.sqlite.prepare('SELECT * FROM email_outbox').all()).toHaveLength(50);expect(messages).toHaveLength(11);
 await deliver(a);expect(store.sqlite.prepare('SELECT * FROM email_outbox').all()).toHaveLength(51);expect(messages).toHaveLength(21);
});
