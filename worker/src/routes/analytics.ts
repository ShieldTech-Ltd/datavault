import type { Env } from "../lib/types";
import { authenticatedOwner } from "../lib/owner-auth";

interface RecordedPayment {
  request_id: string;
  collection_id: string;
  collection_name: string;
  buyer_address: string;
  amount_wei: string | null;
  created_at: number;
  settled_at: number | null;
  settle_tx_hash: string | null;
}

const MAX_ROWS = 10_000;

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function summarise(rows: RecordedPayment[]) {
  const collections = new Map<
    string,
    {
      collectionId: string;
      name: string;
      paidQueries: number;
      recordedRevenueWei: bigint;
    }
  >();
  let knownAmounts = 0;
  let recordedRevenueWei = 0n;
  for (const row of rows) {
    const item = collections.get(row.collection_id) ?? {
      collectionId: row.collection_id,
      name: row.collection_name,
      paidQueries: 0,
      recordedRevenueWei: 0n,
    };
    item.paidQueries++;
    if (row.amount_wei !== null && /^\d+$/.test(row.amount_wei)) {
      const amount = BigInt(row.amount_wei);
      item.recordedRevenueWei += amount;
      recordedRevenueWei += amount;
      knownAmounts++;
    }
    collections.set(row.collection_id, item);
  }
  const topCollections = [...collections.values()]
    .sort((a, b) =>
      a.recordedRevenueWei === b.recordedRevenueWei
        ? b.paidQueries - a.paidQueries
        : a.recordedRevenueWei > b.recordedRevenueWei
        ? -1
        : 1
    )
    .slice(0, 5)
    .map((item) => ({
      ...item,
      recordedRevenueWei: item.recordedRevenueWei.toString(),
    }));
  const coverageComplete = knownAmounts === rows.length;
  return {
    paidQueries: rows.length,
    recordedRevenueWei:
      knownAmounts === 0 && rows.length > 0
        ? null
        : recordedRevenueWei.toString(),
    revenueCoverage: { knownAmounts, settledQueries: rows.length },
    topCollections: coverageComplete ? topCollections : [],
    rankingAvailable: coverageComplete,
    recentActivity: rows.slice(0, 10).map((row) => ({
      requestId: row.request_id,
      collectionId: row.collection_id,
      collectionName: row.collection_name,
      buyerAddress: row.buyer_address,
      amountWei: row.amount_wei,
      settledAt: row.settled_at,
      settleTxHash: row.settle_tx_hash,
      outcome: "settled" as const,
    })),
  };
}

async function payments(
  env: Env,
  since: number,
  owner?: string
): Promise<RecordedPayment[] | null> {
  const query = `SELECT q.request_id, q.collection_id, c.collection_name, q.buyer_address,
                        q.amount_wei, q.created_at, q.settled_at, q.settle_tx_hash
                   FROM queries q JOIN collections c ON c.collection_id = q.collection_id
                  WHERE q.outcome = 'settled' AND q.settled_at >= ?
                    AND c.status = 'confirmed' ${
                      owner ? "AND c.owner_address = ?" : ""
                    }
                  ORDER BY q.settled_at DESC, q.request_id DESC LIMIT ?`;
  const args = owner
    ? [since, owner.toLowerCase(), MAX_ROWS + 1]
    : [since, MAX_ROWS + 1];
  const result = await env.DB.prepare(query)
    .bind(...args)
    .all<RecordedPayment>();
  return result.results.length > MAX_ROWS ? null : result.results;
}

export async function handleMarketplaceAnalytics(env: Env): Promise<Response> {
  const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const rows = await payments(env, since);
  if (!rows)
    return json(
      {
        error: "Analytics window exceeds the current exact aggregation limit.",
      },
      503
    );
  const count = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM collections WHERE status = 'confirmed'"
  ).first<{ count: number }>();
  return json({
    periodDays: 30,
    confirmedCollections: count?.count ?? 0,
    ...summarise(rows),
  });
}

export async function handleOwnerAnalytics(
  req: Request,
  env: Env
): Promise<Response> {
  const owner = await authenticatedOwner(req, env);
  if (owner instanceof Response) return owner;

  const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const rows = await payments(env, since, owner);
  if (!rows)
    return json(
      {
        error: "Analytics window exceeds the current exact aggregation limit.",
      },
      503
    );
  const count = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM collections WHERE status = 'confirmed' AND owner_address = ?"
  )
    .bind(owner)
    .first<{ count: number }>();
  return json({
    periodDays: 30,
    ownerAddress: owner,
    confirmedCollections: count?.count ?? 0,
    ...summarise(rows),
  });
}
