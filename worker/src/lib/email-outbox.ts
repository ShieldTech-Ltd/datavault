import { deployment, randomToken } from './account-session';
import { emailConfigured, emailOrigin, escapeHtml, sendNativeEmail } from './email-config';
import { unsubscribeToken } from './email-unsubscribe';
import type { Env } from './types';
const BATCH=10,LEASE_MS=120000,MAX_ATTEMPTS=5;
export const eligibleEmailEvent=`e.event_type IN ('collection_registered','payout_settled') AND e.event_id>m.opt_in_event_id AND e.created_at>m.opt_in_at`;
export async function enqueueEmailNotifications(env:Env,accountId:string){
 await env.DB.prepare(`INSERT OR IGNORE INTO email_outbox(account_id,event_id,email_version,consent_version)
 SELECT a.account_id,e.event_id,m.email_version,m.consent_version FROM accounts a JOIN account_email m ON m.account_id=a.account_id
 JOIN notification_events e ON e.chain_id=a.chain_id AND e.contract_address=a.contract_address AND e.recipient=a.address
 WHERE a.account_id=? AND m.notify_email=1 AND m.verified_email IS NOT NULL AND ${eligibleEmailEvent}
 AND NOT EXISTS(SELECT 1 FROM email_outbox o WHERE o.account_id=a.account_id AND o.event_id=e.event_id AND o.email_version=m.email_version)
 ORDER BY e.event_id LIMIT 50`).bind(accountId).run();
}
export async function consumeEmailNotifications(env:Env,recipient:string):Promise<boolean>{
 const {chainId,contract}=deployment(env);
 const account=await env.DB.prepare('SELECT account_id FROM accounts WHERE chain_id=? AND contract_address=? AND address=?').bind(chainId,contract,recipient).first<{account_id:string}>();
 if(!account)return false;
 await enqueueEmailNotifications(env,account.account_id);
 await env.DB.prepare(`UPDATE email_outbox SET state='suppressed',lease_token=NULL WHERE account_id=? AND state IN ('pending','retry','sending') AND NOT EXISTS
 (SELECT 1 FROM account_email m WHERE m.account_id=email_outbox.account_id AND m.notify_email=1 AND m.verified_email IS NOT NULL AND m.email_version=email_outbox.email_version AND m.consent_version=email_outbox.consent_version)`).bind(account.account_id).run();
 // A crash on the last lease is terminal rather than an unbounded retry.
 await env.DB.prepare(`UPDATE email_outbox SET state='dead_letter',lease_token=NULL,last_error='Acceptance not recorded' WHERE account_id=? AND attempts>=? AND state='sending' AND lease_expires_at<=?`).bind(account.account_id,MAX_ATTEMPTS,Date.now()).run();
 if(emailConfigured(env)){
 const rows=await env.DB.prepare(`SELECT outbox_id FROM email_outbox WHERE account_id=? AND attempts<? AND
 ((state IN ('pending','retry') AND next_retry_at<=?) OR (state='sending' AND lease_expires_at<=?)) ORDER BY outbox_id LIMIT ?`).bind(account.account_id,MAX_ATTEMPTS,Date.now(),Date.now(),BATCH).all<{outbox_id:number}>();
 for(const row of rows.results){
 const fence=randomToken(),now=Date.now();
 const claim=await env.DB.prepare(`UPDATE email_outbox SET state='sending',attempts=attempts+1,lease_token=?,lease_expires_at=? WHERE outbox_id=? AND attempts<?
 AND ((state IN ('pending','retry') AND next_retry_at<=?) OR (state='sending' AND lease_expires_at<=?))`).bind(fence,now+LEASE_MS,row.outbox_id,MAX_ATTEMPTS,now,now).run();
 if(claim.meta.changes!==1)continue;
 // Re-read the address, version and consent immediately before external send.
 const item=await env.DB.prepare(`SELECT o.attempts,m.verified_email,e.event_type FROM email_outbox o JOIN account_email m ON m.account_id=o.account_id
 JOIN notification_events e ON e.event_id=o.event_id WHERE o.outbox_id=? AND o.lease_token=? AND o.state='sending' AND m.notify_email=1
 AND m.email_version=o.email_version AND m.consent_version=o.consent_version AND m.verified_email IS NOT NULL AND ${eligibleEmailEvent}`).bind(row.outbox_id,fence).first<{attempts:number;verified_email:string;event_type:string}>();
 if(!item){await env.DB.prepare("UPDATE email_outbox SET state='suppressed',lease_token=NULL WHERE outbox_id=? AND lease_token=? AND state='sending'").bind(row.outbox_id,fence).run();continue;}
 try{
 const signed=await unsubscribeToken(env,account.account_id),origin=emailOrigin(env)!;
 const unsubscribe=`${origin}/settings/email-unsubscribe#token=${signed}`,oneclick=`${origin}/api/email/unsubscribe?token=${signed}`;
 const subject=item.event_type==='payout_settled'?'DataVault payout settled':'DataVault collection registered';
 const explanation=item.event_type==='payout_settled'?'A payout settlement was recorded for your wallet. Review the on-chain transaction in your DataVault inbox.':'Your collection registration was recorded. Review the collection in your DataVault inbox.';
 const stillEligible=await env.DB.prepare(`SELECT 1 FROM email_outbox o JOIN account_email m ON m.account_id=o.account_id WHERE o.outbox_id=? AND o.state='sending' AND o.lease_token=? AND o.lease_expires_at>?
 AND m.notify_email=1 AND m.verified_email=? AND m.email_version=o.email_version AND m.consent_version=o.consent_version`).bind(row.outbox_id,fence,Date.now(),item.verified_email).first();
 if(!stillEligible)continue;
 const id=await sendNativeEmail(env,{to:item.verified_email,subject,text:`${explanation}\n${origin}/settings\nUnsubscribe from email notifications:\n${unsubscribe}`,html:`<p>${explanation}</p><p><a href="${origin}/settings">Open DataVault</a></p><p><a href="${escapeHtml(unsubscribe)}">Unsubscribe from email notifications</a></p>`,headers:{'List-Unsubscribe':`<${oneclick}>`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'}});
 // Fencing blocks a stale worker from acknowledging a superseded lease. No
 // provider idempotency exists here: accept-before-commit crashes can duplicate.
 await env.DB.prepare("UPDATE email_outbox SET state='accepted',provider_message_id=?,lease_token=NULL,lease_expires_at=NULL,last_error=NULL WHERE outbox_id=? AND lease_token=? AND state='sending'").bind(id,row.outbox_id,fence).run();
 }catch{
 await env.DB.prepare(`UPDATE email_outbox SET state=CASE WHEN attempts>=? THEN 'dead_letter' ELSE 'retry' END,next_retry_at=?,lease_token=NULL,lease_expires_at=NULL,last_error='Email acceptance unavailable' WHERE outbox_id=? AND lease_token=? AND state='sending'`).bind(MAX_ATTEMPTS,Date.now()+Math.min(3600000,60000*2**(item.attempts-1)),row.outbox_id,fence).run();
 }
 }
 }
 return Boolean(await env.DB.prepare("SELECT 1 FROM email_outbox WHERE account_id=? AND state IN ('pending','retry','sending') LIMIT 1").bind(account.account_id).first());
}
