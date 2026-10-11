# Testing

## Test scope

| Layer | Type | Command | Live charges |
|---|---|---|---|
| Smart contracts | Hardhat unit tests | `npm run test:contracts` | None |
| Worker lib | Vitest unit tests | `cd worker && npm test` | None |
| Worker routes | Vitest mock route tests | `cd worker && npm test` | None |
| Frontend | TypeScript, route tests, and Vite build | `cd frontend && npm run typecheck && npm test && npm run build` | None |
| Live integration | Manual / browser | Not in PR CI | Monad testnet gas, model API |

Live chain and model calls are never made in PR CI. The PR test suite uses in-memory mocks; the separate local rehearsal below exercises running services.

## Local paid-flow rehearsal

`npm run rehearse:local` is a repeatable integration check using an isolated Hardhat chain (chain ID 31337), a local Wrangler Worker with D1 and R2, and a local HTTPS model stub. It makes test-only transactions and does not use Monad testnet or a real model provider. The script refuses any other chain ID, RPC URL, or model endpoint.

Prepare the services in separate terminals:

1. Run `npm run compile` and `npm run node -- --hostname 127.0.0.1`.
2. Run `npm run setup:local-rehearsal`. It deploys a local contract, funds a fresh throwaway operator, creates an ignored Worker env file, and prints the paths of a one-day certificate and key outside the repository. It refuses to overwrite an existing Worker env file. Add `-- --browser` to also create `frontend/.env.local` for browser testing.
3. Use the printed paths to run `LOCAL_MODEL_CERT=<cert path> LOCAL_MODEL_KEY=<key path> npm run model:stub`.
4. Run `npm run db:migrate:local --prefix worker`, then `NODE_EXTRA_CA_CERTS=<cert path> npm run dev --prefix worker -- --ip 127.0.0.1 --port 8790`.
5. Run `npm run rehearse:local`. A passing result checks registration, signed owner catalogue, quote, escrow, wrong-buyer denial, cited answer, the on-chain answer digest, settlement and owner payout, public receipt, settlement-hash discovery after a simulated Worker failure, takeover of an expired claim without another payment, settlement of a stored answer after a simulated Worker failure, buyer-only recovery, signed buyer history, analytics, pause enforcement, and the on-chain timeout refund.

Remove the temporary `.dev.vars`, optional `.env.local`, and certificate directory after the rehearsal. This local integration result is a prerequisite, not a substitute for the live Monad testnet and public-site gates below.

## Running tests locally

```bash
# Smart contract tests (Hardhat)
npm run test:contracts

# Worker unit + route tests (Vitest)
cd worker
npm test

# Frontend typecheck, route tests, and build
cd frontend
npm run typecheck
npm test
npm run build
```

## CI checks (required on every PR)

All required CI and Security jobs must pass before merge to `master`:

- **Contract tests**: compiles and runs the Hardhat tests
- **Frontend typecheck and build**: `tsc --noEmit`, production route tests, then `vite build`
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
