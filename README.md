# DataVault Query License

Paid, controlled AI access to private knowledge collections.

An owner uploads a private Markdown document, sets a per-query price, and registers policy on Monad testnet. A buyer signs a Monad transaction placing payment in escrow. The Cloudflare Worker verifies payment and current policy, retrieves relevant passages from private R2 storage, calls a real AI model, returns a cited answer, and settles escrow to the owner. The owner can pause access at any time.

**Hackathon:** Monad Metropolis  
**Track:** Trust, Identity and AI Infrastructure  
**Deadline:** 14 October 2026 at 04:59 GMT+1

## Frontend dashboard preview

The routed dashboard uses sample collections, earnings, transactions, API keys, and settings. Its actions simulate the interface and do not create uploads, payments, payouts, or credentials. Preview query history stays in memory and does not read or modify wallet recovery records.

Use `/query` for the existing Monad testnet paid-query, answer recovery, reconciliation, and refund flow. Use `/manage` for signed collection registration, confirmation, and policy updates. These flows require the configured Worker, contract, and an EVM wallet. `/preview/query` shows the simulated query interface. The current wallet implementation uses an injected EVM provider.

---

## What this is not

- It does not detect AI use of content outside this service.
- Content hashes are integrity references only. They do not prove copyright ownership.
- Revoking access blocks future queries through this service. It cannot erase answers already delivered.
- Selected passages are sent to the model provider to generate answers. Owners are told this before uploading.
- The source has security and release gates, but public service readiness depends on live checks and deployment configuration.

---

## Repository structure

```
contracts/          Solidity contract and Hardhat tests
  DataVault.sol     registerCollection, updatePolicy, openQuery, settleQuery, refundExpired
  test/             20 unit tests (all passing)
frontend/           React + Vite + TypeScript UI
  src/
    lib/            Injected wallet context, Monad network, viem contract client
    components/     Wallet, owner, buyer, and marketplace views
worker/             Cloudflare Worker API
  src/
    lib/            policy.ts, model.ts, r2.ts, d1.ts, types.ts
    routes/         collections, queries, catalogue, and analytics
    test/           Worker unit and route tests
  migrations/       D1 SQL schema
scripts/            Hardhat deploy script
demo/               Team-authored UK Practical Guide (sample knowledge collection)
docs/               Architecture, API contract, testing guide, failure matrix, receipt format
shared/             Shared ABI constant
```

---

## Prerequisites

- Node.js 18+ (v25 works with a Hardhat warning)
- npm 9+
- Cloudflare account with Workers, R2, and D1 enabled
- Injected EVM wallet or wallet browser with Monad testnet and test MON
- AI model API key (OpenAI or Kimi)

---

## Setup

### 1. Install dependencies

```sh
npm run install:all
```

This installs root (Hardhat), frontend, and worker dependencies.

### 2. Configure the frontend

```sh
cp frontend/.env.example frontend/.env
```

Fill in:
- `VITE_CONTRACT_ADDRESS` after deploying the contract (Step 4)

### 3. Configure the Worker

```sh
cp worker/.dev.vars.example worker/.dev.vars
```

Fill in:
- `CONTRACT_ADDRESS` after deployment
- `SETTLEMENT_PRIVATE_KEY` (funded Monad testnet key)
- `MODEL_API_KEY`

Create D1 database:

```sh
cd worker
npx wrangler d1 create datavault-db
```

For a public deployment, copy `worker/wrangler.toml` to the ignored `worker/wrangler.deploy.toml` and place the returned `database_id` there. Local Wrangler development uses its simulated D1 binding without a remote ID.

Apply the schema locally:

```sh
npm run db:migrate:local
```

### 4. Compile and deploy the contract

```sh
cp .env.example .env
# Set DEPLOYER_PRIVATE_KEY in .env
npm run compile
npm run deploy:testnet
```

Copy the deployed address into `frontend/.env` and `worker/.dev.vars`.

### 5. Run local development

Terminal 1: Worker API on port 8787

```sh
cd worker && npm run dev
```

Terminal 2: Frontend on port 5173 (proxies /api to Worker)

```sh
cd frontend && npm run dev
```

