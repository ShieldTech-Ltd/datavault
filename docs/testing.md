# Testing

## Test scope

| Layer | Type | Command | Live charges |
|---|---|---|---|
| Smart contracts | Hardhat unit tests | `npm run test:contracts` | None |
| Worker lib | Vitest unit tests | `cd worker && npm test` | None |
| Worker routes | Vitest mock route tests | `cd worker && npm test` | None |
| Frontend | TypeScript typecheck + Vite build | `cd frontend && npm run typecheck && npm run build` | None |
| Live integration | Manual / browser | Not in PR CI | Monad testnet gas, model API |

Live chain and model calls are never made in PR CI. All tests run against in-memory mocks.

## Running tests locally

```bash
# Smart contract tests (Hardhat, 20 tests)
npm run test:contracts

# Worker unit + route tests (Vitest)
cd worker
npm test

# Frontend typecheck and build
cd frontend
npm run typecheck
npm run build
```

## CI checks (required on every PR)

All three jobs must pass before merge to `master`:

- **Contract tests**: compiles and runs all 20 Hardhat tests
- **Frontend typecheck and build**: `tsc --noEmit` then `vite build`
- **Worker typecheck and tests**: `tsc --noEmit` then `vitest run`

## What the Worker tests cover

**`validation.test.ts`** (pure unit, no mocks):
- Address, bytes32, signature format validators
- Price wei range checks (zero, max 10 MON, over limit)
- Question length and whitespace validation
- Timestamp freshness window (5-minute expiry)
- Content-length header enforcement

**`d1-statemachine.test.ts`** (in-memory D1 mock):
- `claimQuery`: inserts on first call, returns false on duplicate (atomic idempotency)
- State machine: pending -> running -> answer_recorded -> settlement_pending -> settled
- Each state stores the expected fields (answer text, passage IDs, tx hashes, settled_at)
- `requestIdExists` before and after insert
- Collection staging and confirmation flow

**`ratelimit.test.ts`** (in-memory D1 mock):
- First request is always allowed
- Blocks after exceeding per-bucket limits (execute=10, register=5)
- Independent limits per IP address
- `callerIdentity` reads CF-Connecting-IP header with localhost fallback

**`routes-auth.test.ts`** (mock Env, no chain calls):
- Receipt endpoint: 404 for unknown IDs, 400 for bad format, 200 with correct schema
- Receipt does not expose answer text (answer is only available via authenticated `/answer` endpoint)
- Confirm collection: 400 for bad collectionId, 400 for bad txHash, 403 for wrong owner, 404 for unknown collection

## Live gates (not in PR CI)

These require real credentials and are not run in CI:

- Monad testnet transaction broadcast and confirmation
- Injected EVM wallet connection, account change, and wrong-chain rejection
- AI model API call with real passages
- Cloudflare R2/D1 remote bindings
- Settlement and refund on-chain flows

Record live evidence separately when testing against testnet. Never commit secrets or private content.
