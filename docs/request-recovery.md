# Request Recovery

## Execution state machine

```
[pending] -> [running] -> [answer_recorded] -> [settled]
                      \-> [failed]
[pending] -> [refundable]  (set when on-chain timeout observed)
```

| State | Meaning | Buyer action |
|---|---|---|
| `pending` | Claimed by a Worker, escrow verified, execution not yet started | Wait or retry after lease expires |
| `running` | Passages retrieved, model call in progress | Wait or retry after lease expires |
| `answer_recorded` | Answer persisted in D1, settlement tx pending | Call `GET /api/queries/:id/answer` to recover answer |
| `settled` | Settlement tx broadcast, payment released to owner | Receipt available, answer recoverable |
| `failed` | Model error, policy change, or no passages found | Call `refundExpired` on-chain after timeout |
| `refundable` | Timeout elapsed, escrow still open | Call `refundExpired` on-chain |

## Atomic claim

Before any R2 read or model call, the Worker executes:

```sql
INSERT OR IGNORE INTO queries (...) VALUES (...)
```

SQLite's `INSERT OR IGNORE` is a single atomic operation. The Worker checks `meta.changes === 1` to confirm it got the exclusive claim. If `meta.changes === 0`, another instance already holds the claim and the Worker inspects the existing row state before responding.

## Lease

Each claim includes a `lease_expires_at` timestamp (60 seconds from `claimed_at`). If a Worker instance crashes while holding the claim, the lease expires and the record can be identified as stale. The current implementation returns a 409 on a stale claim and documents refundExpired as the recovery path for the buyer.

## Answer persistence before settlement

The answer is written to D1 (`outcome = answer_recorded`) before `settleOnChain` is called. This creates a durable record of the answer before any funds move. If the Worker crashes after settlement but before delivering the HTTP response, the buyer can recover the answer without paying again.

## Answer recovery endpoint

`GET /api/queries/:id/answer`

**Headers required:**

| Header | Format | Notes |
|---|---|---|
| `x-signature` | `0x` + 130 hex chars | Signs message below |
| `x-timestamp` | Unix milliseconds | Within 5 minutes |

**Signed message:** `datavault-answer:<requestId>:<timestamp>`

The signature must recover to the `buyer_address` stored in D1 (which was derived from the on-chain escrow, not the request body). This proves the caller is the wallet that paid without requiring a separate session system.

**Returns 200** when `outcome` is `answer_recorded` or `settled`:
```json
{
  "answer": "...",
  "passageIds": ["chunk-0", "chunk-2"],
  "responseDigest": "sha256:...",
  "outcome": "settled",
  "requestId": "0x...",
  "recovered": true
}
```

**Returns 404** when the answer is not yet available (still `pending` or `running`) or the request failed.

## Data retention

Answer text is stored in D1 indefinitely. D1 does not have built-in TTL. A periodic cleanup job (out of scope for the hackathon) should remove records older than 90 days. The receipt remains publicly accessible after cleanup; only `answer_text` is considered private.

## Ambiguity: crash during model call

If the Worker crashes between the model API call starting and the response arriving, the model provider may have already computed and billed for the answer. The Worker has no way to know. On the next attempt (after the lease expires), the Worker will call the model again. This is at-least-once model API invocation. There is no exactly-once guarantee without provider-level idempotency keys, which the current model API does not expose.

## Migrations (additive)

All migrations are additive. Existing rows receive `NULL` for new columns, which is handled by null checks in the code. No existing records are modified by `0005_atomic_execution.sql`.
