import type { Env, CollectionRow, QueryRow } from "./types";

// ── Collections ───────────────────────────────────────────────────

export async function insertCollection(
  row: Omit<CollectionRow, "policy_version" | "active" | "created_at">,
  env: Env,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO collections (collection_id, owner_address, collection_name, content_hash, policy_version, active, created_at)
     VALUES (?, ?, ?, ?, 1, 1, ?)`,
  )
    .bind(row.collection_id, row.owner_address, row.collection_name, row.content_hash, Date.now())
    .run();
}

export async function getCollectionRow(
  collectionId: string,
  env: Env,
): Promise<CollectionRow | null> {
  return env.DB.prepare("SELECT * FROM collections WHERE collection_id = ?")
    .bind(collectionId)
    .first<CollectionRow>();
}

// ── Queries ───────────────────────────────────────────────────────

export async function insertQuery(
  row: Pick<QueryRow, "request_id" | "collection_id" | "buyer_address" | "policy_version">,
  env: Env,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO queries (request_id, collection_id, buyer_address, policy_version, passage_ids, outcome, created_at)
     VALUES (?, ?, ?, ?, '[]', 'pending', ?)`,
  )
    .bind(row.request_id, row.collection_id, row.buyer_address, row.policy_version, Date.now())
    .run();
}

export async function updateQuerySettled(
  requestId: string,
  txHash: string,
  passageIds: string[],
  responseDigest: string,
  env: Env,
): Promise<void> {
  await env.DB.prepare(
    `UPDATE queries SET outcome = 'settled', tx_hash = ?, passage_ids = ?, response_digest = ?, settled_at = ?
     WHERE request_id = ?`,
  )
    .bind(txHash, JSON.stringify(passageIds), responseDigest, Date.now(), requestId)
    .run();
}

export async function updateQueryOutcome(
  requestId: string,
  outcome: string,
  env: Env,
): Promise<void> {
  await env.DB.prepare("UPDATE queries SET outcome = ? WHERE request_id = ?")
    .bind(outcome, requestId)
    .run();
}

export async function getQueryRow(requestId: string, env: Env): Promise<QueryRow | null> {
  return env.DB.prepare("SELECT * FROM queries WHERE request_id = ?")
    .bind(requestId)
    .first<QueryRow>();
}

export async function requestIdExists(requestId: string, env: Env): Promise<boolean> {
  const row = await env.DB.prepare("SELECT 1 FROM queries WHERE request_id = ?")
    .bind(requestId)
    .first<{ "1": number }>();
  return row !== null;
}
