# Receipt Format

## GET /api/queries/:id/receipt

Receipts are publicly readable. They contain enough information to independently verify the answer, the document version used, and the on-chain settlement.

```json
{
  "requestId":       "0x...",
  "collectionId":    "0x...",
  "buyerAddress":    "0x...",
  "chainId":         10143,
  "contractAddress": "0x...",
  "contentHash":     "0x...",
  "policyVersion":   1,
  "openTxHash":      "0x...",
  "settleTxHash":    "0x...",
  "refundTxHash":    null,
  "citedPassageIds": ["0xabc...:chunk-0", "0xabc...:chunk-2"],
  "responseDigest":  "sha256:...",
  "outcome":         "settled",
  "createdAt":       1700000000000,
  "settledAt":       1700000005000
}
```

## Field descriptions

| Field | Description |
|---|---|
| `requestId` | bytes32 hex. Same as the on-chain escrow key. |
| `collectionId` | bytes32 hex. The collection queried. |
| `buyerAddress` | The wallet that called `openQuery`. Derived from chain, not request body. |
| `chainId` | The chain ID at query time (10143 for Monad testnet). |
| `contractAddress` | The DataVault contract address used. |
| `contentHash` | keccak256 of the collection document at retrieval time. Pins the receipt to a specific version. |
| `policyVersion` | The on-chain policy version when the escrow was opened. |
| `openTxHash` | The buyer's `openQuery` transaction hash (optional, provided by frontend). |
| `settleTxHash` | The Worker's `settleQuery` transaction hash. Null if not yet settled. |
| `refundTxHash` | The buyer's `refundExpired` transaction hash. Null if not refunded. |
| `citedPassageIds` | Versioned passage IDs (`{contentHash}:chunk-N`) that the model cited. Not all retrieved passages. |
| `responseDigest` | `sha256:` + lowercase hex SHA-256 of the exact answer text returned to the buyer. |
| `outcome` | One of: `pending`, `running`, `answer_recorded`, `settlement_pending`, `settled`, `failed`, `refundable` |
| `createdAt` | Unix milliseconds when the Worker claimed the request. |
| `settledAt` | Unix milliseconds when D1 was updated to `settled`. Null otherwise. |

## Verification

To verify a receipt independently:

1. Fetch the answer from `GET /api/queries/:id/answer` (requires buyer signature).
2. Compute `sha256(answerText)` and compare to `responseDigest`.
3. Check `settleTxHash` on the Monad testnet explorer. The `QuerySettled` event should match `requestId` and `collectionId`.
4. The `citedPassageIds` contain the `contentHash` of the version used. You can verify the collection at that hash if you have the original document.

## Settlement states and safe visibility

| Outcome | Answer available | Receipt public |
|---|---|---|
| `pending` / `running` | No | Yes (shows outcome) |
| `answer_recorded` | Yes (buyer auth) | Yes |
| `settlement_pending` | Yes (buyer auth) | Yes |
| `settled` | Yes (buyer auth) | Yes |
| `failed` | No | Yes |
| `refundable` | No | Yes |

## Reconciliation

If `outcome` is `settlement_pending`, the Worker broadcast the settlement tx but did not receive an on-chain confirmation within the 20-second window. The buyer should:

1. Wait 1-2 minutes for the tx to be mined.
2. Call `POST /api/queries/:id/reconcile` with buyer ECDSA auth (see `docs/request-recovery.md`).
3. If the on-chain escrow shows `state = Settled`, D1 is updated and the receipt reflects `settled`.
4. If the tx was dropped, the buyer may call `refundExpired` on-chain once the 10-minute timeout elapses.

## Additive migrations

All schema changes are additive. Receipts for requests created before migration `0006_receipt_fields.sql` will have `null` for `openTxHash`, `chainId`, `contractAddress`, and `contentHash`. The `settleTxHash` field replaces the previous `tx_hash` field.
