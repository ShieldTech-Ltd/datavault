import type { Env } from "../lib/types";
import { authenticatedBuyer } from "../lib/wallet-auth";
import { error400 } from "../lib/validation";

interface HistoryRow {
  request_id: string;
  collection_id: string;
  collection_name: string | null;
  open_tx_hash: string;
  settle_tx_hash: string | null;
  amount_wei: string | null;
  outcome: string;
  created_at: number;
  settled_at: number | null;
}

export async function handleBuyerHistory(
  req: Request,
  env: Env
): Promise<Response> {
  const buyer = await authenticatedBuyer(req, env);
  if (buyer instanceof Response) return buyer;
  const params = new URL(req.url).searchParams;
  const limitText = params.get("limit") ?? "20";
  const offsetText = params.get("offset") ?? "0";
  if (!/^\d+$/.test(limitText) || !/^\d+$/.test(offsetText))
    return error400("Invalid pagination.");
  const limit = Number(limitText);
  const offset = Number(offsetText);
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 50 ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset > 1000
  ) {
    return error400("limit must be 1 to 50 and offset must be 0 to 1000");
  }
  const result = await env.DB.prepare(
    `SELECT q.request_id, q.collection_id, c.collection_name,
                    q.open_tx_hash, q.settle_tx_hash, q.amount_wei,
                    q.outcome, q.created_at, q.settled_at
       FROM queries q
       LEFT JOIN collections c ON c.collection_id = q.collection_id
         AND c.chain_id = ? AND c.contract_address = ?
      WHERE LOWER(q.buyer_address) = ? AND q.chain_id = ?
        AND LOWER(q.contract_address) = ? AND q.open_tx_hash IS NOT NULL
      ORDER BY q.created_at DESC, q.request_id DESC
      LIMIT ? OFFSET ?`
  )
    .bind(
      Number(env.CHAIN_ID),
      env.CONTRACT_ADDRESS.toLowerCase(),
      buyer,
      Number(env.CHAIN_ID),
      env.CONTRACT_ADDRESS.toLowerCase(),
      limit,
      offset
    )
    .all<HistoryRow>();
  return new Response(
    JSON.stringify({
      buyerAddress: buyer,
      requests: result.results.map((row) => ({
        requestId: row.request_id,
        collectionId: row.collection_id,
        collectionName: row.collection_name,
        openTxHash: row.open_tx_hash,
        settleTxHash: row.settle_tx_hash,
        amountWei: row.amount_wei,
        outcome: row.outcome,
        openedAt: row.created_at,
        settledAt: row.settled_at,
      })),
      limit,
      offset,
      hasMore: result.results.length === limit,
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
