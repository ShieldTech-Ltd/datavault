# DataVault SaaS Implementation Plan

> For agentic workers: use executing-plans to implement one approved phase at a time. Track steps with checkboxes. The user authorized implementation of all phases on 9 October 2026. Provider activation and public acceptance remain separate gates.

**Goal:** Make the existing paid-query product a persistent SaaS while preserving the user's selected light dashboard design.

**Architecture:** Retain React/Vite, the single-origin Cloudflare Worker, D1, private R2 and Monad escrow. Add account sessions for SaaS metadata, followed by independent collection, notification, analytics, developer and team modules. Account sessions, keys and subscriptions never replace buyer authorization or on-chain payment.

**Tech stack:** Existing TypeScript, React, viem, Solidity and Cloudflare services. A maintained SIWE verifier for account sessions after dependency review; Queues when background work is introduced. Billing provider selection remains a commercial decision.

**Spec/design baseline:** `docs/superpowers/specs/2026-10-09-production-dashboard-design.md` and the user's DataVault Light Dashboard Interface image. The proposed subsystem designs below require review before their implementation.

**Inspected candidate:** `f9966d2bef2cb7c0cc3b2e57322d9eba9bcde2c3`, PR #52, open on 9 October 2026. Existing local evidence: `docs/evidence/production-dashboard-local-acceptance.md`.

## Global constraints

- Preserve the chosen layout, artwork, light theme and responsive navigation.
- Never fabricate metrics, notifications, keys, balances, receipts or payment success.
- Preserve deployment-bound signatures, query leases, recovery, settlement, direct owner payout and timeout refund.
- Store amounts as exact integer wei. Platform subscriptions and collection query payments remain separate.
- Keep source text in private R2; never expose it through public catalogue, notifications or analytics.
- Use sequential D1 migrations and test upgrades against populated databases.
- One focused PR per independently testable deliverable; review the exact head before merging.
- Keep credentials out of source and chat. Provider setup occurs through private secret configuration.
- Do not enable a feature in the UI until its backend and acceptance checks pass.

## Missing features and delivery order

| Feature | Current state | Phase |
| --- | --- | --- |
| Persistent profile and sign-in session | Connected wallet only | 1 |
| Saved settings, export and deletion requests | No server-side account management | 1 |
| Collection descriptions, categories, visibility and price editing | Basic metadata; price update exists in contract | 2A |
| Content replacement/version history | API returns HTTP 410 | 2B |
| Notifications and preferences | No inbox or email delivery | 3 |
| Uptime/service status | Explicit unavailable metric | 3 |
| Daily charts, date ranges and CSV export | Fixed real 30-day summary | 4 |
| Bookmarks and saved questions | Recovery IDs only; no question storage | 4 |
| API keys, scopes and usage | Signature protocol documentation only | 5 |
| Teams, invitations and roles | No workspace membership model | 6 |
| Website/GitHub/Notion imports | Disabled buttons | 7 |
| PDF/DOCX and larger uploads | Markdown/TXT only, 500 KB limit | 7 |
| Pro plans, billing portal and invoices | Upgrade disabled; no billing backend | 8 |
| Public deployment and real model | Local verification with model stub | Release gate |

A withdraw button is unnecessary under the current contract: settlement pays directly to the owner's wallet. Shared payouts or custodial balances require a separate funds-handling and contract design.

## Recommended approach

1. **Wallet-first SaaS, recommended:** persistent useful features around the existing paid-query flow, with minimal payment disruption.
2. **Email accounts with linked wallets:** potentially easier onboarding, but adds account linking and recovery complexity before proving demand.
3. **Enterprise-first build:** teams, connectors and billing together, with a much larger isolation and review burden.

Assume option 1 for this plan. Ship a personal SaaS first, then developer/team features, then subscriptions based on actual costs and demand.

## Phase 0: Integrate and protect the baseline

**Deliverable:** recorded, reproducible dashboard candidate. This plan does not merge PR #52.
**Files:** CI workflows, `docs/build-status.md`, `docs/deployment.md`, `scripts/check-release-config.mjs`, `scripts/rehearse-local.mjs`.

- [ ] Re-query PR #52 head, full diff, reviews, checks and merge gates. Merge only when explicitly authorized.
- [ ] Record the integrated commit and create an isolated worktree for each feature PR.
- [ ] Refresh `docs/build-status.md`, which still describes the older production entry and PR #51 draft.
- [ ] Preserve release-manifest matching, credential guard, package dry run and full local failure rehearsal.
- [ ] Configure authorized staging Cloudflare resources, Monad contract/operator and a real model when access is available.
- [ ] Complete fresh-browser registration, payment, actual cited model response, owner payout, recovery, pause denial and timeout refund before public readiness claims.

