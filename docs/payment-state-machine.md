# Payment state machine

The buyer calls `openQuery(requestId, collectionId)` with the collection's exact current price in test MON. The contract records buyer, collection, amount, policy version, and opening time. The Worker verifies that escrow and a matching confirmed transaction before retrieval.

The escrow is `Open` until the registered operator calls `settleQuery`, which sends the payment to the collection owner, or the buyer calls `refundExpired` after ten minutes, which returns the payment. These are terminal states. The Worker holds the operator key, not the owner's private key. The owner can rotate the operator. A compromised operator could settle without delivering an answer, so the operator remains a trust boundary.

The Worker stores a generated answer before broadcasting settlement, rechecks policy and escrow state, then attempts settlement. It releases answer text only after settlement is confirmed. If confirmation is uncertain, it returns `settlement_pending` metadata and the buyer can reconcile with a signed request. If the escrow remains open after a failure, the buyer can refund it after the actual timeout without the Worker. The contract cannot verify that a buyer saw an answer.

The owner may pause or change price. A new `openQuery` is rejected when paused or underpaid. An existing escrow with an old policy version is rejected by the Worker before retrieval. The buyer can refund that still-open escrow after timeout.
