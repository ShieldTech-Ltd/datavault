import type { Env } from "../lib/types";
import {
  readSession,
  validCsrf,
  trustedAccountOrigin,
} from "../lib/account-session";
import { getCollectionRow } from "../lib/d1";
import { getOnChainCollection } from "../lib/policy";
import { rpcMatchesConfiguredChain } from "../lib/chain-identity";
import { isValidBytes32 } from "../lib/validation";
import {membership,sharedCollection,workspaceId} from '../lib/workspaces';
export const categories = [
  "General",
  "Technology",
  "Business",
  "Research",
  "Education",
  "Finance",
  "Legal",
  "Other",
];
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
export async function collectionMetadata(id: string, env: Env) {
  return (
    (await env.DB.prepare(
      "SELECT description, category, visibility FROM collection_metadata WHERE chain_id = ? AND contract_address = ? AND collection_id = ?"
    )
      .bind(Number(env.CHAIN_ID), env.CONTRACT_ADDRESS.toLowerCase(), id)
      .first<{
        description: string;
        category: string;
        visibility: string;
      }>()) ?? { description: "", category: "General", visibility: "public" }
  );
}
export async function handleCollectionMetadata(
  req: Request,
  env: Env,
  id: string
): Promise<Response> {
  if (!isValidBytes32(id)) return json({ error: "Invalid collection ID" }, 400);
  const session = await readSession(req, env);
  if (!session) return json({ error: "Sign in to your account" }, 401);
  if (!trustedAccountOrigin(req, env) || !validCsrf(req, session))
    return json({ error: "Invalid origin or CSRF token" }, 403);
  const params=new URL(req.url).searchParams,workspace=params.get('workspaceId');
  if([...params.keys()].some(k=>k!=='workspaceId')||params.getAll('workspaceId').length>1||(workspace!==null&&!workspaceId(workspace)))return json({error:'Invalid metadata scope'},400);
  const text = await req.text();
  if (new TextEncoder().encode(text).length > 12000)
    return json({ error: "Metadata too large" }, 413);
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    !Object.keys(body).length ||
    Object.keys(body).some(
      (k) => !["description", "category", "visibility"].includes(k)
    ) ||
    ("description" in body &&
      (typeof body.description !== "string" ||
        body.description.length > 2000)) ||
    ("category" in body && !categories.includes(body.category)) ||
    ("visibility" in body && !["public", "unlisted"].includes(body.visibility))
  )
    return json({ error: "Invalid metadata" }, 400);
  const row = await getCollectionRow(id, env);
  if (!row || row.status !== "confirmed")
    return json({ error: "Collection not found" }, 404);
  let sharedOwner:string|undefined;
  if(workspace!==null){const member=await membership(env,workspace,session.account.address);if(!member||member.role==='Viewer')return json({error:'Owner or Editor membership required'},403);const shared=await sharedCollection(env,workspace,id);if(shared.status!==200)return json({error:shared.status===503?'Chain unavailable':'Valid shared metadata grant required'},shared.status);sharedOwner=shared.grantor;}
  if (workspace===null && row.owner_address.toLowerCase() !== session.account.address)
    return json({ error: "Owner required" }, 403);
  let chain;
  try {
    if (!(await rpcMatchesConfiguredChain(env))) return json({ error: "Chain unavailable" }, 503);
    chain = await getOnChainCollection(id as `0x${string}`, env);
  } catch {
    return json({ error: "Chain unavailable" }, 503);
  }
  if (!chain) return json({ error: "Chain unavailable" }, 503);
  if (chain.owner.toLowerCase() !== (sharedOwner??session.account.address))
    return json({ error: "Owner required" }, 403);
  const value = await env.DB.prepare(
    `INSERT INTO collection_metadata(chain_id,contract_address,collection_id,description,category,visibility,updated_at) SELECT ?,?,?,?,?,?,? WHERE ? IS NULL OR EXISTS(SELECT 1 FROM workspace_grants g JOIN workspaces w ON w.id=g.workspace_id AND w.active=1 JOIN workspace_members issuer ON issuer.workspace_id=g.workspace_id AND issuer.address=g.grantor AND issuer.role='Owner' JOIN workspace_members editor ON editor.workspace_id=g.workspace_id AND editor.address=? AND editor.role IN ('Owner','Editor') WHERE g.workspace_id=? AND g.collection_id=? AND g.grantor=?) ON CONFLICT(chain_id,contract_address,collection_id) DO UPDATE SET
      description=CASE WHEN ? THEN excluded.description ELSE collection_metadata.description END,
      category=CASE WHEN ? THEN excluded.category ELSE collection_metadata.category END,
      visibility=CASE WHEN ? THEN excluded.visibility ELSE collection_metadata.visibility END,
      updated_at=excluded.updated_at
      RETURNING description, category, visibility`
  )
    .bind(
      Number(env.CHAIN_ID),
      env.CONTRACT_ADDRESS.toLowerCase(),
      id,
      body.description ?? "",
      body.category ?? "General",
      body.visibility ?? "public",
      Date.now(),
      workspace,session.account.address,workspace,id,sharedOwner??null,
      "description" in body ? 1 : 0,
      "category" in body ? 1 : 0,
      "visibility" in body ? 1 : 0
    )
    .first();
  return value?json(value):json({error:'Workspace authorization ended'},403);
}
