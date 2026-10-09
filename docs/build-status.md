# DataVault build status

Updated 9 October 2026. This is source and local verification evidence, not a deployment claim. PR #51 is merged. The dashboard candidate in PR #52 is open at `f9966d2bef2cb7c0cc3b2e57322d9eba9bcde2c3`; its eight CI/Security checks passed. SaaS changes use separate stacked feature branches based on that candidate, without merging or changing PR #52.

## Current production dashboard and SaaS work

The candidate follows the selected DataVault Light Dashboard Interface. All production routes use real backend responses or explicit disconnected, empty, error and unavailable states. Signed owner collections, owner earnings, buyer history, public analytics, collection details and request recovery have been checked locally in the browser. See [local acceptance](evidence/production-dashboard-local-acceptance.md) for exact transaction evidence and limitations.

The SaaS roadmap is in [the implementation plan](superpowers/plans/2026-10-09-saas-implementation.md). The user authorized all implementation phases on 9 October. A planned feature is not an implemented feature.

| Phase | Verified candidate and state |
| --- | --- |
| Account sessions, profiles, preferences, export and pending deletion requests | PR #53, `30a28e2`, locally accepted and independently reviewed; all eight remote CI/Security checks passed |
| Collection description, category, visibility and confirmed price editing | PR #54, `be1de8a`, locally accepted after review fixes; all eight remote CI/Security checks passed |
| Immutable collection revisions | PR #55, `22c1c39` (feature `30a6481`), locally accepted after recovery fix and scoped review; all eight remote CI/Security checks passed |
| In-app inbox and observed service status | PR #56, `ea4cc51` (feature `26ee386`), independently reviewed and locally accepted; all eight remote CI/Security checks passed |
| Verified email and consent-aware delivery | PR #57, `b6a2ef1` (feature `b23cb8e`), independently reviewed and locally accepted for route tests and disabled-provider UI; all eight remote CI/Security checks passed, real sender/delivery unconfigured |
| Dated analytics, owner CSV, private bookmarks and optional saved questions | PR #58, `25f2a1` (feature `1f8846f`), independently reviewed and locally accepted; all eight remote CI/Security checks passed |
| Scoped developer metadata keys and actual usage | PR #59, `1d1eed7` (feature `b74a929`), independently reviewed and locally accepted; all eight remote CI/Security checks passed |
| Wallet workspaces, invitations, current roles and explicit metadata sharing | PR #60, `a89faf6` (feature `c9f3a38`), independently reviewed and locally accepted; all eight remote CI/Security checks passed |
| Imports and billing | Subsequent implementation phases; not available yet |

See [account acceptance](evidence/saas-account-local-acceptance.md) and [collection acceptance](evidence/saas-collection-local-acceptance.md). The feature PRs are drafts stacked on the unmerged dashboard baseline. See [revision acceptance](evidence/saas-revisions-local-acceptance.md) for immutable history, original answer recovery and interruption tests. A pending deletion request does not delete data. Local payment rehearsal passed all 19 checks after the account phase using the model stub.

The earlier dated checks below remain historical evidence. They do not replace verification of the current feature branch or real public acceptance.

## Implemented in source

- Solidity contract supports owner registration, operator rotation, price and pause policy, fixed-price query escrow, operator settlement to the owner, and buyer timeout refund.
- Worker stages a signed owner upload, confirms registration against the on-chain owner and matching transaction receipt, and stores content privately in R2 with D1 metadata.
- Paid query execution checks runtime configuration, current on-chain policy and operator, escrow, buyer signature, opening transaction receipt, and request ID claim before R2 retrieval or model use.
- Model calls use selected passages and validate versioned citation IDs. Answer text is stored in D1, but returned only after settlement confirmation. Public receipts exclude answer and source text.
- When model context is trimmed, citation validation uses only passages actually sent to the model. An answer cannot cite a passage excluded by the context bound.
- Expired no-answer claims can be retried against the same escrow. Signed reconciliation can settle an already stored answer after a Worker exit. D1 lease tokens fence competing Workers.
- Buyer UI has a guided sample entry when a real confirmed sample ID is configured, wallet payment, settlement status, signed recovery, and on-chain refund action. Owner UI supports registration and pause or resume.
- Owner registration now records a pending transaction for resuming Worker confirmation after a browser interruption. A manual ID and transaction fallback covers lost browser storage. Confirmation retries must match the recorded owner and transaction and cannot overwrite a confirmed D1 row.
- The reference dashboard layout has a live collection catalogue, search by collection name, verified query workspace, provenance receipt, and recorded marketplace and owner analytics. Private saved questions require explicit per-save consent and 30-day retention; bookmarks contain collection references. Developer keys read explicitly selected owned metadata. Team invitations use current membership and explicit metadata grants without delegating wallet authority. The app does not emit a numerical answer-confidence score.
- The production hero describes paid queries on Monad and receipt review. The contract does not issue a legal content licence or certify that an answer is factually correct.
- The ten-page contributor dashboard merged through PR #50 uses local sample state and is restricted to local development. PR #52 integrates the full selected visual design into the API-connected production app. Contributor preview activity is not evidence of implemented API keys, balances, settings, or activity.
- The production buyer and owner workspaces remount on wallet account changes, clearing in-flight view state from the previous account. The local rehearsal network is labelled as a local chain in the wallet switch control.
- Direct `/query` and `/manage` links open the real buyer and owner workspaces. Browser back and forward restore those views, and CI checks their initial rendered content.
- Content replacement is disabled in the public API and UI because the former path did not advance on-chain policy version.
- API responses have no-store and browser security headers, and public deployments reject unlisted browser origins, including localhost.
- The production frontend build emits a public release manifest with its contract, chain, and RPC. The release guard compares those values with the selected Wrangler deployment config and rejects a stale or mismatched frontend artifact. Paid quotes also fail closed when the model endpoint is malformed or insecure, before opening escrow.
- Answer recovery and reconciliation signatures include chain ID and contract address. Query lookup is scoped to the configured deployment, so a signed request and stored row cannot be reused across deployments.