Local development can continue while external configuration is pending. Public acceptance is a separate gate.

## Phase 1: Account sessions, profile and settings

**Deliverable:** wallet sign-in, persistent profile/preferences, sign-out and isolated account state.
**Create:** `worker/src/lib/account-session.ts`, `worker/src/routes/account.ts`, `worker/src/test/account-session.test.ts`, `worker/src/test/account.test.ts`, `frontend/src/production/account.tsx`, `frontend/src/production/AccountSettings.tsx`, `frontend/test/account-settings.test.mjs`. Add the next sequential migration for accounts, nonces and sessions after checking the live migration directory.
**Modify:** Worker router/types/security, production Pages/Shell, wallet integration, `shared/api.ts`, `docs/api-contract.md`.

Proposed interfaces:

```text
POST /api/auth/challenge { address } -> { message, nonce, expiresAt }
POST /api/auth/verify { message, signature } -> { account, expiresAt }
POST /api/auth/logout -> 204
GET /api/account -> { address, displayName, locale, notificationPreferences }
PATCH /api/account { displayName, locale, notificationPreferences } -> account
GET /api/account/export -> private JSON attachment
POST /api/account/deletion-request -> { requestId, status }
```

Use a standard SIWE message bound to origin, chain and deployment resource. Consume a random five-minute nonce atomically once. Use a random opaque session token, store its hash and expire sessions after 24 hours. Public cookies are HttpOnly, Secure and SameSite=Lax, with an explicit loopback development exception. Mutating cookie routes check origin and CSRF token. Wallet changes clear local session/private state and sign out. Start with the externally owned wallets already supported; explicitly reject unsupported contract-wallet verification.

- [x] Add failing replay, concurrent consumption, expiry, wrong-domain/chain/deployment, CSRF and cross-account tests.
- [x] Implement challenge/verify/logout; run the focused Worker session tests.
- [x] Add profile reads/updates: display name at most 80 characters, supported locales only, reject unexpected fields and wallet-address edits.
- [x] Add Settings loading/saving/error states; verify persistence across reload and sign-out isolation using two disposable local wallets.
- [x] Add export/deletion request tracking. Explain immutable on-chain records and define private-content/answer retention before destructive processing. A submitted request is not completed deletion.
- [x] Run affected tests, both typechecks and frontend build; commit and open the account PR.

**Gate:** wallet A cannot read or modify B's profile; replay cannot mint a new session; existing payment and recovery protocols remain intact.

## Phase 2A: Collection metadata and price management

**Deliverable:** owner edits descriptions, categories, catalogue visibility and query price.
**Create:** `worker/src/routes/collection-metadata.ts`, its Worker tests, `frontend/src/production/CollectionEditor.tsx`, metadata migration.
**Modify:** marketplace/detail responses, owner UI, contract bindings, shared API and documentation.

- [x] Test unauthorized edits, oversized descriptions, invalid categories and hidden metadata leaking through search/analytics.
- [x] Add owner-authorized `PATCH /api/collections/:id/metadata`, description limit 2,000 characters and explicit category allowlist.
- [x] Support public/unlisted catalogue visibility. Unlisted remains queryable by ID; do not call it private access control.
- [x] Expose the existing `updatePolicy` price transaction. Display a saved price only after confirmation and chain readback.
- [x] Test cancellation/RPC failure, original escrow amounts and existing policy-change behavior; verify in the browser and open the focused PR.

## Phase 2B: Immutable revisions

**Deliverable:** replace content by publishing a new confirmed revision, preserving historical receipts.
**Create:** revision routes/tests, `CollectionVersions.tsx`, collection-family/revision-link migration.
**Modify:** registration/confirmation, collection detail/marketplace responses and owner UI.

Recommended design: changed content receives a new hash-derived collection ID through the existing registration flow. D1 links old/new IDs as a family. Do not overwrite the old R2 object or pretend the current contract binds new content to an old ID.

- [x] Test staged/failed revisions and unauthorized family links.
- [x] Register and confirm the new collection before marking it current. Check both revisions have the same on-chain owner.
- [x] Show history and current-version links; keep old collection URLs and receipts valid.
- [x] Let the owner explicitly decide whether to pause the old revision, explaining the effect on outstanding requests under current policy rules.
- [x] Verify an old settled answer still recovers against its original content and receipt.