Open http://localhost:5173.

For UI and UX review without a wallet, open `http://localhost:5173/demo.html` while Vite is running. This local preview has sample owner and buyer states only. It makes no API, model, wallet, or Monad calls and is excluded from the production build. Use the main app and live acceptance checklist to verify real payments and answers.

---

## Build and deploy to Cloudflare

Complete [the deployment runbook](docs/deployment.md), including the release configuration checks and real resource bindings, before this command.

```sh
# Build the frontend
npm run build:frontend

# Deploy the Worker (serves the built frontend as static assets)
cd worker && npx wrangler deploy --config wrangler.deploy.toml
```

---

## Type checking

```sh
npm run typecheck:frontend
npm run typecheck:worker
```

---

## Tests

```sh
# Smart contract tests (20 Hardhat tests)
npm run test:contracts

# Worker unit tests (no live chain or model calls)
cd worker && npm test
```

Contract tests cover: registerCollection, updatePolicy, openQuery, settleQuery, refundExpired, operator model, replay protection, timeout refund.

Worker tests cover: input validation, D1 state machine transitions, rate limiting, route auth and access control, catalogue filtering, and settlement analytics. See `docs/testing.md` for full scope and live gate documentation.

For a local paid-flow integration rehearsal using a Hardhat chain, Wrangler D1/R2, and an HTTPS model stub, follow [the local rehearsal steps](docs/testing.md#local-paid-flow-rehearsal) and run `npm run rehearse:local`. It does not replace Monad testnet acceptance testing.

---

## Environment variables reference

### Frontend (.env)

| Variable | Purpose |
|----------|---------|
| `VITE_CONTRACT_ADDRESS` | Deployed DataVault contract |
| `VITE_CHAIN_ID` | Monad testnet chain ID (default: 10143) |
| `VITE_CHAIN_RPC_URL` | Monad RPC (default: https://testnet-rpc.monad.xyz) |

### Worker (.dev.vars for local, `wrangler secret put` for production)

| Variable | Purpose |
|----------|---------|
| `CONTRACT_ADDRESS` | Deployed DataVault contract |
| `MONAD_RPC_URL` | Monad RPC endpoint |
| `SETTLEMENT_PRIVATE_KEY` | Key used by Worker to call settleQuery |
| `MODEL_API_KEY` | AI model provider key |
| `MODEL_PROVIDER` | `openai` or `kimi` |
| `MODEL_API_BASE` | API base URL (default: OpenAI) |
| `MODEL_NAME` | Model name (default: gpt-4o-mini) |

---

## Ownership

**Tanvir:** Solidity contracts, core Worker API, R2 and D1 payment state machine, and AI model integration.  
**Ritik:** React frontend, wallet and owner/buyer UX, marketplace and analytics routes, local integration rehearsal, and demo preparation.

---

## Current release and submission status

The source implements owner and buyer flows, plus a marketplace dashboard backed by verified collection metadata and recorded settlement data, and signed buyer request-history sync for answer recovery across devices. A public deployment and live paid-query evidence have not yet been recorded. Use [the deployment runbook](docs/deployment.md) for the current release gates, [the security controls](docs/security.md) for credential and CI requirements, and [the API contract](docs/api-contract.md) for the buyer authorization protocol. The sample collection appears in the guided buyer view only after an actual owner registration has been confirmed and `DEMO_COLLECTION_ID` is configured. Content replacement is disabled until it can advance on-chain policy version.

The repository is licensed under [MIT](LICENSE). External libraries include Hardhat and viem for contract development and chain access, React and Vite for the browser app, and Cloudflare Workers, R2, D1, and Wrangler for hosting and storage. Their package names and versions are recorded in the root, frontend, and worker package manifests and lockfiles. The team-authored sample guide is in `demo/`, links to official guidance, and still needs human review and user feedback before public use. Any separately sourced assets or code must be attributed here before submission.

AI coding tools were used to help write and revise parts of this project, including the demo readiness changes. Contributors remain responsible for reviewing, testing, and verifying the submitted code and claims. A hash records content integrity within this service. It does not establish copyright ownership, prevent external AI systems from using content, or erase answers already delivered.
