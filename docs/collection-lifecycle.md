# Collection lifecycle

## Registration

1. The owner signs `datavault-register:<chainId>:<contract>:<owner>:<contentHash>:<priceWei>:<timestamp>` with the wallet that will register the collection. The timestamp is Unix milliseconds within five minutes. The content hash is keccak256 of the exact uploaded file bytes.
2. `POST /api/collections` verifies that signature, stores the versioned document in private R2, inserts a D1 staging row, and returns the collection ID and `registerCollection` calldata.
3. The owner sends the registration transaction. `POST /api/collections/:id/confirm` verifies a successful matching transaction and the on-chain owner before setting D1 status to `confirmed`.
4. Only a confirmed D1 row with active on-chain policy can receive quotes and paid queries.

The collection ID is `keccak256(ownerAddress + ":" + contentHash)`. A signature proves control of the owner wallet. It does not prove copyright or permission to publish content. If registration is rejected or reverts, the staging row expires after 30 minutes. Orphaned R2 objects can be cleaned up later.

## Content replacement

The public `POST /api/collections/:id/upload` route returns 410 and the owner UI has no replacement action. The prior implementation could change R2's latest pointer without incrementing the on-chain policy version, letting an already-open escrow access different content. Replacement requires a separate versioned policy transaction and confirmation flow before it can be safely restored. Existing registered collections remain queryable.
