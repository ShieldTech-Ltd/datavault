# DataVault Build Status

*Last updated: 2026-10-03. Stage 1 feasibility gate.*

---

## Completed work

### Contracts (Hardhat + Solidity)

- `contracts/DataVault.sol` compiles against Solidity 0.8.24 targeting EVM paris.
- `hardhat.config.js` configures Monad testnet (chainId 10143, RPC https://testnet-rpc.monad.xyz) and localhost.
- 12 unit tests pass on local Hardhat network covering all five contract methods, replay protection, policy guard, and timeout refund.
- Deploy script at `scripts/deploy.js` ready for `npm run deploy:testnet`.

### Frontend (React + Vite + TypeScript)

- `frontend/` scaffold complete: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`.
- Dynamic SDK integrated in `main.tsx` via `DynamicContextProvider` with Monad testnet as the EVM network.
- `lib/dynamic.ts` builds the monadTestnet EVM network object from env vars.
- `lib/contract.ts` defines the full contract ABI as a typed const and creates a viem public client.
- `App.tsx`: header with connect button, owner and buyer tab navigation.
- `ConnectButton.tsx`: wraps DynamicWidget with wallet address display.
- `OwnerDashboard.tsx`: file upload, price input, registerCollection tx, pause/resume toggle.
- `BuyerDashboard.tsx`: collection ID input, question input, price quote fetch, openQuery signing, answer display with citations and receipt link.

### Worker (Cloudflare Workers + TypeScript)

- `worker/` scaffold complete: `package.json`, `tsconfig.json`, `wrangler.toml`.
- `wrangler.toml` binds R2 (`COLLECTION_STORE`), D1 (`DB`), and static assets (`ASSETS`).
- `src/index.ts`: routes all `/api/*` calls with CORS; passes everything else to static assets.
- `routes/collections.ts`: `POST /api/collections` (register, derive collectionId, store in R2 and D1, return tx calldata); `POST /api/collections/:id/upload` (owner-only re-upload).
- `routes/queries.ts`: `POST /api/queries/prepare` (read on-chain price); `POST /api/queries/execute` (verify, retrieve passages, call model, settle, record receipt); `GET /api/queries/:id/receipt` (return D1 row).
- `lib/policy.ts`: reads `getCollection` from Monad contract via viem; builds registerCollection and settleQuery calldata.
- `lib/model.ts`: calls OpenAI-compatible chat completion API with passages as context; extracts cited passages; computes SHA-256 response digest.
- `lib/r2.ts`: stores and retrieves collection documents; splits documents into chunks and ranks by keyword relevance.
- `lib/d1.ts`: full CRUD for `collections` and `queries` tables.
- `migrations/0001_init.sql`: D1 schema for collections and queries tables.

### Demo content

- `demo/uk-practical-guide.md`: team-authored UK practical guide for remote workers and freelancers. No sensitive personal data. Marked as sample content.

---

## Local verification

### Contract tests

```
npm run test:contracts
DataVault
  12 passing (2s)
```

All 12 tests pass. Contract compiles to EVM paris bytecode.

### Frontend install

```sh
cd frontend && npm install
```

Status: pending (dependencies not installed yet in this session; run this before `npm run dev`).

### Worker install

```sh
cd worker && npm install
```

Status: pending.

### Type checks

Run after installs:

```sh
npm run typecheck:frontend
npm run typecheck:worker
```

Status: pending. TypeScript config is correct; type errors may surface after install reveals missing types.

---

## Integration status

| Integration | Status | Blocker |
|-------------|--------|---------|
| Solidity contract compiles | Confirmed | None |
| Contract tests pass (local Hardhat) | Confirmed (12/12) | None |
| Frontend scaffold builds | Pending npm install | Run `cd frontend && npm install` |
| Worker TypeScript compiles | Pending npm install | Run `cd worker && npm install` |
| Dynamic sign-in renders | Unverified | `VITE_DYNAMIC_ENVIRONMENT_ID` not set |
| Embedded wallet created | Unverified | Requires Dynamic env ID |
| Wallet signs Monad tx | Unverified | Requires Dynamic env ID and test funds |
| Contract deployed to Monad testnet | Unverified | `DEPLOYER_PRIVATE_KEY` not set; test MON needed |
| R2 private storage (local) | Unverified | Run `cd worker && npm run dev` then test |
| D1 read/write (local) | Unverified | Run `npm run db:migrate:local` first |
| Real model request | Unverified | `MODEL_API_KEY` not set |
| End-to-end paid query | Blocked | Requires all above |

---

## Payment and access decision record

This section records the rules that govern escrow, policy, and settlement. These are engineering defaults derived from the approved plan. Genuine conflicts are flagged.

### Who can register a collection

Any wallet that sends a valid `registerCollection` transaction. The Worker derives the `collectionId` as `keccak256(ownerAddress + contentHash)` before calling the contract. The contract stores the caller as the owner. Sign-in via Dynamic proves wallet control only; it does not prove content ownership.

### How each request binds buyer, collection, price, and policy version

When the buyer calls `openQuery`, the contract records:

- `requestId`: unique bytes32, derived client-side as `keccak256(buyerAddress + timestamp)`.
- `collectionId`: the target collection.
- `amount`: `msg.value`, which must exactly equal the collection's registered price at that block.
- `policyVersion`: the policy version at time of `openQuery`.
- `openedAt`: block timestamp.

The Worker records this requestId in D1 immediately before beginning retrieval. This creates an idempotency anchor.

### Escrow states and permitted transitions

```
[*] Open     created by openQuery
Open -> Settled    Worker calls settleQuery after successful answer delivery
Open -> Refunded   Buyer calls refundExpired after 10-minute timeout
```

There is no Denied state on-chain. Denial happens off-chain (Worker returns an error before calling openQuery). The contract never holds funds for a denied request because openQuery is only called after the Worker returns a quote and the buyer explicitly signs.

One open question: the current flow has the buyer sign openQuery before the Worker begins retrieval. If the collection is paused between the quote and the buyer's signature, the contract will reject openQuery (because `active == false` at that point) and the buyer never pays. This is the correct behavior. No funds are locked for a paused collection.

### Who can settle a query and how the recipient is fixed

Only the collection owner can call `settleQuery`. The contract enforces `require(col.owner == msg.sender)`. The Worker holds the owner's private key as a secret (`SETTLEMENT_PRIVATE_KEY`). The recipient is the owner's address as stored in the contract at registration time, and cannot be changed by the Worker.

**Operator trust boundary:** The Worker holds the settlement key. A compromised Worker could call `settleQuery` without delivering an answer. The receipt stored in D1 (response digest, passage IDs, policy version) provides an audit trail but does not prevent a malicious Worker. This is an inherent limitation of the architecture. Owners are not told a settlement will happen only after delivery; the code enforces this, but the contract itself cannot verify it. This is acceptable for a hackathon prototype and must be disclosed.

### Refund timing and behavior

The buyer calls `refundExpired` directly on the contract after `REFUND_TIMEOUT` (600 seconds) has elapsed since `openedAt`. No Worker involvement is needed. The contract transfers the escrowed amount back to the buyer. The Worker never calls `refundExpired`.

If the model or Worker fails, the Worker records `outcome = 'failed'` in D1 and does not call `settleQuery`. The buyer can then call `refundExpired` after 10 minutes.

If settlement fails (on-chain tx reverts or RPC is unreachable), the Worker retries once with a new nonce. If it still fails, the outcome stays `pending` in D1. The buyer can refund after timeout. A monitoring alert is needed for `pending` rows older than 10 minutes (not yet implemented).

### Retries and concurrent requests

Replay protection: D1 checks `requestIdExists` before inserting any new row. If a requestId already exists, the Worker returns 409. This prevents duplicate model calls and duplicate settlement attempts for the same requestId.

Concurrent requests for the same collection but different requestIds are permitted. Each has its own escrow.

### When the current policy is checked before retrieval

The Worker reads the on-chain policy via `getCollection` immediately before calling `retrievePassages`. This is the critical gate. If the policy is paused or the policy version has incremented since the buyer's `openQuery`, the Worker denies the request. Because `openQuery` checks `active` at the contract level, a paused collection cannot even open new escrow. The Worker's policy check is a second gate for version staleness.

**Note:** there is a race condition: the collection could be paused between the Worker's policy check and the passage retrieval. This window is tiny (milliseconds) and not worth closing in a hackathon prototype. The worst outcome is that the owner's Worker-side key is used to settle despite the owner having paused. This is resolved by the audit log in D1 and can be addressed with a post-settlement policy re-check before releasing funds in a production version.

### When an answer may be released to the buyer

The answer is returned to the buyer only after:

1. Payment escrow is confirmed (`txHash` present in the request body from the buyer).
2. The on-chain policy is active at time of retrieval.
3. Passages are successfully retrieved from R2.
4. The model returns a non-empty answer.
5. `settleQuery` succeeds on-chain (or is skipped in local dev mode).

Step 5 is done before the response is sent. If settlement fails, the Worker returns a 500 error and the answer is withheld, even though the model call succeeded. The buyer can refund after timeout.

**Open decision:** should the answer be released if settlement fails after a successful model call? The approved plan says "answer withheld" on service failure. This is the current implementation. Releasing the answer before settlement would improve UX but remove the owner's incentive guarantee. Keeping the answer withheld is the safer default.

### What information remains off-chain

Off-chain (never in any transaction or contract storage):
- Question text
- Source passages
- AI-generated answer text
- Model prompt and response
- Collection document content

On-chain (in contract storage or transaction data):
- collectionId, owner address, price, policy version, active status
- requestId, buyer address, escrowed amount, policyVersion at open time, openedAt timestamp
- Escrow state (Open, Settled, Refunded)

In D1 (operator-controlled, private):
- All of the above plus tx hashes, passage IDs, response digest (SHA-256 of answer), outcome

---

## Event and content gates

### Submission portal

Portal not accessed. These are unverified:

- [ ] Whether Monad testnet deployment is accepted (vs mainnet requirement)
- [ ] Required fields: repository, live demo URL, video
- [ ] Dynamic bounty submission requirements (link to Dynamic integration description)
- [ ] Confirmation of the exact deadline display on the portal

### Dynamic bounty

The build plan requires combining multiple Dynamic primitives. The current implementation uses:

- Embedded wallets (primary, confirmed in code)
- Custom EVM network (Monad testnet, configured)

Agent wallets and delegated access are flagged as unverified gates. Do not commit to them until confirmed working on Monad testnet.

### Kimi API

Not verified. `MODEL_PROVIDER` defaults to `openai`. If Kimi access is confirmed, set `MODEL_API_BASE` and `MODEL_NAME` to the Kimi endpoint and model ID. Do not make a Kimi bounty claim unless the actual demo uses Kimi.

### Demo user feedback

Three users must review the demo guide before the public demo. Not yet collected. Required by the Oct 3-4 feasibility gate.

---

## Remaining Stage 1 tasks

1. Run `cd frontend && npm install` and `npm run typecheck:frontend`. Fix any type errors.
2. Run `cd worker && npm install` and `npm run typecheck:worker`. Fix any type errors.
3. Set `VITE_DYNAMIC_ENVIRONMENT_ID` and verify Dynamic sign-in renders in browser.
4. Set `DEPLOYER_PRIVATE_KEY` and run `npm run deploy:testnet`. Record deployed address.
5. Set `SETTLEMENT_PRIVATE_KEY` and `MODEL_API_KEY`. Run `npm run db:migrate:local` and `cd worker && npm run dev`. Test `/api/queries/execute` against a local Worker.
6. Verify Kimi API access. If unavailable, confirm `openai` as the provider and update this file.
7. Collect feedback from three likely users on the demo guide.
8. Check submission portal fields.

---

## Stage 2 prerequisites

Before starting Oct 4-6 payments and gate work:

- Contract deployed to Monad testnet with known address.
- Dynamic sign-in confirmed in browser with Monad testnet wallet.
- At least one complete local dev loop: upload guide, execute query, verify receipt in D1.
- Model API key confirmed working with at least one real response.
- D1 database ID filled into `wrangler.toml`.