**Gate:** historical content remains immutable. Stable on-chain IDs with in-place content replacement require a separate contract version and migration project.

## Phase 3: Notifications and operational status

**Deliverable:** real in-app events, preferences and measured service status. Email follows verified ownership and consent.
**Create:** event/outbox library, notification/status routes, queue consumer/tests, `NotificationInbox.tsx`, migrations for events/inbox/preferences.
**Modify:** confirmed registration/settlement/reconciliation transitions, Worker bindings/router, Settings and hero metrics.

- [ ] Emit confirmed-registration/settlement and actual failure events using unique deployment/event/request-or-transaction keys.
- [ ] Persist events with D1 transitions where possible; repair missing events by reconciliation. Pending settlement never creates earnings notifications.
- [ ] Add paginated inbox, unread count and mark-read. Exclude questions/source passages from previews.
- [ ] Test duplicate delivery and crashes; one source event produces one inbox item. Add queue/outbox retries and failure visibility.
- [ ] Add verified email, opt-in and unsubscribe before enabling email. Select/configure a provider in its own delivery PR.
- [ ] Record external availability checks with a published sampling window and coverage. Missing observations show unknown; one successful request is not uptime.

**Gate:** cross-account inbox access is denied, duplicates are idempotent, and failed delivery never appears successful.

## Phase 4: Analytics, exports and optional saved queries

**Deliverable:** real daily charts, bounded date ranges, CSV export, bookmarks and explicit opt-in question storage.
**Modify:** analytics/history routes and tests, production API types and Analytics page.
**Create:** saved-item routes/tests/components and migration.

- [ ] Add UTC date ranges up to 90 days, daily buckets and stable pagination. Replace silent aggregate truncation at the current 10,000-row bound with exact supported aggregation or visible incomplete coverage.
- [ ] Separate recorded MON revenue, failure/refund status and data coverage. Do not infer answer confidence from settlement.
- [ ] Add private owner CSV export with formula-injection protection; exact wei totals must match the same scoped date range.
- [ ] Save bookmarks without question text. Require explicit opt-in for saved questions and provide deletion/export with defined retention.
- [ ] Test UTC boundaries, missing historical amounts, large datasets, opt-out and cross-wallet isolation.

## Phase 5: Developer keys and usage

**Deliverable:** create/name/scope/expire/revoke keys, view actual usage, show each secret once.
**Create:** API-key library/routes/tests, `ApiKeys.tsx`, hashed-key/usage migrations.
**Modify:** API Access, rate limits and API documentation.

- [ ] Start with `collections:read` restricted to explicitly allowed owned metadata. Exclude raw sources, buyer answers, publishing, settlements, refunds and administrative writes.
- [ ] Generate 256-bit random secrets; store digest/display prefix only. Initially permit five active keys per account.
- [ ] Add authenticated creation/list/revocation, verify scope per request and never log Authorization headers. List responses never return secrets.
- [ ] Record accepted calls and rate-limit failures separately; enforce configured limits with 429/Retry-After. Revocation applies on the next request.
- [ ] Test revoked/expired keys, missing scope, wrong account/collection and concurrent limits.

**Gate:** keys cannot bypass escrow or buyer signatures. Headless paid-query SDK support needs a separate design.

## Phase 6: Teams and workspaces

**Deliverable:** isolated workspaces with wallet invitations and predictable roles.
**Create:** workspace access library, membership/invitation routes/tests, `TeamSettings.tsx`, workspace/audit migrations.
**Modify:** account/session scope, metadata access, notifications and key ownership.

- [ ] Define Owner (members/settings), Editor (off-chain drafts/metadata), Viewer (explicitly shared metadata).
- [ ] Invite a wallet; require that wallet to accept a single-use invitation expiring after seven days. Prevent removing the last workspace owner.
- [ ] Authorize every private query by current membership, not a client-supplied workspace ID alone.
- [ ] Keep on-chain ownership/payouts unchanged. Membership cannot sign as the owner or read private buyer answers. Source-text sharing needs separate consent and capability.
- [ ] Revoke workspace key access when membership ends; test unrelated workspaces, removed members, replayed invitations and editor restrictions.

**Gate:** tenant-ID changes never expose private data. Delegated on-chain authority requires a separate smart-account or multisig design.

## Phase 7: Imports and background ingestion

