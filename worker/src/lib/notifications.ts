import type { Env } from './types';
import { deployment, type AccountRow } from './account-session';
export async function reconcileNotifications(env: Env) {
 const {chainId,contract}=deployment(env),scope=`${chainId}:${contract}`;
 await env.DB.prepare('INSERT OR IGNORE INTO notification_cursors(scope) VALUES (?)').bind(scope).run();
 const cursor=await env.DB.prepare('SELECT * FROM notification_cursors WHERE scope=?').bind(scope).first<{collection_cursor:number;query_cursor:number}>();
 // Monotonic SQLite rowids bound historical recovery work. Triggers cover subsequent state changes.
 for (const [table,key] of [['collections','collection_cursor'],['queries','query_cursor']] as const) {
 const rows=await env.DB.prepare(`SELECT rowid AS rid,* FROM ${table} WHERE rowid>? AND chain_id=? AND lower(contract_address)=? ORDER BY rowid LIMIT 50`).bind(cursor![key],chainId,contract).all<any>();
 const statements:D1PreparedStatement[]=[];
 for(const row of rows.results) {
 if(table==='collections' && row.status==='confirmed' && row.confirmed_tx) statements.push(env.DB.prepare(`INSERT OR IGNORE INTO notification_events(chain_id,contract_address,event_type,source_id,recipient,collection_id,collection_name,created_at) VALUES (?,?,'collection_registered',?,?,?,?,?)`).bind(chainId,contract,row.confirmed_tx.toLowerCase(),row.owner_address.toLowerCase(),row.collection_id,row.collection_name,row.created_at));
 if(table==='queries' && (['failed','refundable'].includes(row.outcome) || row.outcome==='settled' && row.settle_tx_hash)) statements.push(env.DB.prepare(`INSERT OR IGNORE INTO notification_events(chain_id,contract_address,event_type,source_id,recipient,collection_id,collection_name,amount_wei,created_at) SELECT ?,?,?,?,lower(CASE WHEN ?='settled' THEN owner_address ELSE ? END),collection_id,collection_name,?,? FROM collections WHERE collection_id=?`).bind(chainId,contract,row.outcome==='settled'?'payout_settled':`query_${row.outcome}`,row.request_id,row.outcome,row.buyer_address,row.amount_wei,row.settled_at??row.created_at,row.collection_id));
 }
 if(rows.results.length) { statements.push(env.DB.prepare(`UPDATE notification_cursors SET ${key}=MAX(${key},?) WHERE scope=?`).bind(rows.results.at(-1).rid,scope)); await env.DB.batch(statements); }
 }
}
export async function consumeNotifications(env:Env,account:AccountRow) {
 const rows=await env.DB.prepare(`SELECT e.event_id FROM notification_events e LEFT JOIN notification_deliveries d ON d.event_id=e.event_id AND d.account_id=? WHERE e.chain_id=? AND e.contract_address=? AND e.recipient=? AND (d.event_id IS NULL OR (d.state='retry' AND d.next_retry_at<=?)) ORDER BY e.event_id LIMIT 50`).bind(account.account_id,account.chain_id,account.contract_address,account.address,Date.now()).all<{event_id:number}>();
 for(const row of rows.results) {
 try {
 await env.DB.batch([
 // Claim delivery state and insert inbox in one transaction. Previously processed states are immutable.
 env.DB.prepare(`INSERT OR IGNORE INTO notification_deliveries(account_id,event_id,state,attempts) SELECT account_id,?,CASE WHEN notify_in_app=1 THEN 'delivered' ELSE 'suppressed' END,1 FROM accounts WHERE account_id=?`).bind(row.event_id,account.account_id),
 env.DB.prepare(`UPDATE notification_deliveries SET state=CASE WHEN (SELECT notify_in_app FROM accounts WHERE account_id=?)=1 THEN 'delivered' ELSE 'suppressed' END,attempts=attempts+1,last_error=NULL,next_retry_at=0 WHERE account_id=? AND event_id=? AND state='retry'`).bind(account.account_id,account.account_id,row.event_id),
 env.DB.prepare(`INSERT OR IGNORE INTO notification_inbox(account_id,event_id) SELECT account_id,event_id FROM notification_deliveries WHERE account_id=? AND event_id=? AND state='delivered'`).bind(account.account_id,row.event_id)
 ]);
 } catch {
 await env.DB.prepare(`INSERT INTO notification_deliveries(account_id,event_id,state,attempts,next_retry_at,last_error) VALUES (?,?,'retry',1,?,'Inbox storage unavailable') ON CONFLICT(account_id,event_id) DO UPDATE SET attempts=attempts+1,next_retry_at=excluded.next_retry_at,last_error=excluded.last_error WHERE notification_deliveries.state='retry'`).bind(account.account_id,row.event_id,Date.now()+60000).run();
 }
 }
}
export const inboxSelect=`SELECT e.event_id AS id,e.event_type AS type,e.source_id AS sourceId,e.collection_id AS collectionId,e.collection_name AS collectionName,e.amount_wei AS amountWei,e.created_at AS createdAt,i.read_at AS readAt FROM notification_inbox i JOIN notification_events e ON e.event_id=i.event_id`;
