# Collection Lifecycle

## States

```
[staging] -> [confirmed] -> (active queries)
    |
    v
[orphaned]  (staging expired after 30 minutes without confirmation)
```

| State | Description | Queryable |
|---|---|---|
| `staging` | Content uploaded to R2, D1 row inserted, calldata returned to frontend. Owner has not yet submitted or confirmed the on-chain tx. | No |
| `confirmed` | On-chain registration verified by the Worker. Collection is live. | Yes |
| `orphaned` | Staging window (30 min) elapsed without a confirm call. The slot is released for a fresh registration attempt. | No |

## Registration flow

```
1. Owner uploads file + ownerAddress + priceWei to POST /api/collections
   - Worker derives collectionId = keccak256(ownerAddress:contentHash)
   - Content stored in R2 at versioned key (immutable by contentHash)
   - D1 row inserted with status = 'staging'
   - Returns collectionId + txCalldata

2. Owner's wallet sends the registerCollection tx on Monad testnet

3. Frontend calls POST /api/collections/:id/confirm with { txHash, ownerAddress }
   - Worker checks D1 owner matches submitted ownerAddress
   - Worker reads on-chain collection and verifies owner matches
   - D1 row updated to status = 'confirmed', confirmed_tx = txHash
   - Collection is now queryable
```

## ID derivation

```
collectionId = keccak256(ownerAddress + ":" + keccak256(content))
```

This binds the collection ID to both the owner wallet and the exact content. An attacker submitting a different `ownerAddress` in the form body will compute a different `collectionId` from the legitimate owner, so they cannot pre-occupy or shadow the real owner's slot.

## Content versioning

Content is stored at an immutable R2 key:

```
collections/{collectionId}/v/{contentHash}.md
```

A "latest" pointer is maintained at:

```
collections/{collectionId}/latest   (contains the current contentHash)
```

When the owner re-uploads with new content, the Worker writes a new versioned key and updates the latest pointer. Old versioned keys are preserved. Any query that opened escrow against the old `policyVersion` before the content changed will fail the policy version check in `handleExecute` and the buyer can call `refundExpired`.

## Re-upload authorization

Re-uploading content requires:
1. ECDSA signature over `datavault-upload:<collectionId>:<sha256(body)>:<timestamp>`
2. Timestamp within 5 minutes of server time
3. Signature must recover to the D1 `owner_address`
4. When `CONTRACT_ADDRESS` is set: on-chain `owner` must match D1 `owner_address`

## Rollback and cleanup

If the owner's wallet rejects or the tx reverts, no action is needed. The staging row expires after 30 minutes and is marked `orphaned`. The owner can re-register with a fresh upload.

If R2 storage succeeds but the D1 insert fails, the orphaned R2 object is harmless (it has no D1 row so it will never be served) and can be garbage-collected later.

## Hash algorithm

Content hash: `keccak256` (viem `keccak256(toBytes(content))`), stored as a `0x`-prefixed 32-byte hex string.
Upload signature hash: `SHA-256` (Web Crypto API), encoded as a lowercase hex string.