## Local checks on this branch

- `npm run test:contracts`: 21 passing on 8 October.
- `npm run typecheck` in Worker: passed.
- `npm run typecheck` in frontend: passed.
- `npm test --prefix worker`: 139 passing on 9 October, including sample-guide passage retrieval, registration confirmation retry checks, bounded public quote handling, rejection of a recovery signature for another contract, and rejection of citations to trimmed passages.
- `python3 scripts/verify-sql-invariants.py`: passed on 9 October, including deployment-scoped query lookup, after explicitly closing SQLite connections for Windows cleanup compatibility. Windows rerun remains pending.
- `npm run rehearse:local`: passed again on 9 October at `9418c4d` after deployment-bound recovery signatures, using a local Hardhat chain, Wrangler D1 and R2, and HTTPS model stub. It covered registration, escrow, cited answer, owner payout, two Worker-failure recovery paths, wrong-buyer denial, buyer and owner reads, pause, and timeout refund. The throwaway local credentials and certificate were removed afterward.
- `python3 scripts/check-secrets.py`: passed on the current tracked tree.
- `npm audit --omit=dev --audit-level=high` in root, frontend, and Worker: zero reported production advisories on 8 October. Recheck before deployment because advisory data changes.
- Frontend build passed after the registration signature change, with no generated JavaScript emitted into source files.
- Frontend production build and routing test passed after the wallet-switch state change. The routing test needs localhost access; its first sandboxed attempt was denied with `listen EPERM`, and it passed when rerun with local socket access.
- The local production entry point was checked in Chrome at desktop and 390 px mobile widths on 9 October. The mobile navigation exposes all five destinations. Without a configured Worker or injected wallet, it shows unavailable and connect states rather than sample balances or receipts. This is a UI check, not a paid browser flow.

## Gates before public deployment

- PR #51 is merged. Review PR #52 and each subsequent feature against its exact head before source integration. Record the selected deployed candidate and run the full live end-to-end gate before calling the product or demo ready. Local rehearsal is not live proof.
- Confirm the three production dependency audits remain clear in CI. The injected wallet replacement removed the vulnerable Dynamic dependency tree. The wallet now offers a Monad network switch, but still needs a live browser regression check.
- Verify a real injected-wallet connection, signed registration, signed payment, private R2 and D1 access, actual model response, and owner payout on the configured Monad network.
- Add real Cloudflare D1 and R2 resource identifiers, a deployed contract, Worker secrets, public site origin, and a confirmed sample collection. The tracked Wrangler configuration still contains a placeholder database ID.
- The sample guide focuses on invoices, banking, and expense records with official source links and no tax-year rates. Its linked GOV.UK and Business.gov.uk pages were checked on 9 October, and the VAT-invoice wording was corrected to match GOV.UK. Human review and actual user feedback are still required before publishing it. Do not invent results.
- Run the clean-browser live acceptance checklist in `docs/deployment.md` before calling the demo ready.

## Submission status

No public deployment URL, confirmed contract address, public video URL, or Metropolis portal confirmation has been recorded in this repository. Create the Metropolis project only after the deployed app and real video exist and their URLs work from a clean browser. The team should submit by 12 October, ahead of the stated 13 October 11:59 PM Eastern deadline.
