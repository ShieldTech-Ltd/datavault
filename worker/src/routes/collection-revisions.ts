import type { Env } from "../lib/types";
import {
  readSession,
  validCsrf,
  trustedAccountOrigin,
  deployment,
} from "../lib/account-session";
import { getCollectionRow } from "../lib/d1";
import { getOnChainCollection } from "../lib/policy";
import { rpcMatchesConfiguredChain } from "../lib/chain-identity";
import { isValidBytes32 } from "../lib/validation";
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
interface Family {
  original_collection_id: string;
  current_collection_id: string;
  current_ordinal: number;
  owner_address: string;
}
interface Member {
  collection_id: string;
  original_collection_id: string;
  parent_collection_id: string | null;
  ordinal: number;
}
async function member(id: string, env: Env) {
  const { chainId, contract } = deployment(env);
  return env.DB.prepare(
    "SELECT * FROM collection_revision_members WHERE chain_id=? AND contract_address=? AND collection_id=?"
  )
    .bind(chainId, contract, id)
    .first<Member>();
}
export async function revisionSummary(id: string, env: Env, owner?: string) {
  const { chainId, contract } = deployment(env),
    link = await member(id, env);
  if (!link) return {};
  const family = await env.DB.prepare(
    `SELECT f.*, COALESCE(m.visibility,'public') AS visibility FROM collection_revision_families f
 LEFT JOIN collection_metadata m ON m.chain_id=f.chain_id AND m.contract_address=f.contract_address AND m.collection_id=f.current_collection_id
 WHERE f.chain_id=? AND f.contract_address=? AND f.original_collection_id=?`
  )
    .bind(chainId, contract, link.original_collection_id)
    .first<Family & { visibility: string }>();
  if (!family || family.current_collection_id === id) return {};
  return family.visibility === "public" || family.owner_address === owner
    ? { currentCollectionId: family.current_collection_id }
    : { newerUnlistedRevision: true };
}
export async function handleCollectionRevisions(
  req: Request,
  env: Env,
  rawId: string
): Promise<Response> {
  if (!isValidBytes32(rawId))
    return json({ error: "Invalid collection ID" }, 400);
  const id = rawId.toLowerCase(),
    { chainId, contract } = deployment(env);
  const session = await readSession(req, env);
  if (req.method === "POST") {
    if (!session) return json({ error: "Sign in to your account" }, 401);
    if (!trustedAccountOrigin(req, env) || !validCsrf(req, session))
      return json({ error: "Invalid origin or CSRF token" }, 403);
    let body: any;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      Object.keys(body).length !== 1 ||
      !isValidBytes32(body.collectionId) ||
      body.collectionId.toLowerCase() === id
    )
      return json(
        { error: "Supply a distinct confirmed collectionId only" },
        400
      );
    const next = body.collectionId.toLowerCase();
    const [parent, candidate] = await Promise.all([
      getCollectionRow(id, env),
      getCollectionRow(next, env),
    ]);
    if (
      !parent ||
      !candidate ||
      parent.status !== "confirmed" ||
      candidate.status !== "confirmed"
    )
      return json(
        { error: "Confirmed collections required in this deployment" },
        404
      );
    const owner = session.account.address;
    if (
      parent.owner_address.toLowerCase() !== owner ||
      candidate.owner_address.toLowerCase() !== owner
    )
      return json({ error: "Owner required" }, 403);
    try {
      if (!(await rpcMatchesConfiguredChain(env)))
        return json({ error: "Chain unavailable" }, 503);
      const chain = await Promise.all([
        getOnChainCollection(id as `0x${string}`, env),
        getOnChainCollection(next as `0x${string}`, env),
      ]);
      if (chain.some((c) => !c))
        return json({ error: "Chain unavailable" }, 503);
      if (chain.some((c) => c!.owner.toLowerCase() !== owner))
        return json({ error: "Owner required" }, 403);
    } catch {
      return json({ error: "Chain unavailable" }, 503);
    }
    const [oldLink, newLink] = await Promise.all([
      member(id, env),
      member(next, env),
    ]);
    if (newLink) {
      if (newLink.parent_collection_id === id)
        return handleCollectionRevisions(
          new Request(req.url, { headers: req.headers }),
          env,
          id
        );
      return json(
        { error: "Collection already belongs to a revision family" },
        409
      );
    }
    const original = oldLink?.original_collection_id ?? id,
      ordinal = (oldLink?.ordinal ?? 1) + 1;
    try {
      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO collection_revision_members(chain_id,contract_address,collection_id,original_collection_id,parent_collection_id,owner_address,ordinal,linked_at) VALUES(?,?,?,?,?,?,?,?)`
        ).bind(
          chainId,
          contract,
          next,
          original,
          id,
          owner,
          ordinal,
          Date.now()
        ),
      ]);
    } catch {
      const winner = await member(next, env);
      if (winner?.parent_collection_id !== id)
        return json(
          {
            error:
              "Revision link conflict. Refresh the current version before retrying.",
          },
          409
        );
    }
    return handleCollectionRevisions(
      new Request(req.url, { headers: req.headers }),
      env,
      id
    );
  }
  const url = new URL(req.url),
    limitText = url.searchParams.get("limit") ?? "50",
    cursorText = url.searchParams.get("cursor") ?? "0";
  const limit = Number(limitText),
    cursor = Number(cursorText);
  if (
    !/^\d+$/.test(limitText) ||
    !/^\d+$/.test(cursorText) ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 50 ||
    !Number.isSafeInteger(cursor) ||
    cursor < 0
  )
    return json(
      { error: "limit must be 1 to 50; cursor must be a nonnegative ordinal" },
      400
    );
  const row = await getCollectionRow(id, env);
  if (!row || row.status !== "confirmed")
    return json({ error: "Collection not found" }, 404);
  const link = await member(id, env);
  if (!link)
    return json({
      originalCollectionId: id,
      currentCollectionId: id,
      versions:
        cursor < 1
          ? [
              {
                collectionId: id,
                name: row.collection_name,
                ordinal: 1,
                registrationTxHash: row.confirmed_tx,
              },
            ]
          : [],
      nextCursor: null,
    });
  const family = await env.DB.prepare(
    "SELECT * FROM collection_revision_families WHERE chain_id=? AND contract_address=? AND original_collection_id=?"
  )
    .bind(chainId, contract, link.original_collection_id)
    .first<Family>();
  if (!family) return json({ error: "Family unavailable" }, 503);
  const owner = session?.account.address === family.owner_address;
  const visible = owner
    ? ""
    : "AND (COALESCE(m.visibility,'public')='public' OR r.collection_id=?)";
  const args: any[] = [chainId, contract, link.original_collection_id, cursor];
  if (!owner) args.push(id);
  args.push(limit + 1);
  const result = await env.DB.prepare(
    `SELECT r.collection_id, r.ordinal, c.collection_name, c.confirmed_tx FROM collection_revision_members r
 JOIN collections c ON c.collection_id=r.collection_id AND c.chain_id=r.chain_id AND c.contract_address=r.contract_address AND c.status='confirmed'
 LEFT JOIN collection_metadata m ON m.chain_id=r.chain_id AND m.contract_address=r.contract_address AND m.collection_id=r.collection_id
 WHERE r.chain_id=? AND r.contract_address=? AND r.original_collection_id=? AND r.ordinal>? ${visible} ORDER BY r.ordinal ASC LIMIT ?`
  )
    .bind(...args)
    .all<{
      collection_id: string;
      ordinal: number;
      collection_name: string;
      confirmed_tx: string | null;
    }>();
  // Resolve sensitive root/current identifiers independently, rather than copying family IDs.
  async function permitted(target: string) {
    if (owner || target === id) return true;
    const metadata = await env.DB.prepare(
      "SELECT visibility FROM collection_metadata WHERE chain_id=? AND contract_address=? AND collection_id=?"
    )
      .bind(chainId, contract, target)
      .first<{ visibility: string }>();
    return metadata?.visibility !== "unlisted";
  }
  const versions = result.results
    .slice(0, limit)
    .map((v) => ({
      collectionId: v.collection_id,
      name: v.collection_name,
      ordinal: v.ordinal,
      registrationTxHash: v.confirmed_tx,
    }));
  return json({
    ...((await permitted(family.original_collection_id))
      ? { originalCollectionId: family.original_collection_id }
      : {}),
    ...((await permitted(family.current_collection_id))
      ? { currentCollectionId: family.current_collection_id }
      : { newerUnlistedRevision: true }),
    versions,
    nextCursor:
      result.results.length > limit
        ? versions[versions.length - 1].ordinal
        : null,
  });
}
