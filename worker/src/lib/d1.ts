import type { Env, CollectionRow, QueryRow } from "./types";

// ── Collections ───────────────────────────────────────────────────

export async function insertCollection(
  row: Omit<
    CollectionRow,
    | "chain_id"
    | "contract_address"
    | "policy_version"
    | "active"
    | "status"
    | "staged_at"
    | "confirmed_tx"
    | "created_at"
  >,
  env: Env,
  restageAfterMs = 30 * 60 * 1000
): Promise<boolean> {
  const now = Date.now();
  const result = await env.DB.prepare(
    `INSERT INTO collections
       (collection_id, owner_address, collection_name, content_hash, chain_id, contract_address, policy_version, active, status, staged_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, 1, 'staging', ?, ?)
     ON CONFLICT(collection_id) DO UPDATE SET
       owner_address = excluded.owner_address,
       collection_name = excluded.collection_name,
       content_hash = excluded.content_hash,
       chain_id = excluded.chain_id,
       contract_address = excluded.contract_address,
       policy_version = 1,
       active = 1,
       status = 'staging',
       staged_at = excluded.staged_at,
       confirmed_tx = NULL
     WHERE collections.status = 'orphaned'
       OR (collections.status = 'staging' AND collections.staged_at < ?)`
  )
    .bind(
      row.collection_id,
      row.owner_address,
      row.collection_name,
      row.content_hash,
      Number(env.CHAIN_ID),
      env.CONTRACT_ADDRESS.toLowerCase(),
      now,
      now,
      now - restageAfterMs
    )
    .run();
  return result.meta.changes === 1;
}

export async function confirmCollection(
  collectionId: string,
  txHash: string,
  env: Env
): Promise<boolean> {
  const result = await env.DB.prepare(
    `UPDATE collections SET status = 'confirmed', confirmed_tx = ?
     WHERE collection_id = ? AND status = 'staging' AND chain_id = ?
       AND contract_address = ?`
  )
    .bind(txHash, collectionId, Number(env.CHAIN_ID), env.CONTRACT_ADDRESS.toLowerCase())
    .run();
  return result.meta.changes === 1;
}

export async function markCollectionOrphaned(
  collectionId: string,
  env: Env
): Promise<void> {
  await env.DB.prepare(
    `UPDATE collections SET status = 'orphaned' WHERE collection_id = ? AND status = 'staging'`
  )
    .bind(collectionId)
    .run();
}

export async function getCollectionRow(
  collectionId: string,
  env: Env
): Promise<CollectionRow | null> {
  return env.DB.prepare(
    "SELECT * FROM collections WHERE collection_id = ? AND chain_id = ? AND contract_address = ?"
  )
    .bind(
      collectionId,
      Number(env.CHAIN_ID),
      env.CONTRACT_ADDRESS.toLowerCase()
    )
    .first<CollectionRow>();
}

// ── Queries ───────────────────────────────────────────────────────

// Atomically claims a requestId. Returns a fencing token only to the winner.
// Uses INSERT OR IGNORE so the operation is a single atomic step in SQLite.
export async function claimQuery(
  row: Pick<
    QueryRow,
    "request_id" | "collection_id" | "buyer_address" | "policy_version"
  > & {
    question_digest: string;
    open_tx_hash?: string;
    chain_id?: number;
    contract_address?: string;
    content_hash?: string;
    amount_wei?: string;
  },
  env: Env,
  leaseMs = 60_000
): Promise<string | null> {
  const now = Date.now();
  const token = crypto.randomUUID();
  const result = await env.DB.prepare(
    `INSERT OR IGNORE INTO queries
       (request_id, collection_id, buyer_address, policy_version, question_digest,
        open_tx_hash, chain_id, contract_address, content_hash, amount_wei,
        passage_ids, outcome, claimed_at, lease_expires_at, lease_token, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', 'pending', ?, ?, ?, ?)`
  )
    .bind(
      row.request_id,
      row.collection_id,
      row.buyer_address.toLowerCase(),
      row.policy_version,
      row.question_digest,
      row.open_tx_hash ?? null,
      row.chain_id ?? null,
      row.contract_address?.toLowerCase() ?? null,
      row.content_hash ?? null,
      row.amount_wei ?? null,
      now,
      now + leaseMs,
      token,
      now
    )
    .run();
  return result.meta.changes === 1 ? token : null;
}

export async function reclaimExpiredQuery(
  row: Pick<QueryRow, "request_id" | "collection_id" | "buyer_address" | "policy_version" | "question_digest"> & {
    open_tx_hash: string;
    chain_id: number;
    contract_address: string;
    amount_wei: string;
    content_hash: string;
  },
  env: Env,
  leaseMs = 60_000,
): Promise<string | null> {
  const now = Date.now();
  const token = crypto.randomUUID();
  const result = await env.DB.prepare(
    `UPDATE queries SET outcome = 'pending', claimed_at = ?, lease_expires_at = ?, lease_token = ?
     WHERE request_id = ? AND outcome IN ('pending', 'running', 'failed') AND answer_text IS NULL
       AND lease_expires_at <= ? AND collection_id = ? AND buyer_address = ?
       AND policy_version = ? AND question_digest = ? AND open_tx_hash = ?
       AND chain_id = ? AND LOWER(contract_address) = ? AND amount_wei = ? AND content_hash = ?`
  ).bind(
    now, now + leaseMs, token, row.request_id, now, row.collection_id,
    row.buyer_address.toLowerCase(), row.policy_version, row.question_digest,
    row.open_tx_hash, row.chain_id, row.contract_address.toLowerCase(), row.amount_wei, row.content_hash,
  ).run();
  return result.meta.changes === 1 ? token : null;
}

