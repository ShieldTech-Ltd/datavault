# DataVault build status

Updated 9 October 2026 for draft PR #51. This is source and local verification evidence, not a deployment claim. PRs #48, #49, and #50 are merged on GitHub.

## Implemented in source

- Solidity contract supports owner registration, operator rotation, price and pause policy, fixed-price query escrow, operator settlement to the owner, and buyer timeout refund.
- Worker stages a signed owner upload, confirms registration against the on-chain owner and matching transaction receipt, and stores content privately in R2 with D1 metadata.
- Paid query execution checks runtime configuration, current on-chain policy and operator, escrow, buyer signature, opening transaction receipt, and request ID claim before R2 retrieval or model use.
- Model calls use selected passages and validate versioned citation IDs. Answer text is stored in D1, but returned only after settlement confirmation. Public receipts exclude answer and source text.
- Expired no-answer claims can be retried against the same escrow. Signed reconciliation can settle an already stored answer after a Worker exit. D1 lease tokens fence competing Workers.
- Buyer UI has a guided sample entry when a real confirmed sample ID is configured, wallet payment, settlement status, signed recovery, and on-chain refund action. Owner UI supports registration and pause or resume.
- Owner registration now records a pending transaction for resuming Worker confirmation after a browser interruption. A manual ID and transaction fallback covers lost browser storage. Confirmation retries must match the recorded owner and transaction and cannot overwrite a confirmed D1 row.
- The reference dashboard layout has a live collection catalogue, search by collection name, verified query workspace, provenance receipt, and recorded marketplace and owner analytics. It has no team invitation or permission system. It does not store question text for a saved-query list or emit a numerical answer-confidence score.
- The ten-page contributor dashboard merged through PR #50 uses local sample state. It is available only under `/preview` in local development. The production entry point remains the API-connected app. The preview is not evidence of implemented API keys, balances, settings, or activity.
- The production buyer and owner workspaces remount on wallet account changes, clearing in-flight view state from the previous account. The local rehearsal network is labelled as a local chain in the wallet switch control.
- Content replacement is disabled in the public API and UI because the former path did not advance on-chain policy version.
- API responses have no-store and browser security headers, and public deployments reject unlisted browser origins, including localhost.
- The production frontend build emits a public release manifest with its contract, chain, and RPC. The release guard compares those values with the selected Wrangler deployment config and rejects a stale or mismatched frontend artifact. Paid quotes also fail closed when the model endpoint is malformed or insecure, before opening escrow.
- Answer recovery and reconciliation signatures include chain ID and contract address. Query lookup is scoped to the configured deployment, so a signed request and stored row cannot be reused across deployments.

## Local checks on this branch

- `npm run test:contracts`: 21 passing on 8 October.
- `npm run typecheck` in Worker: passed.
- `npm run typecheck` in frontend: passed.
- `npm test --prefix worker`: 138 passing on 9 October, including sample-guide passage retrieval, registration confirmation retry checks, bounded public quote handling, and rejection of a recovery signature for another contract.
- `python3 scripts/verify-sql-invariants.py`: passed on 9 October, including deployment-scoped query lookup, after explicitly closing SQLite connections for Windows cleanup compatibility. Windows rerun remains pending.
- `npm run rehearse:local`: passed again on 9 October at `9418c4d` after deployment-bound recovery signatures, using a local Hardhat chain, Wrangler D1 and R2, and HTTPS model stub. It covered registration, escrow, cited answer, owner payout, two Worker-failure recovery paths, wrong-buyer denial, buyer and owner reads, pause, and timeout refund. The throwaway local credentials and certificate were removed afterward.
- `python3 scripts/check-secrets.py`: passed on the current tracked tree.
- `npm audit --omit=dev --audit-level=high` in root, frontend, and Worker: zero reported production advisories on 8 October. Recheck before deployment because advisory data changes.
- Frontend build passed after the registration signature change, with no generated JavaScript emitted into source files.
- Frontend production build and routing test passed after the wallet-switch state change. The routing test needs localhost access; its first sandboxed attempt was denied with `listen EPERM`, and it passed when rerun with local socket access.
- The local production entry point was checked in Chrome at desktop and 390 px mobile widths on 9 October. The mobile navigation exposes all five destinations. Without a configured Worker or injected wallet, it shows unavailable and connect states rather than sample balances or receipts. This is a UI check, not a paid browser flow.

## Gates before public deployment

- Review draft PR #51 after CI and source readiness checks. Keep it in draft until the frontend, Worker, database, and security controls form a production candidate. Run the full live end-to-end gate after that candidate is configured; do not treat local rehearsal as live proof.
- Confirm the three production dependency audits remain clear in CI. The injected wallet replacement removed the vulnerable Dynamic dependency tree. The wallet now offers a Monad network switch, but still needs a live browser regression check.
- Verify a real injected-wallet connection, signed registration, signed payment, private R2 and D1 access, actual model response, and owner payout on the configured Monad network.
- Add real Cloudflare D1 and R2 resource identifiers, a deployed contract, Worker secrets, public site origin, and a confirmed sample collection. The tracked Wrangler configuration still contains a placeholder database ID.
- The sample guide now focuses on invoices, banking, and expense records with official source links and no tax-year rates. Complete human review and collect actual user feedback before publishing it. Do not invent results.
- Run the clean-browser live acceptance checklist in `docs/deployment.md` before calling the demo ready.

## Submission status

No public deployment URL, confirmed contract address, public video URL, or Metropolis portal confirmation has been recorded in this repository. Create the Metropolis project only after the deployed app and real video exist and their URLs work from a clean browser. The team should submit by 12 October, ahead of the stated 13 October 11:59 PM Eastern deadline.
