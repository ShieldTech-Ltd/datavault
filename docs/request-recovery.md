# Request recovery

The buyer stores the request ID and opening transaction hash locally when the wallet broadcasts `openQuery`. The Worker then verifies the confirmed transaction and atomically claims the request ID in D1. It records the generated answer before settlement so a lost HTTP response does not require another payment.

The Worker returns answer text only after on-chain settlement confirms. If a settlement transaction was broadcast but confirmation is pending, the API returns metadata with `outcome: settlement_pending`. The buyer signs `datavault-reconcile:<requestId>:<timestamp>` to check the chain. Once settled, the buyer signs `datavault-answer:<requestId>:<timestamp>` to recover the stored answer. Both calls use `x-signature` and `x-timestamp` headers and the on-chain buyer wallet.

Reconciliation also checks an answer recorded before a Worker crash, even if the settlement hash was not saved. A confirmed on-chain settlement can be reflected in D1 with a null settlement hash when that hash is unavailable. The chain state is authoritative for whether the buyer may recover the answer.

If the model, policy check, or settlement fails while escrow remains open, the buyer can call `refundExpired` on the contract after ten minutes. The refund works without Worker availability. A stale D1 execution claim is not automatically retried, to avoid a second model call or uncertain settlement. The buyer should use on-chain state to decide whether to recover or refund.

D1 retains answer text. The public receipt never includes it. No automated retention job exists in this hackathon prototype.
