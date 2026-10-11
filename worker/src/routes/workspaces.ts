import { isAddress } from 'viem';
import type {Env} from '../lib/types';
import type {AccountRow} from '../lib/account-session';
import {deployment,randomToken} from '../lib/account-session';
import {membership,ownWorkspaces,ownInvitations,roles,workspaceId,sharedCollection,currentGrant} from '../lib/workspaces';
import {getCollectionRow} from '../lib/d1';
import {getOnChainCollection} from '../lib/policy';
import {rpcMatchesConfiguredChain} from '../lib/chain-identity';
import {isValidBytes32} from '../lib/validation';
import {collectionMetadata} from './collection-metadata';
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
async function input(req:Request,fields:string[]){try {if(!req.headers.get('Content-Type')?.startsWith('application/json'))return null;const v=await req.json() as Record<string,unknown>;return v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>fields.includes(k))?v:null;}catch{return null;}}
const name=(v:unknown):v is string=>typeof v==='string'&&v.trim().length>=1&&v.trim().length<=80&&!/[\u0000-\u001f\u007f]/.test(v);
// Every write repeats membership authorization in its SQL, including writes after RPC awaits.
const owner=`EXISTS(SELECT 1 FROM workspace_members WHERE workspace_id=? AND address=? AND role='Owner')`;
async function auditBatch(env:Env,statement:D1PreparedStatement,w:string,actor:string,action:string,target:string){
 const results=await env.DB.batch([statement,env.DB.prepare('INSERT INTO workspace_audit(workspace_id,actor,action,target,created_at) SELECT ?,?,?,?,? WHERE changes()>0').bind(w,actor,action,target,Date.now())]);
 return results[0];
}
export async function handleWorkspaces(req:Request,env:Env,account:AccountRow):Promise<Response|null>{
 const url=new URL(req.url),path=url.pathname,method=req.method,address=account.address,now=Date.now(),{chainId,contract}=deployment(env);
 if(path!=='/api/account/workspaces'&&path!=='/api/account/invitations'&&!path.startsWith('/api/workspaces/'))return null;
 if(path==='/api/account/workspaces'){
 if(url.search)return json({error:'Unsupported query'},400);
 if(method==='GET')return json({workspaces:await ownWorkspaces(env,address),limit:100});
 if(method==='POST'){const v=await input(req,['name']);if(!v||!name(v.name))return json({error:'Name must be 1 to 80 characters'},400);const id=randomToken();
 try {await env.DB.batch([env.DB.prepare('INSERT INTO workspaces(id,chain_id,contract_address,name,created_at) VALUES(?,?,?,?,?)').bind(id,chainId,contract,v.name.trim(),now),env.DB.prepare("INSERT INTO workspace_members(workspace_id,address,role,joined_at) VALUES(?,?,'Owner',?)").bind(id,address,now),env.DB.prepare("INSERT INTO workspace_audit(workspace_id,actor,action,target,created_at) VALUES(?,?,'created',?,?)").bind(id,address,address,now)]);}catch(e){if(String(e).includes('workspace Owner limit'))return json({error:'Maximum 5 owned workspaces'},409);throw e;}
 return json({workspace:await membership(env,id,address)},201);}}
 if(path==='/api/account/invitations')return method==='GET'&&!url.search?json({invitations:await ownInvitations(env,address),limit:100}):json({error:'Invalid invitation endpoint'},400);
 const match=path.match(/^\/api\/workspaces\/([a-f0-9]{64})(?:\/(.*))?$/);if(!match||!workspaceId(match[1]))return json({error:'Workspace not found'},404);
 const w=match[1],tail=match[2]??'';
 if(url.search&&tail!=='members'&&tail!=='invitations'&&tail!=='collections')return json({error:'Unsupported query'},400);
 const acceptance=tail.match(/^invitations\/([a-f0-9]{64})\/accept$/);
 if(acceptance&&method==='POST'){
 const v=await input(req,[]);if(!v)return json({error:'Empty JSON object required'},400);
 const invitation=await env.DB.prepare(`SELECT i.accepted_at,i.inviter FROM workspace_invitations i JOIN workspaces w ON w.id=i.workspace_id WHERE i.id=? AND i.workspace_id=? AND i.address=? AND w.chain_id=? AND w.contract_address=? AND w.active=1`).bind(acceptance[1],w,address,chainId,contract).first<{accepted_at:number|null;inviter:string}>();
 if(!invitation)return json({error:'Invitation not found'},404);
 if(invitation.accepted_at!==null)return await membership(env,w,address)?json({status:'accepted'}):json({error:'Invitation already consumed'},409);
 try {const results=await env.DB.batch([
 env.DB.prepare(`INSERT INTO workspace_members(workspace_id,address,role,joined_at) SELECT workspace_id,address,role,? FROM workspace_invitations WHERE id=? AND workspace_id=? AND address=? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>? AND ${owner} ON CONFLICT(workspace_id,address) DO NOTHING`).bind(now,acceptance[1],w,address,now,w,invitation.inviter),
 env.DB.prepare(`UPDATE workspace_invitations SET accepted_at=? WHERE id=? AND address=? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>? AND EXISTS(SELECT 1 FROM workspace_members WHERE workspace_id=? AND address=?) RETURNING id`).bind(now,acceptance[1],address,now,w,address),
 env.DB.prepare("INSERT INTO workspace_audit(workspace_id,actor,action,target,created_at) SELECT ?,?,'accepted',?,? WHERE changes()>0").bind(w,address,address,now)]);
 if(results[1].results.length)return json({status:'accepted'});
 const accepted=await env.DB.prepare('SELECT id FROM workspace_invitations WHERE id=? AND workspace_id=? AND address=? AND accepted_at IS NOT NULL').bind(acceptance[1],w,address).first();
 return accepted&&await membership(env,w,address)?json({status:'accepted'}):json({error:'Invitation expired or revoked'},404);
 }catch(e){if(String(e).includes('workspace')&&String(e).includes('limit'))return json({error:'Workspace membership limit'},409);throw e;}}
 const member=await membership(env,w,address);if(!member)return json({error:'Workspace not found'},404);
 if(!tail&&method==='GET')return json({workspace:member});
 if(!tail&&method==='PATCH'){if(member.role!=='Owner')return json({error:'Owner required'},403);const v=await input(req,['name']);if(!v||!name(v.name))return json({error:'Invalid workspace name'},400);const result=await auditBatch(env,env.DB.prepare(`UPDATE workspaces SET name=? WHERE id=? AND ${owner} RETURNING id`).bind(v.name.trim(),w,w,address),w,address,'renamed',w);return result.results.length?json({workspace:await membership(env,w,address)}):json({error:'Owner required'},403);}
 if(['members','invitations','collections'].includes(tail)&&method==='GET'){
 const raw=url.searchParams.get('limit')??'20',cursor=url.searchParams.get('cursor')??'';
 if([...url.searchParams.keys()].some(k=>!['limit','cursor'].includes(k))||!/^[1-9][0-9]*$/.test(raw)||Number(raw)>50||(cursor&&!/^(?:[a-f0-9]{64}|0x[a-f0-9]{40}|0x[a-f0-9]{64})$/.test(cursor)))return json({error:'Invalid pagination'},400);
 const limit=Number(raw);
 if(tail==='members'){const rows=await env.DB.prepare('SELECT address,role,joined_at AS joinedAt FROM workspace_members WHERE workspace_id=? AND address>? ORDER BY address LIMIT ?').bind(w,cursor,limit+1).all();return json({members:rows.results.slice(0,limit),nextCursor:rows.results.length>limit?(rows.results[limit-1] as any).address:null});}
 if(tail==='invitations'){if(member.role!=='Owner')return json({error:'Owner required'},403);const rows=await env.DB.prepare('SELECT id,address,role,created_at AS createdAt,expires_at AS expiresAt FROM workspace_invitations WHERE workspace_id=? AND id>? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>? ORDER BY id LIMIT ?').bind(w,cursor,now,limit+1).all();return json({invitations:rows.results.slice(0,limit),nextCursor:rows.results.length>limit?(rows.results[limit-1] as any).id:null});}
 const rows=await env.DB.prepare('SELECT collection_id FROM workspace_grants WHERE workspace_id=? AND collection_id>? ORDER BY collection_id LIMIT ?').bind(w,cursor,limit+1).all<{collection_id:string}>();const collections=[],grantors=new Map<string,string>();
 for(const grant of rows.results.slice(0,limit)){const shared=await sharedCollection(env,w,grant.collection_id);if(shared.status===503)return json({error:'Chain unavailable'},503);if(shared.row){grantors.set(shared.row.collection_id,shared.row.owner_address.toLowerCase());collections.push({collectionId:shared.row.collection_id,name:shared.row.collection_name,...await collectionMetadata(shared.row.collection_id,env)});}}
 if(!await membership(env,w,address))return json({error:'Workspace membership ended'},403);
 for(let i=collections.length-1;i>=0;i--)if(!await currentGrant(env,w,collections[i].collectionId,grantors.get(collections[i].collectionId)))collections.splice(i,1);
 return json({collections,nextCursor:rows.results.length>limit?rows.results[limit-1].collection_id:null});}
 if(tail==='invitations'&&method==='POST'){
 if(member.role!=='Owner')return json({error:'Owner required'},403);const v=await input(req,['address','role']);if(!v||typeof v.address!=='string'||!isAddress(v.address)||!roles.includes(v.role as any))return json({error:'Valid wallet and role required'},400);const target=v.address.toLowerCase();if(await membership(env,w,target))return json({error:'Already a member'},409);const id=randomToken();
 try {const r=await env.DB.batch([env.DB.prepare('UPDATE workspace_invitations SET revoked_at=? WHERE workspace_id=? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at<=?').bind(now,w,now),env.DB.prepare(`INSERT INTO workspace_invitations(id,workspace_id,address,role,inviter,created_at,expires_at) SELECT ?,?,?,?,?,?,? WHERE ${owner} RETURNING id`).bind(id,w,target,v.role,address,now,now+7*86400000,w,address),env.DB.prepare("INSERT INTO workspace_audit(workspace_id,actor,action,target,created_at) SELECT ?,?,'invited',?,? WHERE changes()>0").bind(w,address,target,now)]);return r[1].results.length?json({invitation:{id,address:target,role:v.role,expiresAt:now+7*86400000}},201):json({error:'Owner required'},403);}catch(e){if(/UNIQUE|workspace invitation limit/.test(String(e)))return json({error:'Pending invitation exists or maximum 50 pending invitations'},409);throw e;}}
 const revoke=tail.match(/^invitations\/([a-f0-9]{64})$/);
 if(revoke&&method==='DELETE'){if(member.role!=='Owner')return json({error:'Owner required'},403);if(!await input(req,[]))return json({error:'Empty JSON object required'},400);const r=await auditBatch(env,env.DB.prepare(`UPDATE workspace_invitations SET revoked_at=COALESCE(revoked_at,?) WHERE id=? AND workspace_id=? AND ${owner} RETURNING id`).bind(now,revoke[1],w,w,address),w,address,'invitation_revoked',revoke[1]);return r.results.length?json({status:'revoked'}):json({error:'Invitation not found'},404);}
 const targetMember=tail.match(/^members\/(0x[a-fA-F0-9]{40})$/);
 if((targetMember&&['PATCH','DELETE'].includes(method))||(tail==='leave'&&method==='POST')){
 const leaving=tail==='leave',target=leaving?address:targetMember![1].toLowerCase();if(!leaving&&member.role!=='Owner')return json({error:'Owner required'},403);const v=await input(req,method==='PATCH'?['role']:[]);if(!v||(method==='PATCH'&&!roles.includes(v.role as any)))return json({error:'Invalid membership update'},400);
 const guard=leaving?'address=?':owner;const args=leaving?[address]:[w,address];
 try {const stmt=method==='PATCH'?env.DB.prepare(`UPDATE workspace_members SET role=? WHERE workspace_id=? AND address=? AND ${guard} RETURNING address`).bind(v.role,w,target,...args):env.DB.prepare(`DELETE FROM workspace_members WHERE workspace_id=? AND address=? AND ${guard} RETURNING address`).bind(w,target,...args);const r=await auditBatch(env,stmt,w,address,leaving?'left':method==='PATCH'?'role_changed':'removed',target);return r.results.length?json({status:'updated'}):json({error:'Membership unavailable'},404);}catch(e){if(/last workspace Owner|workspace Owner limit/.test(String(e)))return json({error:'Keep at least one Owner; maximum 5 owned workspaces per wallet'},409);throw e;}}
 if(tail==='collections'&&method==='POST'){
 if(member.role!=='Owner')return json({error:'Owner required'},403);const v=await input(req,['collectionId']);if(!v||typeof v.collectionId!=='string'||!isValidBytes32(v.collectionId))return json({error:'Invalid collection ID'},400);const id=v.collectionId.toLowerCase(),row=await getCollectionRow(id,env);if(!row||row.status!=='confirmed'||row.owner_address.toLowerCase()!==address)return json({error:'Confirmed wallet-owned collection required'},403);
 try {if(!await rpcMatchesConfiguredChain(env))return json({error:'Chain unavailable'},503);const chain=await getOnChainCollection(id as `0x${string}`,env);if(!chain)return json({error:'Chain unavailable'},503);if(chain.owner.toLowerCase()!==address)return json({error:'Wallet owner required'},403);}catch{return json({error:'Chain unavailable'},503);}
 const r=await auditBatch(env,env.DB.prepare(`INSERT INTO workspace_grants(workspace_id,collection_id,grantor,created_at) SELECT ?,?,?,? WHERE ${owner} ON CONFLICT(workspace_id,collection_id) DO UPDATE SET grantor=excluded.grantor,created_at=excluded.created_at RETURNING collection_id`).bind(w,id,address,now,w,address),w,address,'shared',id);return r.results.length?json({collectionId:id},201):json({error:'Owner required'},403);}
 const grant=tail.match(/^collections\/(0x[a-fA-F0-9]{64})$/);
 if(grant&&method==='DELETE'){if(!await input(req,[]))return json({error:'Empty JSON object required'},400);const r=await auditBatch(env,env.DB.prepare(`DELETE FROM workspace_grants WHERE workspace_id=? AND collection_id=? AND (grantor=? OR ${owner}) RETURNING collection_id`).bind(w,grant[1].toLowerCase(),address,w,address),w,address,'unshared',grant[1]);return r.results.length?json({status:'removed'}):json({error:'Grant not found'},404);}
 return json({error:'Unknown workspace endpoint'},404);
}
