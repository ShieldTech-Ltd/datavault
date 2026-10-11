# Production Dashboard Implementation Plan

> Execute inline using the executing-plans skill, with verification at each task boundary.

**Goal:** Make the complete dashboard the real DataVault production frontend.

**Architecture:** A dedicated production route tree shares a dashboard shell and a deployment-scoped data provider. The provider handles public catalogue and analytics, plus explicit signed owner and buyer reads. Existing owner and buyer payment components remain the source of truth for wallet actions.

**Tech Stack:** React 18, TypeScript, Vite, React Router, viem, Phosphor icons, Cloudflare Worker/D1/R2 and Solidity.

**Spec:** `docs/superpowers/specs/2026-10-09-production-dashboard-design.md`.

## Global constraints

- No simulated production activity, credentials, earnings or payments.
- Reuse existing signature messages and payment/recovery handlers.
- Preserve the original shared checkout and separate professional design worktree.
- Local and live evidence remain distinct. Never log private credentials or source content.
- No em dashes in authored prose.

## Task 1: Production data boundary and route contract

Files: `frontend/src/production/api.ts`, `data.tsx`, `App.tsx`, `frontend/test/production-dashboard.test.mjs`.

- [x] Add regressions for all production route initial states, unsupported API key issuance, and failed API responses without empty-data fallback.
- [x] Run the new tests against the old app and observe the missing behavior.
- [x] Implement `apiJson<T>(path: string, init?: RequestInit): Promise<T>` which requires HTTP success and JSON, throws a safe error on failure, and uses `cache: 'no-store'`.
- [x] Define typed collection, analytics and history payloads matching Worker routes. Provide explicit signed workspace loading with `ownerSummaryMessage` and `buyerHistoryMessage`.
- [x] Verify account identity checks before accepting returned data; scope the provider by wallet address, chain and contract. Run tests and frontend typecheck.

## Task 2: Full dashboard presentation

Files: `frontend/src/production/Shell.tsx`, `Pages.tsx`, `dashboard.css`, professional assets and frontend package files.

- [x] Copy only approved professional image assets; install existing Inter and Phosphor packages.
- [x] Implement the full sidebar/header, responsive navigation, search and browser-only theme with the preview's visual language.
- [x] Wire public collection cards to real detail and query routes. Wire owner views to signed collection and analytics data, keeping direct settlement terminology.
- [x] Provide buyer history with receipt, recover and refund links. API Access documents the signed protocol without key issuance; Settings shows connection/deployment identity and local preferences.
- [x] Preserve existing BuyerDashboard/OwnerDashboard with selected collection/request links, account resets and provenance behavior.
- [x] Build, run route/API regressions and inspect production output for sample business data.

## Task 3: Running local acceptance

Files: rehearsal scripts, local env files (ignored), integration evidence and design QA.

- [x] Check available local services and ports without overwriting existing env files.
- [x] Make rehearsal setup platform-compatible and configure one isolated local chain, operator, D1, R2 and HTTPS stub.
- [x] Run the paid-flow rehearsal and verify registration, payout, digest, recovery, denial and timeout refund.
- [x] Open the integrated frontend in the available browser and test desktop/mobile routes and the injected-wallet journey. Record any unavailable browser gate explicitly.
- [x] Run Worker tests, contract tests, SQL invariants, frontend checks, production audits and Cloudflare package dry run on the final candidate.

## Task 4: Deployment candidate and live gates

- [x] Record reviewed candidate commit, configuration identity and acceptance evidence.
- [x] Inspect available private deployment config and credential names without printing values. Identify any resources still needed.
- [ ] Configure the new contract, migrations through 0009, D1/R2, model, operator and frontend manifest when access permits.
- [ ] Deploy only the verified candidate and follow `docs/deployment.md` for three paid questions, fresh-wallet onboarding, payout, recovery, pause and real timeout refund.
- [x] Keep public demo readiness open until live evidence exists; do not record a simulated demo video.


Selected visual target was updated by the user to DataVault Light Dashboard Interface.png. Local evidence and remaining live gates are recorded in docs/evidence/production-dashboard-local-acceptance.md. The browser Text registration path passed; file chooser automation remains unavailable without an extension permission change. Timeout refund passed in the command-line rehearsal, not the browser. Remote configuration and deployment remain open.
