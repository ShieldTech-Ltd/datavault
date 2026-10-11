import type { Env } from './types';
export const FREE_LIMITS = Object.freeze({activeKeys:5,ownedWorkspaces:5,workspaceMembers:50,importsPerDay:20,savedQuestions:50,uploadBytes:2*1024*1024});
export type Limits = { [K in keyof typeof FREE_LIMITS]: number };
export function billingConfig(env:Env) {
  if(env.BILLING_MODE!=='test' || !/^sk_test_[A-Za-z0-9]{12,}$/.test(env.STRIPE_SECRET_KEY??'') || !/^whsec_[A-Za-z0-9]{12,}$/.test(env.STRIPE_WEBHOOK_SECRET??'') || !/^price_[A-Za-z0-9]+$/.test(env.STRIPE_PRICE_ID??''))return null;
  let origin:URL;try{origin=new URL(env.PUBLIC_ORIGIN!);if(origin.origin!==env.PUBLIC_ORIGIN||origin.protocol!=='https:')return null;}catch{return null;}
  let caps:Limits;try{caps=JSON.parse(env.BILLING_LIMITS??'');}catch{return null;}
  const maximum={activeKeys:100,ownedWorkspaces:100,workspaceMembers:500,importsPerDay:200,savedQuestions:1000,uploadBytes:FREE_LIMITS.uploadBytes};
  if(!caps||typeof caps!=='object'||Array.isArray(caps)||Object.keys(caps).length!==Object.keys(FREE_LIMITS).length)return null;
  for(const key of Object.keys(FREE_LIMITS) as (keyof Limits)[])if(!Number.isSafeInteger(caps[key])||caps[key]<FREE_LIMITS[key]||caps[key]>maximum[key])return null;
  return {secret:env.STRIPE_SECRET_KEY!,webhookSecret:env.STRIPE_WEBHOOK_SECRET!,price:env.STRIPE_PRICE_ID!,origin:origin.origin,caps};
}

export interface BillingAccount {
 account_id:string;customer_id:string|null;subscription_id:string|null;price_id:string|null;status:string;
 period_end:number;cancel_at_period_end:number;verified_at:number;limits_json:string;
 lease_token:string|null;lease_until:number;checkout_id:string|null;checkout_key:string|null;checkout_url:string|null;checkout_expires:number;
}
export async function billingAccount(env:Env,id:string){return env.DB.prepare('SELECT * FROM billing_accounts WHERE account_id=?').bind(id).first<BillingAccount>();}
export function currentEntitlements(env:Env,row:BillingAccount|null,now=Date.now()) {
 const config=billingConfig(env),fresh=Boolean(row && row.verified_at>now-900000 && row.verified_at<=now+1000);
 let same=false;try{const caps=JSON.parse(row?.limits_json??'{}');same=Boolean(config && Object.keys(FREE_LIMITS).every(k=>caps[k]===config.caps[k as keyof Limits]));}catch{/* Invalid persisted evidence fails closed. */}
 const paid=Boolean(config&&row&&fresh&&same&&row.price_id===config.price&&['active','trialing'].includes(row.status)&&row.period_end>now);
 return {plan:paid?'pro' as const:'free' as const,limits:paid?config!.caps:FREE_LIMITS,fresh};
}

// This expression is evaluated inside the count/insert statement, including after provider awaits.
// All interpolated values are validated configuration numbers or fixed-schema identifiers.
export function quotaLimitSql(env:Env,key:keyof Limits,accountSql:string){
 const config=billingConfig(env);if(!config)return String(FREE_LIMITS[key]);
 const now="CAST(strftime('%s','now') AS INTEGER)*1000";
 const same=(Object.keys(FREE_LIMITS) as (keyof Limits)[]).map(k=>`json_extract(b.limits_json,'$.${k}')=${config.caps[k]}`).join(' AND ');
 return `COALESCE((SELECT CASE WHEN b.mode='test' AND b.price_id='${config.price}' AND b.status IN ('active','trialing') AND b.period_end>${now} AND b.verified_at>${now}-900000 AND b.verified_at<=${now}+1000 AND json_valid(b.limits_json) AND ${same} THEN ${config.caps[key]} ELSE ${FREE_LIMITS[key]} END FROM billing_accounts b WHERE b.account_id=${accountSql}),${FREE_LIMITS[key]})`;
}
export function accountQuotaSql(env:Env,key:keyof Limits,id:string){return quotaLimitSql(env,key,"'"+id.replace(/'/g,"''")+"'");}
