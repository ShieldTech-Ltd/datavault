import type { Env, CollectionRow, QueryRow } from "./types";

// ── Collections ───────────────────────────────────────────────────

export async function insertCollection(
  row: Omit<CollectionRow, "policy_version" | "active" | "status" | "staged_at" | "confirmed_tx" | "created_at">,
  env: Env,
): Promise<void> {
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO collections
       (collection_id, owner_address, collection_name, content_hash, policy_version, active, status, staged_at, created_at)
     VALUES (?, ?, ?, ?, 1, 1, 'staging', ?, ?)`,
  )
    .bind(row.collection_id, row.owner_address, row.collection_name, row.content_hash, now, now)
    .run();
}

export async function confirmCollection(
  collectionId: string,
  txHash: string,
  env: Env,
): Promise<void> {
  await env.DB.prepare(
    `UPDATE collections SET status = 'confirmed', confirmed_tx = ? WHERE collection_id = ?`,
  )
    .bind(txHash, collectionId)
    .run();
}

export async function markCollectionOrphaned(collectionId: string, env: Env): Promise<void> {
  await env.DB.prepare(
    `UPDATE collections SET status = 'orphaned' WHERE collection_id = ? AND status = 'staging'`,
  )
    .bind(collectionId)
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
  row: Pick<QueryRow, "request_id" | "collection_id" | "buyer_address" | "policy_version"> & { question_digest: string },
  env: Env,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO queries (request_id, collection_id, buyer_address, policy_version, question_digest, passage_ids, outcome, created_at)
     VALUES (?, ?, ?, ?, ?, '[]', 'pending', ?)`,
  )
    .bind(row.request_id, row.collection_id, row.buyer_address, row.policy_version, row.question_digest, Date.now())
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
