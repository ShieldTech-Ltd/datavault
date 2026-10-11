# Public receipt

`GET /api/queries/:id/receipt` returns JSON with request ID, collection ID, buyer address, chain ID, contract address, content hash, policy version, opening transaction hash, settlement transaction hash, refund transaction hash when known, cited passage IDs, SHA-256 answer digest, outcome, and timestamps.

A receipt is an operator-maintained audit record. Verify payment and settlement against the named Monad contract and transaction hashes. The digest can be compared with the answer available to the authenticated buyer. It does not prove the buyer saw the answer, that the answer is correct, or that an external AI provider respected the collection policy.

Possible in-progress outcomes are `pending`, `running`, `answer_recorded`, `settling`, and `settlement_pending`. Only `settled` permits answer recovery. Failed open escrows may be refunded on-chain after the contract timeout. Older rows may have null values for fields introduced in later D1 migrations.
