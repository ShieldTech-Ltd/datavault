import type { Env } from './types';
export function normalizeEmail(value:unknown):string|null {
 if(typeof value!=='string'||value.length>254||/[\u0000-\u001f\u007f]/.test(value)||/\s/.test(value.trim()))return null;
 const email=value.trim().toLowerCase();
 return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(email)?email:null;
}
export function emailOrigin(env:Env):string|null {
 try {const url=new URL(env.PUBLIC_ORIGIN??'');return url.origin===env.PUBLIC_ORIGIN&&url.protocol==='https:'&&!url.username&&!url.password?url.origin:null;}catch{return null;}
}
export function emailConfigured(env:Env):boolean {
 return Boolean(env.EMAIL&&normalizeEmail(env.EMAIL_FROM)&&emailOrigin(env)&&env.EMAIL_LINK_SECRET&&env.EMAIL_LINK_SECRET.length>=32);
}
export function escapeHtml(value:string){return value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));}
export async function sendNativeEmail(env:Env,message:{to:string;subject:string;text:string;html:string;headers?:Record<string,string>}):Promise<string>{
 if(!emailConfigured(env))throw new Error('Email unavailable');
 // Installed Cloudflare SendEmail structured overload. Acceptance is not delivery.
 const result=await env.EMAIL!.send({...message,from:normalizeEmail(env.EMAIL_FROM)!});
 if(!result||typeof result.messageId!=='string'||!result.messageId||result.messageId.length>1024)throw new Error('Email acceptance unavailable');
 return result.messageId;
}
