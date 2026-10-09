import type { Env } from './types';
import { deployment } from './account-session';
import { getCollectionRow } from './d1';
import { getOnChainCollection } from './policy';
import { rpcMatchesConfiguredChain } from './chain-identity';
export type WorkspaceRole = 'Owner' | 'Editor' | 'Viewer';
export interface Workspace { id: string; name: string; role: WorkspaceRole; createdAt: number }
export const roles: WorkspaceRole[] = ['Owner', 'Editor', 'Viewer'];
export const workspaceId = (id: string) => /^[a-f0-9]{64}$/.test(id);
export async function membership(env: Env, id: string, address: string) {
 const {chainId,contract}=deployment(env);
 return env.DB.prepare(`SELECT w.id,w.name,w.created_at AS createdAt,m.role FROM workspaces w JOIN workspace_members m ON m.workspace_id=w.id
 WHERE w.id=? AND w.chain_id=? AND w.contract_address=? AND w.active=1 AND m.address=?`).bind(id,chainId,contract,address).first<Workspace>();
}
export async function ownWorkspaces(env: Env,address:string) {
 const {chainId,contract}=deployment(env);
 return (await env.DB.prepare(`SELECT w.id,w.name,w.created_at AS createdAt,m.role FROM workspaces w JOIN workspace_members m ON m.workspace_id=w.id
 WHERE w.chain_id=? AND w.contract_address=? AND w.active=1 AND m.address=? ORDER BY w.created_at DESC,w.id LIMIT 100`).bind(chainId,contract,address).all<Workspace>()).results;
}
export async function ownInvitations(env:Env,address:string) {
 const {chainId,contract}=deployment(env);
 return (await env.DB.prepare(`SELECT i.id,i.workspace_id AS workspaceId,w.name,i.role,i.created_at AS createdAt,i.expires_at AS expiresAt FROM workspace_invitations i JOIN workspaces w ON w.id=i.workspace_id
 WHERE w.chain_id=? AND w.contract_address=? AND w.active=1 AND i.address=? AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at>?
 AND EXISTS(SELECT 1 FROM workspace_members WHERE workspace_id=w.id AND address=i.inviter AND role='Owner') ORDER BY i.created_at DESC,i.id LIMIT 100`).bind(chainId,contract,address,Date.now()).all()).results;
}
// Verify the grant and its issuer on every request. No collection source or answer is returned.
export async function sharedCollection(env:Env,workspace:string,id:string) {
 const {chainId,contract}=deployment(env);
 const grant=await env.DB.prepare(`SELECT g.grantor FROM workspace_grants g JOIN workspaces w ON w.id=g.workspace_id JOIN workspace_members m ON m.workspace_id=w.id AND m.address=g.grantor AND m.role='Owner'
 WHERE g.workspace_id=? AND g.collection_id=? AND w.chain_id=? AND w.contract_address=? AND w.active=1`).bind(workspace,id,chainId,contract).first<{grantor:string}>();
 if(!grant)return {status:403 as number,row:null};
 const row=await getCollectionRow(id,env);
 if(!row||row.status!=='confirmed'||row.owner_address.toLowerCase()!==grant.grantor)return {status:403,row:null};
 try {if(!await rpcMatchesConfiguredChain(env))return {status:503,row:null};const chain=await getOnChainCollection(id as `0x${string}`,env);if(!chain)return {status:503,row:null};if(chain.owner.toLowerCase()!==grant.grantor)return {status:403,row:null};}catch{return {status:503,row:null};}
 if(!await currentGrant(env,workspace,id,grant.grantor))return {status:403,row:null};
 return {status:200,row,grantor:grant.grantor};
}
export async function currentGrant(env:Env,workspace:string,id:string,grantor?:string) {
 const {chainId,contract}=deployment(env);
 return Boolean(await env.DB.prepare(`SELECT g.collection_id FROM workspace_grants g JOIN workspaces w ON w.id=g.workspace_id JOIN workspace_members m ON m.workspace_id=w.id AND m.address=g.grantor AND m.role='Owner'
 WHERE g.workspace_id=? AND g.collection_id=? AND w.chain_id=? AND w.contract_address=? AND w.active=1 AND (? IS NULL OR g.grantor=?)`).bind(workspace,id,chainId,contract,grantor??null,grantor??null).first());
}
