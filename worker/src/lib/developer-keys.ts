import type { Env } from './types';
import { deployment, digest, randomToken, secureTransport, type AccountRow } from './account-session';
import { getCollectionRow } from './d1';
import { getOnChainCollection } from './policy';
import { rpcMatchesConfiguredChain } from './chain-identity';
import { isValidBytes32 } from './validation';
import { collectionMetadata } from '../routes/collection-metadata';
import {membership,sharedCollection,workspaceId,currentGrant} from './workspaces';

const json=(value:unknown,status=200,headers:Record<string,string>={})=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json',...headers}});
export interface DeveloperKeyRow {
 id:string;account_id:string;chain_id:number;contract_address:string;workspace_id:string|null;name:string;secret_hash:string;display_prefix:string;
 scopes:string;collection_ids:string;created_at:number;expires_at:number;revoked_at:number|null;address?:string;
}
export async function developerWorkspaceAllowed(key:DeveloperKeyRow,env:Env):Promise<boolean> { return key.workspace_id===null || (workspaceId(key.workspace_id) && Boolean(key.address && (await membership(env,key.workspace_id,key.address))?.role==='Owner')); }
async function authorizedCollections(ids:string[],address:string,workspace:string|null,env:Env){
 if(workspace===null)return ownedCollections(ids,address,env);
 if((await membership(env,workspace,address))?.role!=='Owner')return {status:403,rows:[]};
 const rows=[];for(const id of ids){const shared=await sharedCollection(env,workspace,id);if(shared.status!==200||!shared.row)return {status:shared.status,rows:[]};rows.push(shared.row);}
 if((await membership(env,workspace,address))?.role!=='Owner')return {status:403,rows:[]};
 return {status:200,rows};
}
function publicKey(row:DeveloperKeyRow,now=Date.now()) {
 return {id:row.id,name:row.name,workspaceId:row.workspace_id,displayPrefix:row.display_prefix,scopes:JSON.parse(row.scopes),collectionIds:JSON.parse(row.collection_ids),createdAt:row.created_at,expiresAt:row.expires_at,revokedAt:row.revoked_at,status:row.revoked_at!==null?'revoked':row.expires_at<=now?'expired':'active'};
}
async function ownedCollections(ids:string[],address:string,env:Env) {
 const rows=[];
 for(const id of ids){const row=await getCollectionRow(id,env);if(!row||row.status!=='confirmed'||row.owner_address.toLowerCase()!==address)return {status:403,rows:[]};rows.push(row);}
 try {
 if(!await rpcMatchesConfiguredChain(env))return {status:503,rows:[]};
 for(const id of ids){const chain=await getOnChainCollection(id as `0x${string}`,env);if(!chain)return {status:503,rows:[]};if(chain.owner.toLowerCase()!==address)return {status:403,rows:[]};}
 }catch{return {status:503,rows:[]};}
 return {status:200,rows};
}
async function input(request:Request){
 if(!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))return null;
 try{const value=await request.json();return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;}catch{return null;}
}
async function retention(env:Env,now:number){
 const before=now-30*86400000;
 await env.DB.batch([env.DB.prepare('DELETE FROM developer_key_minute WHERE timestamp<?').bind(before),env.DB.prepare('DELETE FROM developer_key_daily WHERE timestamp<?').bind(before)]);
}
export async function handleAccountKeys(request:Request,env:Env,account:AccountRow):Promise<Response|null>{
 const url=new URL(request.url),path=url.pathname,now=Date.now();
 if(!path.startsWith('/api/account/api-keys'))return null;
 if(url.search)return json({error:'Query parameters are not supported.'},400);
 if(path==='/api/account/api-keys/usage'&&request.method==='GET'){
 await retention(env,now);
 const visible=`(k.workspace_id IS NULL OR EXISTS(SELECT 1 FROM workspace_members m JOIN workspaces w ON w.id=m.workspace_id WHERE w.id=k.workspace_id AND w.active=1 AND m.address=? AND m.role='Owner' AND w.chain_id=k.chain_id AND w.contract_address=k.contract_address))`;
 const daily=await env.DB.prepare(`SELECT u.key_id AS keyId,u.timestamp,u.accepted,u.rejected,u.ownership_denied AS ownershipDenied,u.chain_unavailable AS chainUnavailable FROM developer_key_daily u JOIN developer_keys k ON k.id=u.key_id WHERE k.account_id=? AND ${visible} ORDER BY u.timestamp DESC LIMIT 150`).bind(account.account_id,account.address).all();
 const minute=await env.DB.prepare(`SELECT u.key_id AS keyId,u.timestamp,u.claimed,u.accepted,u.rejected,u.ownership_denied AS ownershipDenied,u.chain_unavailable AS chainUnavailable FROM developer_key_minute u JOIN developer_keys k ON k.id=u.key_id WHERE k.account_id=? AND ${visible} ORDER BY u.timestamp DESC LIMIT 120`).bind(account.account_id,account.address).all();
 return json({asOf:now,retentionDays:30,daily:daily.results,minute:minute.results,limits:{daily:150,minute:120}});
 }
 if(path==='/api/account/api-keys'&&request.method==='GET'){
 const keys=await env.DB.prepare('SELECT * FROM developer_keys WHERE account_id=? ORDER BY (revoked_at IS NULL AND expires_at>?) DESC,created_at DESC LIMIT 100').bind(account.account_id,now).all<DeveloperKeyRow>();
 const results=[];for(const key of keys.results){if(key.workspace_id!==null&&(await membership(env,key.workspace_id,account.address))?.role!=='Owner')continue;const ids=JSON.parse(key.collection_ids) as string[];const collections=[];for(const id of ids){const row=await getCollectionRow(id,env);collections.push({id,name:row?.collection_name??'Unavailable collection'});}results.push({...publicKey(key,now),collections});}
 return json({keys:results,limit:100});
 }
 if(path==='/api/account/api-keys'&&request.method==='POST'){
 const value=await input(request);
 if(!value||Object.keys(value).some(k=>!['name','collectionIds','expiresInDays','scopes','workspaceId'].includes(k))||('workspaceId' in value&&(typeof value.workspaceId!=='string'||!workspaceId(value.workspaceId)))||typeof value.name!=='string'||!value.name.trim()||value.name.trim().length>80||!Number.isInteger(value.expiresInDays)||Number(value.expiresInDays)<1||Number(value.expiresInDays)>90||!Array.isArray(value.scopes)||value.scopes.length!==1||value.scopes[0]!=='collections:read'||!Array.isArray(value.collectionIds)||value.collectionIds.length<1||value.collectionIds.length>24||value.collectionIds.some(id=>typeof id!=='string'||!isValidBytes32(id)))return json({error:'Use a name of 1 to 80 characters, 1 to 24 unique owned or explicitly shared collection IDs, collections:read scope and expiry of 1 to 90 days.'},400);
 const ids=(value.collectionIds as string[]).map(id=>id.toLowerCase());if(new Set(ids).size!==ids.length)return json({error:'Collection IDs must be unique.'},400);
 const workspace=(value.workspaceId as string|undefined)??null;
 const owned=await authorizedCollections(ids,account.address,workspace,env);if(owned.status!==200)return json({error:owned.status===503?'Chain unavailable.':'Current collection ownership or workspace Owner and shared grants are required.'},owned.status);
 const secret='dv_'+randomToken(),id=randomToken(),expires=now+Number(value.expiresInDays)*86400000;
 const {chainId,contract}=deployment(env);
 const key=await env.DB.prepare(`INSERT INTO developer_keys(id,account_id,chain_id,contract_address,name,secret_hash,display_prefix,scopes,collection_ids,created_at,expires_at,workspace_id)
 SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM developer_keys WHERE account_id=? AND expires_at>? AND revoked_at IS NULL)<5 AND (? IS NULL OR (EXISTS(SELECT 1 FROM workspace_members m JOIN workspaces w ON w.id=m.workspace_id AND w.active=1 WHERE m.workspace_id=? AND m.address=? AND m.role='Owner') AND NOT EXISTS(SELECT 1 FROM json_each(?) ids WHERE NOT EXISTS(SELECT 1 FROM workspace_grants g JOIN workspace_members issuer ON issuer.workspace_id=g.workspace_id AND issuer.address=g.grantor AND issuer.role='Owner' WHERE g.workspace_id=? AND g.collection_id=ids.value)))) RETURNING *`).bind(id,account.account_id,chainId,contract,value.name.trim(),await digest(secret),secret.slice(0,11),JSON.stringify(value.scopes),JSON.stringify(ids),now,expires,workspace,account.account_id,now,workspace,workspace,account.address,JSON.stringify(ids),workspace).first<DeveloperKeyRow>();
 if(!key){if(workspace!==null){if((await membership(env,workspace,account.address))?.role!=='Owner')return json({error:'Workspace Owner membership required.'},403);for(const id of ids)if(!await currentGrant(env,workspace,id))return json({error:'Workspace grant ended.'},403);}return json({error:'Maximum 5 active keys. Revoke a key or wait for expiry.'},409);}
 return json({key:publicKey(key,now),secret},201);
 }
 const revoke=path.match(/^\/api\/account\/api-keys\/([a-f0-9]{64})$/);
 if(revoke&&request.method==='DELETE'){
 const value=await input(request);if(!value||Object.keys(value).length)return json({error:'An empty JSON object is required.'},400);
 const key=await env.DB.prepare('UPDATE developer_keys SET revoked_at=COALESCE(revoked_at,?) WHERE id=? AND account_id=? RETURNING id').bind(now,revoke[1],account.account_id).first();
 return key?json({status:'revoked'}):json({error:'Key not found.'},404);
 }
 return json({error:'Unknown key endpoint.'},404);
}
function quota(env:Env){const raw=env.DEVELOPER_RATE_LIMIT??'60';return /^[0-9]+$/.test(raw)&&Number(raw)>=10&&Number(raw)<=1000?Number(raw):60;}
async function record(env:Env,key:string,minute:number,day:number,column:'accepted'|'rejected'|'ownership_denied'|'chain_unavailable'){
 await env.DB.batch([
 env.DB.prepare(`INSERT INTO developer_key_minute(key_id,timestamp,${column}) VALUES(?,?,1) ON CONFLICT(key_id,timestamp) DO UPDATE SET ${column}=${column}+1`).bind(key,minute),
 env.DB.prepare(`INSERT INTO developer_key_daily(key_id,timestamp,${column}) VALUES(?,?,1) ON CONFLICT(key_id,timestamp) DO UPDATE SET ${column}=${column}+1`).bind(key,day)
 ]);
}
export async function handleDeveloperCollections(request:Request,env:Env):Promise<Response>{
 const url=new URL(request.url);if(url.search)return json({error:'Do not send credentials or filters in the URL.'},400);
 const auth=request.headers.get('Authorization');
 if(!secureTransport(request,env)||!auth||!/^Bearer dv_[a-f0-9]{64}$/.test(auth))return json({error:'A single bearer API key is required.'},401);
 const {chainId,contract}=deployment(env),now=Date.now();
 const key=await env.DB.prepare(`SELECT k.*,a.address FROM developer_keys k JOIN accounts a ON a.account_id=k.account_id WHERE k.secret_hash=? AND k.chain_id=? AND k.contract_address=? AND a.chain_id=k.chain_id AND a.contract_address=k.contract_address AND k.expires_at>? AND k.revoked_at IS NULL`).bind(await digest(auth.slice(7)),chainId,contract,now).first<DeveloperKeyRow>();
 if(!key)return json({error:'API key is invalid, expired or revoked.'},401);
 let scopes:string[],ids:string[];try{scopes=JSON.parse(key.scopes);ids=JSON.parse(key.collection_ids);}catch{return json({error:'Invalid API key scope.'},403);}
 if(!Array.isArray(scopes)||scopes.length!==1||scopes[0]!=='collections:read'||!Array.isArray(ids)||!ids.length||ids.length>24||ids.some(id=>typeof id!=='string'||!isValidBytes32(id))||new Set(ids).size!==ids.length||!await developerWorkspaceAllowed(key,env))return json({error:'API key scope is not authorized.'},403);
 const minute=Math.floor(now/60000)*60000,day=Math.floor(now/86400000)*86400000;
 await retention(env,now);
 const claim=await env.DB.prepare(`INSERT INTO developer_key_minute(key_id,timestamp,claimed) SELECT ?,?,1 WHERE EXISTS(SELECT 1 FROM developer_keys WHERE id=? AND revoked_at IS NULL AND expires_at>?) ON CONFLICT(key_id,timestamp) DO UPDATE SET claimed=claimed+1 WHERE claimed<? AND EXISTS(SELECT 1 FROM developer_keys WHERE id=? AND revoked_at IS NULL AND expires_at>?) RETURNING claimed`).bind(key.id,minute,key.id,now,quota(env),key.id,now).first();
 if(!claim){const active=await env.DB.prepare('SELECT id FROM developer_keys WHERE id=? AND revoked_at IS NULL AND expires_at>?').bind(key.id,Date.now()).first();if(!active)return json({error:'API key is revoked or expired.'},401);await record(env,key.id,minute,day,'rejected');return json({error:'API key minute quota exceeded.'},429,{'Retry-After':String(Math.max(1,Math.ceil((minute+60000-Date.now())/1000)))});}
 const owned=await authorizedCollections(ids,key.address!,key.workspace_id,env);
 if(owned.status!==200){await record(env,key.id,minute,day,owned.status===503?'chain_unavailable':'ownership_denied');return json({error:owned.status===503?'Chain unavailable.':'Current collection ownership is required.'},owned.status);}
 const collections=[];for(const row of owned.rows)collections.push({collectionId:row.collection_id,name:row.collection_name,...await collectionMetadata(row.collection_id,env)});
 if(key.workspace_id!==null){if(!await developerWorkspaceAllowed(key,env))return json({error:'Workspace authorization ended.'},403);for(const row of owned.rows)if(!await currentGrant(env,key.workspace_id,row.collection_id,row.owner_address.toLowerCase()))return json({error:'Workspace grant ended.'},403);}
 await record(env,key.id,minute,day,'accepted');return json({collections});
}
