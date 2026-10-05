# Failure Matrix

Every scenario the system is expected to handle correctly, with the expected behavior and the component that enforces it.

Rows marked **[LIVE GATE]** require real testnet/model credentials to verify end-to-end.

## Collection lifecycle failures

| Scenario | Expected behavior | Enforcement |
|---|---|---|
| Owner uploads empty file | 400 "File is empty" | `handleRegisterCollection` body check |
| File exceeds 500 KB | 413 size limit error | `checkContentLength` + content check |
| Owner registers same content+address twice (within staging window) | 409 "Collection already registered" | D1 `status != 'orphaned'` check |
| Owner sends wrong ownerAddress in confirm | 403 owner mismatch | D1 `owner_address` comparison |
| Owner confirms before tx lands on-chain | 404 "Collection not found on-chain" | `getOnChainCollection` returning null |
| Third party tries to confirm someone else's collection | 403 on-chain owner mismatch | `onChain.owner != col.owner_address` |
| Staging window expires (30 min, no confirm) | Row marked `orphaned`; fresh registration allowed | `STAGING_EXPIRY_MS` check on re-register |
| Re-upload signed by different address | 403 invalid signature | `verifyUploadSignature` |
| Re-upload while collection is paused | 403 "Collection is not yet confirmed" (if staging) or allowed (confirmed but paused) | `status === 'confirmed'` check |
| Collection paused before quote | 503 "collection not active" from prepare | `handlePrepare` on-chain active check **[LIVE GATE]** |
| Collection paused after quote but before escrow | `openQuery` reverts on-chain ("collection paused") | Contract `require(col.active)` **[LIVE GATE]** |
| Collection paused after escrow | Query proceeds normally; payment settled to owner; pause does not affect existing escrows | Contract state machine; policyVersion mismatch causes Worker to recheck **[LIVE GATE]** |

## Escrow and payment failures

| Scenario | Expected behavior | Enforcement |
|---|---|---|
| Buyer pays wrong amount (underpay/overpay) | `openQuery` reverts ("incorrect payment") | Contract `require(msg.value == col.price)` **[LIVE GATE]** |
| Buyer uses wrong contract address | `openQuery` to wrong contract; Worker sees no escrow for requestId | `getOnChainQuery` returns null; execute fails **[LIVE GATE]** |
| Duplicate requestId (replay) | `openQuery` reverts ("requestId already used") | Contract mapping check **[LIVE GATE]** |
| Buyer submits execute without opening escrow | Worker reads on-chain state; escrow not found | `getOnChainQuery` check in execute **[LIVE GATE]** |
| Escrow already settled when execute called | Duplicate D1 claim returns false; 409 "already claimed" | `INSERT OR IGNORE` + `meta.changes === 0` |
| Two Workers race on same requestId | Second INSERT OR IGNORE fails; first Worker continues | Atomic D1 `INSERT OR IGNORE` |
| Escrow timeout reached before settlement | Buyer can call `refundExpired` on-chain | Contract `REFUND_TIMEOUT = 10 minutes` **[LIVE GATE]** |
| Worker tries to settle after buyer already refunded | `settleQuery` reverts ("already finalised") | Contract state check **[LIVE GATE]** |

## Auth and identity failures

| Scenario | Expected behavior | Enforcement |
|---|---|---|
| Second buyer tries to fetch first buyer's answer | 403 "invalid signature" or signature mismatch | ECDSA verify against `row.buyer_address` |
| Expired auth timestamp (over 5 min old) | 401 expired timestamp | `isValidTimestamp` 5-minute window |
| Signature for wrong requestId | 401 invalid signature | ECDSA message includes requestId |
| Malformed signature (not 65 bytes) | 401 malformed signature | `isValidSignature` regex |
| Rate limit exceeded | 429 with Retry-After | D1 sliding-window: execute=10/min, register=5/min |

## Model and answer failures

| Scenario | Expected behavior | Enforcement |
|---|---|---|
| Model returns no citations | Answer rejected; query marked `failed` | Citation count check in `callModel` |
| Model cites out-of-range passage index | Answer rejected; error thrown | Index validation in `callModel` |
| Model API times out (>25s) | Answer rejected; query marked `failed` | `AbortSignal.timeout(25000)` |
| Model API returns non-200 | Answer rejected; query marked `failed` | HTTP status check |
| Insufficient evidence (no relevant passages) | Answer returned with `isInsufficientEvidence=true`; still settled | Detection phrase check; buyer receives honest answer |
| R2 retrieval fails (collection missing) | 500; query not claimed | `retrievePassages` throws before claim |

## Settlement failures

| Scenario | Expected behavior | Enforcement |
|---|---|---|
| `settleQuery` tx broadcast but not confirmed within 20s | `settlement_pending` outcome; reconcile endpoint available | `waitForTransactionReceipt` 20s timeout |
| Worker crashes after answer recorded but before settle | Answer persisted in D1; buyer can recover via `/answer` endpoint with ECDSA auth | `updateQueryAnswerRecorded` before broadcast |
| Settlement tx reverts on-chain | Reconcile endpoint sees non-settled state; `settlement_pending` remains | `getOnChainQuery` state check in reconcile **[LIVE GATE]** |
| Operator key rotated mid-flight | Pending settleQuery uses stale key; reverts; owner can call `updateOperator` to restore | Contract `require(col.operator == msg.sender)` **[LIVE GATE]** |

## Security and privacy

| Scenario | Expected behavior | Enforcement |
|---|---|---|
| Direct R2 bucket access | Bucket is private; no public URL | Cloudflare R2 private binding |
| Prompt injection in uploaded document | Passages wrapped in XML tags; system prompt instructs model to ignore embedded instructions | XML delimiters in `callModel` prompt |
| Client-side secret exposure | `SETTLEMENT_PRIVATE_KEY` never sent to browser; `MODEL_API_KEY` server-only | Worker env vars; Vite env prefix rules |
| Wrong network (buyer on wrong chain) | Transaction fails at wallet; network check in frontend | `getChainId()` check before `sendTransaction` |
| Policy version mismatch (stale escrow) | Worker checks policyVersion before settlement; marks `failed` if stale | `currentPolicyVersion` check in execute |

## Release gates

These items must be demonstrated on the live testnet before the demo is considered complete:

- [ ] Owner registers, confirms, and queries are accepted by Worker (confirmed collection required)
- [ ] Buyer pays exact price, Worker settles, owner receives funds
- [ ] Pause blocks new queries; existing escrowed queries still settle
- [ ] Expired escrow refund succeeds after 10-minute window
- [ ] Answer recovery after page reload using ECDSA auth
- [ ] `settlement_pending` reconcile flow resolves to `settled`
- [ ] Wrong-owner confirm returns 403 (not 200)
- [ ] Second account cannot retrieve first buyer's answer

Items above marked **[LIVE GATE]** require testnet gas and/or model API credits. Local tests prove logic but not on-chain behavior.