Ship one importer per PR: selected GitHub files, selected website pages, selected Notion pages, then PDF/DOCX selectable-text extraction.
**Create:** provider adapters under `worker/src/imports/`, import-job routes/queue consumer/tests, source/job migrations and import wizard.
**Modify:** upload tabs, private R2 ingestion and Worker bindings.

- [ ] Preview extracted content and attribution before publishing; require rights/provider consent. Importing content does not certify permission.
- [ ] Use narrow GitHub/Notion authorization, selected content, protected OAuth state, server-side tokens and disconnect support.
- [ ] For website fetches, allow HTTPS only; reject private/local/reserved targets after DNS resolution and every redirect. Cap pages, bytes and duration.
- [ ] Validate file signatures/MIME and decompressed size. Reject malformed/encrypted unsupported files, never execute embedded content, and defer OCR to its own feature.
- [ ] Normalize to immutable Markdown registration; jobs are idempotent/retryable/cancellable and temporary assets have a retention policy.
- [ ] Test provider failures, duplicate queue delivery, redirected internal targets, hostile/oversized files and interrupted jobs.

**Gate:** reviewed imported content still requires owner-confirmed registration. Higher limits require measured resource/cost acceptance.

## Phase 8: Billing and entitlements

**Deliverable:** truthful plans, hosted checkout, billing portal, invoices and server-enforced limits.
**Create:** billing/webhook routes, entitlement library/tests, Billing page, plan/subscription/processed-event migrations.
**Modify:** Pro sidebar card, Settings and quota enforcement.

- [ ] Decide provider, currency and actual storage/key/job/seat limits from costs and demand. Do not invent pricing or start recurring charges from this plan.
- [ ] Implement provider test-mode checkout/portal; bind customer IDs to the authenticated account/workspace.
- [ ] Verify webhook signatures using raw body, deduplicate event IDs and reconcile reordered events against current provider state.
- [ ] Treat checkout redirects as pending until server verification. Enforce entitlements in the Worker.
- [ ] Define cancellation/grace/downgrade behavior; preserve data and receipt/recovery/refund access when billing fails.
- [ ] Test renewal, cancellation, retries, downgrade with over-limit use and payment failure before live charges.

Platform billing remains separate from query escrow and owner revenue.

## Release checkpoints

1. Integrate dashboard baseline after review and authorization.
2. Accounts/profile, metadata/price and immutable revisions as separate PRs.
3. Inbox, then verified email/status, then analytics/export and saved items.
4. Developer keys, workspace roles and each importer as separate PRs.
5. Billing after commercial decisions and provider test-mode acceptance.

Phases 1-4 plus live acceptance are the first personal SaaS release. Phases 5-7 are the developer/team release. Phase 8 introduces subscriptions. A paid-query public beta can ship earlier if its advertised features pass live acceptance.

## Verification for every feature PR

- [ ] Write targeted authorization/state-transition regression tests and verify the failing behavior before implementation.
- [ ] Run affected suites, both typechecks and production frontend build. Run contract tests when policy/contract behavior changes.
- [ ] Check two accounts, fresh browser state, desktop and 390 px mobile.
- [ ] Re-run payment/recovery/payout/pause/refund rehearsal for identity, policy, retrieval, execution or deployment changes.
- [ ] Confirm production excludes test wallet and contributor sample activity; review migrations against populated data.
- [ ] Record exact-head evidence, CI and external gates in each PR.

```powershell
npm test --prefix worker
npm run typecheck --prefix worker
node --test --test-isolation=none --test-timeout=20000 frontend/test/*.test.mjs
npm run build --prefix frontend
npm run test:contracts
npm run rehearse:local
```

These commands are future acceptance instructions, not claims that unimplemented features already pass. Browser/rehearsal checks require the disposable local stack.

## First implementation handoff

Start with Phase 1 after selecting the integrated dashboard base. Review the wallet-first sessions and retention behavior before coding. Deliver session/profile/settings in one focused worktree with replay/isolation tests and browser persistence evidence. Keep billing, teams and imports in their later PRs.

## Primary technical references

Checked on 9 October 2026; recheck SDKs and provider limits when implementing.

- [SIWE session requirements](https://eips.ethereum.org/EIPS/eip-4361)
- [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)
- [Cloudflare Queues retries](https://developers.cloudflare.com/queues/configuration/batching-retries/)
- [Stripe webhooks, if selected](https://docs.stripe.com/webhooks)
