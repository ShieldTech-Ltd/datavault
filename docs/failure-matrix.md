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
| Owner confirms before tx lands on-chain | Confirmation is rejected until the registration receipt is confirmed and matches the collection | `verifyRegistrationReceipt` |
| Third party tries to confirm someone else's collection | 403 on-chain owner mismatch (the confirmation endpoint does not authenticate the HTTP caller; the check compares the stored `owner_address` against the on-chain registration owner only — a caller who controls both values would not be blocked at the HTTP layer) | `onChain.owner != col.owner_address` |
| Staging window expires (30 min, no confirm) | Row marked `orphaned`; a new registration attempt can reuse the same collection ID and replace the stale staging metadata | `STAGING_EXPIRY_MS` check and D1 upsert on re-register |
| Re-upload signed by different address | 410; the legacy upload route is disabled before checking a signature | Worker router in `index.ts` |
| Re-upload while collection is paused | 410; the legacy upload route is disabled | Worker router in `index.ts` |
| Collection paused before quote | 403 from prepare | `handlePrepare` on-chain active check **[LIVE GATE]** |
| Collection paused after quote but before escrow | `openQuery` reverts on-chain ("collection paused") | Contract `require(col.active)` **[LIVE GATE]** |
| Collection paused after escrow | If paused before execution, the Worker returns 403 without claiming. If paused after the claim, it marks the request `failed` before settlement. The buyer can refund after the on-chain timeout. | Worker `active` checks in `handleExecute` before claim and before settle **[LIVE GATE]** |

## Escrow and payment failures

| Scenario | Expected behavior | Enforcement |
|---|---|---|
| Buyer pays wrong amount (underpay/overpay) | `openQuery` reverts ("incorrect payment") | Contract `require(msg.value == col.price)` **[LIVE GATE]** |
| Buyer uses wrong contract address | `openQuery` to wrong contract; Worker sees no escrow for requestId | `getOnChainQuery` returns null; execute fails **[LIVE GATE]** |
| Duplicate requestId (replay) | `openQuery` reverts ("requestId already used") | Contract mapping check **[LIVE GATE]** |
| Buyer submits execute without opening escrow | Worker reads on-chain state; escrow not found | `getOnChainQuery` check in execute **[LIVE GATE]** |
| Escrow already settled when execute called | 409 before any D1 claim or model call | On-chain escrow state check in `handleExecute` |
| Two Workers race on same requestId | Second INSERT OR IGNORE fails; first Worker continues | Atomic D1 `INSERT OR IGNORE` |
| Escrow timeout reached before settlement | Buyer can call `refundExpired` on-chain | Contract `REFUND_TIMEOUT = 10 minutes` **[LIVE GATE]** |
| Worker tries to settle after buyer already refunded | `settleQuery` reverts ("already finalised") | Contract state check **[LIVE GATE]** |

## Auth and identity failures

| Scenario | Expected behavior | Enforcement |
|---|---|---|
| Second buyer tries to fetch first buyer's answer | 403 signature mismatch | ECDSA verify against `row.buyer_address` |
| Expired auth timestamp (over 5 min old) | 401 expired timestamp | `isValidTimestamp` 5-minute window |
| Signature for wrong requestId | 401 invalid signature | ECDSA message includes requestId |
| Malformed signature (not 65 bytes) | 401 malformed signature | `isValidSignature` regex |
| Rate limit exceeded | 429 with Retry-After; the fixed-window quota is enforced by one atomic D1 upsert per request | D1 `rate_limits` upsert |

## Model and answer failures

| Scenario | Expected behavior | Enforcement |
|---|---|---|
| Model returns no citations | A substantive answer is rejected; an explicit insufficient-evidence answer may have no citations | Citation and insufficiency checks in `callModel` |
| Model cites out-of-range passage index | Answer rejected; error thrown | Index validation in `callModel` |
| Model API times out (>25s) | Answer rejected; query marked `failed`. Buyer may retry the same open escrow after the claim lease expires. | 25-second `AbortController` timer and fenced D1 reclaim |
| Model API returns non-200 | Answer rejected; query marked `failed`. Buyer may retry the same open escrow after the claim lease expires. | HTTP status check and fenced D1 reclaim |
| No relevant passages found by retrieval | 422; request marked `failed` without calling the model or settling | `retrievePassages` result check |
| Model determines supplied passages are insufficient | An insufficient-evidence answer can settle with no citations | Detection phrase check in `callModel` |
| R2 retrieval fails (collection missing) | 500; request is marked failed. Buyer can refund the still-open escrow after timeout. | `handleExecute` catch after claim |
| Stored source bytes differ from the confirmed content hash | No passages reach the model; query is marked failed, and an open escrow remains refundable after timeout | `retrievePassages` hash check before model use |

## Settlement failures

| Scenario | Expected behavior | Enforcement |
|---|---|---|
| `settleQuery` tx broadcast but not confirmed within 20s | Response body contains `outcome: "settlement_pending"` and `receiptUrl`; buyer calls signed reconcile, which checks escrow state and the matching digest event | `waitForTransactionReceipt` 20s timeout; `handleReconcile` |
| Worker crashes after answer recorded but before settle | After the dispatch lease expires, signed reconcile verifies the answer digest, opening receipt, current policy, and escrow, then claims one D1 settlement dispatch. It settles the stored answer without another model call or buyer payment. | `claimSettlementDispatch`, `reclaimSettlementDispatch`, `handleReconcile`; local paid-flow fault injection |
| Worker crashes after claim but before answer persistence | After the 60-second lease expires, the buyer can retry the same request and question without another payment. One D1 takeover succeeds; the old Worker's token cannot record an answer or settle. | `reclaimExpiredQuery` and fenced answer write; local paid-flow fault injection |
| Settlement tx confirms with a reverted receipt | Worker marks the query `failed`, withholds the answer, and directs the buyer to check escrow and refund after timeout if still open | Receipt status check in `settleOnChainWithConfirmation` **[LIVE GATE]** |
| Settlement broadcast or final D1 write is uncertain after answer recording | Worker preserves the answer row and returns `settlement_pending` without answer text; signed reconcile searches for a matching digest event if the transaction hash was lost, then restores the settled record | `handleExecute` uncertainty branch and `handleReconcile` **[LIVE GATE]** |
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
- [ ] Pause blocks new quotes and execution; an existing open escrow can be refunded after timeout
- [ ] Expired escrow refund succeeds after 10-minute window
- [ ] Answer recovery after page reload using ECDSA auth
- [ ] `settlement_pending` reconcile flow resolves to `settled`
- [ ] Wrong-owner confirm returns 403 (not 200)
- [ ] Second account cannot retrieve first buyer's answer

Items above marked **[LIVE GATE]** require testnet gas and/or model API credits. Local tests prove logic but not on-chain behavior.
