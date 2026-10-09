import { deployment, digest, randomToken, type AccountRow } from './account-session';
import { emailConfigured, emailOrigin, escapeHtml, normalizeEmail, sendNativeEmail } from './email-config';
import { callerIdentity } from './ratelimit';
import type { Env } from './types';
const TTL=15*60*1000;
export async function emailStatus(env:Env,account:AccountRow){
 const row=await env.DB.prepare('SELECT * FROM account_email WHERE account_id=?').bind(account.account_id).first<{verified_email:string|null;verified_at:number|null;email_version:number;notify_email:number}>();
 const pending=await env.DB.prepare('SELECT email,state,created_at,expires_at FROM email_challenges WHERE account_id=? AND email_version=? ORDER BY created_at DESC LIMIT 1').bind(account.account_id,row?.email_version??0).first<{email:string;state:string;created_at:number;expires_at:number}>();
 const active=pending&&['pending','accepted','send_failed'].includes(pending.state);
 return {providerConfigured:emailConfigured(env),verifiedEmail:row?.verified_email??null,verifiedAt:row?.verified_at??null,
 pendingEmail:active?pending.email:null,status:row?.verified_email?'verified':active?(pending.state==='accepted'&&pending.expires_at<=Date.now()?'expired':pending.state):'none',
 resendAfter:pending?Math.max(0,Math.ceil((pending.created_at+60000-Date.now())/1000)):0};
}
export async function challengeEmail(request:Request,env:Env,account:AccountRow,input:Record<string,unknown>){
 const email=normalizeEmail(input.email);
 if(Object.keys(input).join()!=='email'||!email)return {status:400,value:{error:'A valid email address is required.'}};
 if(!emailConfigured(env))return {status:503,value:{error:'Email service is not configured.'}};
 const now=Date.now(),token=randomToken(),hash=await digest(token),ipHash=await digest(callerIdentity(request)),{chainId,contract}=deployment(env),origin=emailOrigin(env)!;
 // Reservation, quotas and version increment are one D1 transaction. Rejected
 // reservations cannot revoke an existing address or consume another quota.
 const results=await env.DB.batch([
 env.DB.prepare(`INSERT INTO email_challenges(token_hash,account_id,email,email_version,origin,chain_id,contract_address,ip_hash,created_at,expires_at,state)
 SELECT ?,?,?,COALESCE((SELECT email_version FROM account_email WHERE account_id=?),0)+1,?,?,?,?,?,?,'pending'
 WHERE NOT EXISTS(SELECT 1 FROM email_challenges WHERE account_id=? AND created_at>?)
 AND (SELECT COUNT(*) FROM email_challenges WHERE account_id=? AND created_at>?)<5
 AND (SELECT COUNT(*) FROM email_challenges WHERE ip_hash=? AND created_at>?)<5`).bind(hash,account.account_id,email,account.account_id,origin,chainId,contract,ipHash,now,now+TTL,account.account_id,now-60000,account.account_id,now-3600000,ipHash,now-3600000),
 env.DB.prepare(`INSERT INTO account_email(account_id,email_version) SELECT account_id,email_version FROM email_challenges WHERE token_hash=?
 ON CONFLICT(account_id) DO UPDATE SET email_version=excluded.email_version,verified_email=NULL,verified_at=NULL,notify_email=0,opt_in_at=NULL,opt_in_event_id=NULL,consent_version=consent_version+1`).bind(hash),
 env.DB.prepare(`UPDATE email_challenges SET state='revoked' WHERE account_id=? AND token_hash<>? AND state IN ('pending','accepted') AND EXISTS(SELECT 1 FROM email_challenges WHERE token_hash=?)`).bind(account.account_id,hash,hash),
 env.DB.prepare(`UPDATE email_outbox SET state='suppressed',lease_token=NULL WHERE account_id=? AND state IN ('pending','retry','sending') AND EXISTS(SELECT 1 FROM email_challenges WHERE token_hash=?)`).bind(account.account_id,hash)
 ]);
 if(results[0].meta.changes!==1)return {status:429,value:{error:'Wait before requesting another verification message.',retryAfter:60}};
 const link=`${origin}/settings/email-verify#token=${token}`;
 try {
 const id=await sendNativeEmail(env,{to:email,subject:'Confirm your DataVault email',text:`Confirm your DataVault email with the wallet that requested it:\n${link}\nThis link expires in 15 minutes. Verification does not enable notifications.`,html:`<p>Confirm your DataVault email with the wallet that requested it.</p><p><a href="${escapeHtml(link)}">Confirm email</a></p><p>This link expires in 15 minutes. Verification does not enable notifications.</p>`});
 await env.DB.prepare("UPDATE email_challenges SET state='accepted',provider_message_id=? WHERE token_hash=? AND state='pending'").bind(id,hash).run();
 return {status:202,value:{status:'accepted',resendAfter:60}};
 }catch{
 await env.DB.prepare("UPDATE email_challenges SET state='send_failed' WHERE token_hash=? AND state='pending'").bind(hash).run();
 return {status:503,value:{error:'Verification message could not be accepted. Retry after the cooldown.'}};
 }
}
export async function verifyEmail(env:Env,account:AccountRow,input:Record<string,unknown>){
 if(Object.keys(input).join()!=='token'||typeof input.token!=='string'||!/^[a-f0-9]{64}$/.test(input.token))return false;
 const hash=await digest(input.token),fence=randomToken(),now=Date.now(),{chainId,contract}=deployment(env),origin=emailOrigin(env);
 if(!origin)return false;
 const results=await env.DB.batch([
 env.DB.prepare(`UPDATE email_challenges SET state='consumed',consumed_by=? WHERE token_hash=? AND account_id=? AND state='accepted' AND expires_at>?
 AND chain_id=? AND contract_address=? AND origin=? AND email_version=(SELECT email_version FROM account_email WHERE account_id=?)`).bind(fence,hash,account.account_id,now,chainId,contract,origin,account.account_id),
 env.DB.prepare(`UPDATE account_email SET verified_email=(SELECT email FROM email_challenges WHERE token_hash=?),verified_at=?,notify_email=0
 WHERE account_id=? AND EXISTS(SELECT 1 FROM email_challenges WHERE token_hash=? AND consumed_by=? AND email_version=account_email.email_version)`).bind(hash,now,account.account_id,hash,fence)
 ]);
 return results[0].meta.changes===1&&results[1].meta.changes===1;
}
export async function removeEmail(env:Env,accountId:string){
 await env.DB.batch([
 env.DB.prepare('UPDATE account_email SET verified_email=NULL,verified_at=NULL,email_version=email_version+1,notify_email=0,consent_version=consent_version+1,opt_in_at=NULL,opt_in_event_id=NULL WHERE account_id=?').bind(accountId),
 env.DB.prepare("UPDATE email_challenges SET state='revoked' WHERE account_id=? AND state IN ('pending','accepted')").bind(accountId),
 env.DB.prepare("UPDATE email_outbox SET state='suppressed',lease_token=NULL WHERE account_id=? AND state IN ('pending','retry','sending')").bind(accountId)
 ]);
}
export async function setEmailConsent(env:Env,accountId:string,enabled:boolean):Promise<boolean>{
 if(enabled&&!emailConfigured(env))return false;
 const now=Date.now();
 const result=await env.DB.prepare(`UPDATE account_email SET notify_email=?,consent_version=consent_version+CASE WHEN notify_email<>? THEN 1 ELSE 0 END,
 opt_in_at=CASE WHEN ?=1 AND notify_email=0 THEN ? WHEN ?=0 THEN NULL ELSE opt_in_at END,
 opt_in_event_id=CASE WHEN ?=1 AND notify_email=0 THEN (SELECT COALESCE(MAX(event_id),0) FROM notification_events) WHEN ?=0 THEN NULL ELSE opt_in_event_id END
 WHERE account_id=? AND (?=0 OR (verified_email IS NOT NULL AND verified_at IS NOT NULL))`).bind(Number(enabled),Number(enabled),Number(enabled),now,Number(enabled),Number(enabled),Number(enabled),accountId,Number(enabled)).run();
 if(!enabled)await env.DB.prepare("UPDATE email_outbox SET state='suppressed',lease_token=NULL WHERE account_id=? AND state IN ('pending','retry','sending')").bind(accountId).run();
 return !enabled||result.meta.changes===1;
}
