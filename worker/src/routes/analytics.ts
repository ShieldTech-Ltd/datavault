import type { Env } from "../lib/types";
import { authenticatedOwner } from "../lib/wallet-auth";
import { isValidAddress } from "../lib/validation";
import { rpcMatchesConfiguredChain } from "../lib/chain-identity";

interface RecordedPayment {
  outcome?: string;
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
const DAY = 86_400_000;
export interface AnalyticsWindow { start: number; end: number; periodDays: number }
export function analyticsWindow(url: URL, now = Date.now()): AnalyticsWindow | null {
  const params = url.searchParams, start = params.get('start'), end = params.get('end');
  const maximum = Math.floor(now / DAY) * DAY + DAY;
  if (start === null && end === null) return { start: maximum - 30 * DAY, end: maximum, periodDays: 30 };
  if (!start || !end || params.getAll('start').length !== 1 || params.getAll('end').length !== 1) return null;
  const parse = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(Date.parse(v)).toISOString().slice(0,10) === v ? Date.parse(v) : NaN;
  const a = parse(start), b = parse(end), days = (b-a)/DAY;
  return Number.isFinite(days) && days > 0 && days <= 90 && b <= maximum ? {start:a,end:b,periodDays:days} : null;
}
export function dailyBuckets(rows: RecordedPayment[], window: AnalyticsWindow) {
  const buckets = Array.from({length:window.periodDays},(_,i)=>({date:new Date(window.start+i*DAY).toISOString().slice(0,10), settledQueries:0, failedQueries:0, refundedQueries:0, knownAmounts:0, recordedRevenueWei:'0'}));
  for (const row of rows) {
    const settled = !row.outcome || row.outcome === 'settled';
    const time = settled ? row.settled_at : row.created_at;
    if (time === null || time === undefined) continue;
    const bucket = buckets[Math.floor((time-window.start)/DAY)];
    if (!bucket) continue;
    if (settled) { bucket.settledQueries++; if(row.amount_wei !== null && /^\d+$/.test(row.amount_wei)){bucket.knownAmounts++;bucket.recordedRevenueWei=(BigInt(bucket.recordedRevenueWei)+BigInt(row.amount_wei)).toString();} }
    else if(row.outcome === 'refunded') bucket.refundedQueries++;
    else if(row.outcome === 'failed') bucket.failedQueries++;
  }
  return buckets;
}
export function csvCell(value: string): string {
  const safe = /^[\s\x00-\x1f\x7f]*[=+@-]/.test(value) ? "'"+value : value;
  return '"'+safe.replace(/"/g,'""')+'"';
}
function csv(rows: RecordedPayment[]): Response {
  const lines = [['Request ID','Collection ID','Collection name','Settled at UTC','Amount wei','Settlement transaction'], ...rows.filter(row=>!row.outcome || row.outcome==='settled').map(row=>[row.request_id,row.collection_id,row.collection_name,row.settled_at===null?'':new Date(row.settled_at).toISOString(),row.amount_wei !== null && /^\d+$/.test(row.amount_wei)?row.amount_wei:'',row.settle_tx_hash??''])];
  return new Response(lines.map(line=>line.map(csvCell).join(',')).join('\r\n')+'\r\n',{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="datavault-owner-analytics.csv"','Cache-Control':'no-store'}});
}

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
  window: AnalyticsWindow,
  owner?: string
): Promise<RecordedPayment[] | null> {
  const query = `SELECT q.outcome, q.request_id, q.collection_id, c.collection_name, q.buyer_address,
                        q.amount_wei, q.created_at, q.settled_at, q.settle_tx_hash
                   FROM queries q JOIN collections c ON c.collection_id = q.collection_id
                  WHERE ((q.outcome = 'settled' AND q.settled_at >= ? AND q.settled_at < ?) OR (q.outcome IN ('failed','refunded') AND q.created_at >= ? AND q.created_at < ?))
                    AND q.chain_id = ? AND LOWER(q.contract_address) = ?
                    AND c.chain_id = ? AND c.contract_address = ?
                    AND c.status = 'confirmed' ${
                      owner ? "AND c.owner_address = ?" : "AND NOT EXISTS (SELECT 1 FROM collection_metadata m WHERE m.chain_id = c.chain_id AND m.contract_address = c.contract_address AND m.collection_id = c.collection_id AND m.visibility = 'unlisted')"
                    }
                  ORDER BY q.settled_at DESC, q.request_id DESC LIMIT ?`;
  const args = owner
    ? [
        window.start, window.end, window.start, window.end,
        Number(env.CHAIN_ID),
        env.CONTRACT_ADDRESS.toLowerCase(),
        Number(env.CHAIN_ID),
        env.CONTRACT_ADDRESS.toLowerCase(),
        owner.toLowerCase(),
        MAX_ROWS + 1,
      ]
    : [
        window.start, window.end, window.start, window.end,
        Number(env.CHAIN_ID),
        env.CONTRACT_ADDRESS.toLowerCase(),
        Number(env.CHAIN_ID),
        env.CONTRACT_ADDRESS.toLowerCase(),
        MAX_ROWS + 1,
      ];
  const result = await env.DB.prepare(query)
    .bind(...args)
    .all<RecordedPayment>();
  return result.results.length > MAX_ROWS ? null : result.results;
}

export async function handleMarketplaceAnalytics(env: Env, req = new Request('https://datavault.invalid/api/marketplace/analytics')): Promise<Response> {
  const window = analyticsWindow(new URL(req.url));
  if (!window) return json({error:'Use both start and end UTC dates, end exclusive, from 1 to 90 days and no later than tomorrow UTC.'},400);
  if (
    !isValidAddress(env.CONTRACT_ADDRESS) ||
    !(await rpcMatchesConfiguredChain(env))
  ) {
    return json({ error: "Current Monad deployment is unavailable." }, 503);
  }
  const rows = await payments(env, window);
  if (!rows)
    return json(
      {
        error: "Analytics window exceeds the 10,000-record exact aggregation limit. Select a smaller window.", aggregationLimit: MAX_ROWS, coverageComplete:false,
      },
      503
    );
  const count = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM collections c WHERE status = 'confirmed' AND chain_id = ? AND contract_address = ? AND NOT EXISTS (SELECT 1 FROM collection_metadata m WHERE m.chain_id = c.chain_id AND m.contract_address = c.contract_address AND m.collection_id = c.collection_id AND m.visibility = 'unlisted')"
  )
    .bind(Number(env.CHAIN_ID), env.CONTRACT_ADDRESS.toLowerCase())
    .first<{ count: number }>();
  return json({
    scope: "public",
    periodDays: window.periodDays,
    windowStart: new Date(window.start).toISOString(), windowEnd: new Date(window.end).toISOString(),
    aggregationLimit: MAX_ROWS, failureTimeField: 'created_at', daily: dailyBuckets(rows,window),
    failedQueries: rows.filter(row=>row.outcome==='failed').length, refundedQueries: rows.filter(row=>row.outcome==='refunded').length,
    confirmedCollections: count?.count ?? 0,
    ...summarise(rows.filter(row=>!row.outcome || row.outcome==='settled')),
  });
}

export async function handleOwnerAnalytics(
  req: Request,
  env: Env
): Promise<Response> {
  const window = analyticsWindow(new URL(req.url));
  if (!window) return json({error:'Use both start and end UTC dates, end exclusive, from 1 to 90 days and no later than tomorrow UTC.'},400);
  const owner = await authenticatedOwner(req, env);
  if (owner instanceof Response) return owner;
  if (!(await rpcMatchesConfiguredChain(env))) {
    return json({ error: "Current Monad deployment is unavailable." }, 503);
  }

  const rows = await payments(env, window, owner);
  if (!rows)
    return json(
      {
        error: "Analytics window exceeds the 10,000-record exact aggregation limit. Select a smaller window.", aggregationLimit: MAX_ROWS, coverageComplete:false,
      },
      503
    );
  if (new URL(req.url).pathname === '/api/owner/analytics/export') return csv(rows);
  const count = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM collections WHERE status = 'confirmed' AND chain_id = ? AND contract_address = ? AND owner_address = ?"
  )
    .bind(Number(env.CHAIN_ID), env.CONTRACT_ADDRESS.toLowerCase(), owner)
    .first<{ count: number }>();
  return json({
    periodDays: window.periodDays,
    windowStart: new Date(window.start).toISOString(), windowEnd: new Date(window.end).toISOString(),
    aggregationLimit: MAX_ROWS, failureTimeField: 'created_at', daily: dailyBuckets(rows,window),
    failedQueries: rows.filter(row=>row.outcome==='failed').length, refundedQueries: rows.filter(row=>row.outcome==='refunded').length,
    ownerAddress: owner,
    confirmedCollections: count?.count ?? 0,
    ...summarise(rows.filter(row=>!row.outcome || row.outcome==='settled')),
  });
}
