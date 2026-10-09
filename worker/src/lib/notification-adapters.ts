import { isAddress } from 'viem';
import { deployment, type AccountRow } from './account-session';
import { consumeNotifications, reconcileNotifications } from './notifications';
import type { Env, NotificationWork } from './types';
const ACCOUNT_BATCH=5, MESSAGE_BATCH=10;
async function remaining(env:Env,account:AccountRow){
 return env.DB.prepare(`SELECT e.event_id FROM notification_events e LEFT JOIN notification_deliveries d ON d.account_id=? AND d.event_id=e.event_id WHERE e.chain_id=? AND e.contract_address=? AND e.recipient=? AND (d.event_id IS NULL OR d.state='retry') LIMIT 1`).bind(account.account_id,account.chain_id,account.contract_address,account.address).first();
}
export async function scheduledNotifications(env:Env){
 if(env.NOTIFICATION_SCHEDULE_ENABLED!=='true')return;
 await reconcileNotifications(env);
 const {chainId,contract}=deployment(env);
 const accounts=await env.DB.prepare(`SELECT a.* FROM accounts a WHERE a.chain_id=? AND a.contract_address=? AND EXISTS (SELECT 1 FROM notification_events e LEFT JOIN notification_deliveries d ON d.account_id=a.account_id AND d.event_id=e.event_id WHERE e.chain_id=a.chain_id AND e.contract_address=a.contract_address AND e.recipient=a.address AND (d.event_id IS NULL OR (d.state='retry' AND d.next_retry_at<=?))) ORDER BY a.account_id LIMIT ?`).bind(chainId,contract,Date.now(),ACCOUNT_BATCH).all<AccountRow>();
 for(const account of accounts.results){
 if(env.NOTIFICATIONS_QUEUE)await env.NOTIFICATIONS_QUEUE.send({chainId,contractAddress:contract,recipient:account.address});
 else await consumeNotifications(env,account);
 }
}
function validWork(body:unknown,env:Env):body is NotificationWork{
 if(!body||typeof body!=='object'||Array.isArray(body))return false;
 const data=body as Record<string,unknown>,{chainId,contract}=deployment(env);
 return Object.keys(data).sort().join()==='chainId,contractAddress,recipient'&&data.chainId===chainId&&data.contractAddress===contract&&typeof data.recipient==='string'&&isAddress(data.recipient)&&data.recipient===data.recipient.toLowerCase();
}
export async function queueNotifications(batch:MessageBatch<NotificationWork>,env:Env){
 for(const [index,message] of batch.messages.entries()){
 if(!env.NOTIFICATIONS_QUEUE||index>=MESSAGE_BATCH){message.retry({delaySeconds:60});continue;}
 if(!validWork(message.body,env)){message.ack();continue;}
 try{
 const {chainId,contract}=deployment(env);
 const account=await env.DB.prepare('SELECT * FROM accounts WHERE chain_id=? AND contract_address=? AND address=?').bind(chainId,contract,message.body.recipient).first<AccountRow>();
 // No profile yet means no inbox claim. Future account reads reconcile persisted events.
 if(!account){message.ack();continue;}
 await consumeNotifications(env,account);
 if(await remaining(env,account))message.retry({delaySeconds:60});else message.ack();
 }catch{message.retry({delaySeconds:60});}
 }
}