// Kept for any callers that do a non-claiming insert (e.g. tests).
export async function insertQuery(
  row: Pick<
    QueryRow,
    "request_id" | "collection_id" | "buyer_address" | "policy_version"
  > & { question_digest: string },
  env: Env
): Promise<void> {
  await claimQuery(row, env);
}

export async function updateQueryRunning(
  requestId: string,
  token: string,
  env: Env
): Promise<boolean> {
  const result = await env.DB.prepare(
    "UPDATE queries SET outcome = 'running' WHERE request_id = ? AND lease_token = ? AND outcome = 'pending'"
  )
    .bind(requestId, token)
    .run();
  return result.meta.changes === 1;
}

export async function updateQueryAnswerRecorded(
  requestId: string,
  answerText: string,
  passageIds: string[],
  responseDigest: string,
  token: string,
  env: Env
): Promise<boolean> {
  const result = await env.DB.prepare(
    `UPDATE queries SET outcome = 'answer_recorded', answer_text = ?, passage_ids = ?, response_digest = ?
     WHERE request_id = ? AND lease_token = ? AND outcome = 'running'`
  )
    .bind(answerText, JSON.stringify(passageIds), responseDigest, requestId, token)
    .run();
  return result.meta.changes === 1;
}

export async function claimSettlementDispatch(
  requestId: string,
  token: string,
  env: Env,
  leaseMs = 120_000,
): Promise<boolean> {
  const result = await env.DB.prepare(
    `UPDATE queries SET outcome = 'settling', lease_expires_at = ?
     WHERE request_id = ? AND lease_token = ? AND outcome = 'answer_recorded'
       AND answer_text IS NOT NULL AND settle_tx_hash IS NULL`
  ).bind(Date.now() + leaseMs, requestId, token).run();
  return result.meta.changes === 1;
}

export async function reclaimSettlementDispatch(
  requestId: string,
  env: Env,
  leaseMs = 120_000,
): Promise<string | null> {
  const now = Date.now();
  const token = crypto.randomUUID();
  const result = await env.DB.prepare(
    `UPDATE queries SET outcome = 'settling', lease_token = ?, lease_expires_at = ?
     WHERE request_id = ? AND outcome IN ('answer_recorded', 'settling', 'settlement_pending')
       AND answer_text IS NOT NULL AND settle_tx_hash IS NULL AND lease_expires_at <= ?`
  ).bind(token, now + leaseMs, requestId, now).run();
  return result.meta.changes === 1 ? token : null;
}

export async function updateQuerySettlementPending(
  requestId: string,
  settleTxHash: string,
  env: Env,
  token?: string,
): Promise<boolean> {
  const result = await env.DB.prepare(
    token
      ? `UPDATE queries SET outcome = 'settlement_pending', settle_tx_hash = ? WHERE request_id = ? AND lease_token = ? AND outcome = 'settling'`
      : `UPDATE queries SET outcome = 'settlement_pending', settle_tx_hash = ? WHERE request_id = ?`
  )
    .bind(...(token ? [settleTxHash, requestId, token] : [settleTxHash, requestId]))
    .run();
  return result.meta.changes === 1;
}

export async function updateQuerySettled(
  requestId: string,
  settleTxHash: string | null,
  passageIds: string[],
  responseDigest: string,
  env: Env
): Promise<void> {
  await env.DB.prepare(
    `UPDATE queries SET outcome = 'settled', settle_tx_hash = ?, passage_ids = ?, response_digest = ?, settled_at = ?
     WHERE request_id = ?`
  )
    .bind(
      settleTxHash,
      JSON.stringify(passageIds),
      responseDigest,
      Date.now(),
      requestId
    )
    .run();
}

export async function updateQueryOutcome(
  requestId: string,
  outcome: string,
  env: Env,
  token?: string,
): Promise<void> {
  const sql = token
    ? "UPDATE queries SET outcome = ? WHERE request_id = ? AND lease_token = ?"
    : "UPDATE queries SET outcome = ? WHERE request_id = ?";
  await env.DB.prepare(sql).bind(...(token ? [outcome, requestId, token] : [outcome, requestId])).run();
}

export async function getQueryRow(
  requestId: string,
  env: Env
): Promise<QueryRow | null> {
  return env.DB.prepare("SELECT * FROM queries WHERE request_id = ?")
    .bind(requestId)
    .first<QueryRow>();
}

export async function requestIdExists(
  requestId: string,
  env: Env
): Promise<boolean> {
  const row = await env.DB.prepare("SELECT 1 FROM queries WHERE request_id = ?")
    .bind(requestId)
    .first<{ "1": number }>();
  return row !== null;
}
