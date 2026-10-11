import { deployment } from './account-session';
import { setEmailConsent } from './account-email';
import { emailOrigin } from './email-config';
import type { Env } from './types';
const encode=(value:string)=>btoa(value).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const decode=(value:string)=>atob(value.replace(/-/g,'+').replace(/_/g,'/'));
async function key(env:Env){
 if(!env.EMAIL_LINK_SECRET||env.EMAIL_LINK_SECRET.length<32)throw new Error('Unsubscribe unavailable');
 return crypto.subtle.importKey('raw',new TextEncoder().encode(env.EMAIL_LINK_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
}
export async function unsubscribeToken(env:Env,accountId:string){
 const {chainId,contract}=deployment(env),origin=emailOrigin(env);
 if(!origin)throw new Error('Unsubscribe unavailable');
 const payload=encode(JSON.stringify({purpose:'email-unsubscribe',accountId,chainId,contract,origin}));
 const signature=new Uint8Array(await crypto.subtle.sign('HMAC',await key(env),new TextEncoder().encode(payload)));
 return payload+'.'+encode(String.fromCharCode(...signature));
}
async function unsubscribeAccount(env:Env,token:unknown):Promise<string|null>{
 if(typeof token!=='string'||token.length>2048||!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))return null;
 try{
 const [payload,signature]=token.split('.');
 if(!await crypto.subtle.verify('HMAC',await key(env),Uint8Array.from(decode(signature),char=>char.charCodeAt(0)),new TextEncoder().encode(payload)))return null;
 const data=JSON.parse(decode(payload)),{chainId,contract}=deployment(env);
 return data.purpose==='email-unsubscribe'&&data.chainId===chainId&&data.contract===contract&&data.origin===emailOrigin(env)&&typeof data.accountId==='string'&&data.accountId.startsWith(`${chainId}:${contract}:`)?data.accountId:null;
 }catch{return null;}
}
export async function handleUnsubscribe(request:Request,env:Env){
 const reply=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
 if(request.method!=='POST')return reply({error:'Not found'},404);
 if(new URL(request.url).protocol!=='https:')return reply({error:'HTTPS is required.'},403);
 let token:unknown;
 try{
 if((request.headers.get('Content-Type')??'').startsWith('application/json')){
 const input=await request.json() as Record<string,unknown>;
 if(!input||Object.keys(input).join()!=='token')return reply({error:'Invalid unsubscribe request.'},400);token=input.token;
 }else if((request.headers.get('Content-Type')??'').startsWith('application/x-www-form-urlencoded')){
 if(await request.text()!=='List-Unsubscribe=One-Click')return reply({error:'Invalid unsubscribe request.'},400);token=new URL(request.url).searchParams.get('token');
 }else return reply({error:'Invalid unsubscribe request.'},400);
 }catch{return reply({error:'Invalid unsubscribe request.'},400);}
 const accountId=await unsubscribeAccount(env,token);if(!accountId)return reply({error:'Unsubscribe link is invalid.'},400);
 // This capability can only withdraw email consent. No account/session read.
 await setEmailConsent(env,accountId,false);return reply({status:'unsubscribed'});
}
