# Payment State Machine

## Escrow lifecycle

Each query goes through one of two terminal states:

```
openQuery (buyer pays)
        |
        v
    [ Open ]
       / \
      /   \
     v     v
[Settled] [Refunded]
```

| Transition | Caller | Condition | Effect |
|---|---|---|---|
| Open -> Settled | operator (Worker hot key) | query is Open | Payment sent to collection owner |
| Open -> Refunded | buyer | query is Open AND `block.timestamp >= openedAt + 10 min` | Payment returned to buyer |

## Operator model

The collection owner registers with their Dynamic embedded wallet. At registration time they also supply an `operator` address: the Cloudflare Worker's settlement wallet derived from `SETTLEMENT_PRIVATE_KEY`.

This separation means:

- The Worker can settle escrows without knowing the owner's private key.
- Payment always flows to `col.owner`, never to `col.operator`. A compromised Worker key cannot redirect funds.
- The owner can rotate the operator at any time via `updateOperator`. This is useful if the Worker secret is recycled.

## On-chain verification before model call

Before calling the AI model or retrieving passages, the Worker reads the escrow on-chain and checks:

1. The escrow exists (`q.buyer != address(0)`).
2. The escrow is still Open (`q.state == 0`).
3. The escrow references the requested collection (`q.collectionId == collectionId`).
4. The escrowed amount covers the current price (`q.amount >= col.price`).
5. The policy version matches the current on-chain version (`q.policyVersion == col.policyVersion`).

If any check fails the Worker returns an error without spending model tokens or retrieval resources.

## Policy version staleness

`policyVersion` increments on every `updatePolicy` call. If the owner changes the price between `openQuery` and `execute`, check 5 fails. The buyer can call `refundExpired` after the 10-minute timeout to recover their payment at the old price.

## Settlement key derivation

```
SETTLEMENT_PRIVATE_KEY (Cloudflare secret)
        |
        v
privateKeyToAccount(key).address
        |
        v
operatorAddress  (passed to registerCollection, stored on-chain)
```

The Worker never exposes the private key in responses. The operator address is returned from `POST /api/collections` so the frontend can embed it in the `registerCollection` calldata.
