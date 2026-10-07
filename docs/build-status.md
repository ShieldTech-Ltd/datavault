# DataVault build status

Updated 7 October 2026 for the stacked release branches. This is source and local verification evidence, not a deployment claim.

## Implemented in source

- Solidity contract supports owner registration, operator rotation, price and pause policy, fixed-price query escrow, operator settlement to the owner, and buyer timeout refund.
- Worker stages a signed owner upload, confirms registration against the on-chain owner and matching transaction receipt, and stores content privately in R2 with D1 metadata.
- Paid query execution checks runtime configuration, current on-chain policy and operator, escrow, buyer signature, opening transaction receipt, and request ID claim before R2 retrieval or model use.
- Model calls use selected passages and validate versioned citation IDs. Answer text is stored in D1, but returned only after settlement confirmation. Public receipts exclude answer and source text.
- Buyer UI has a guided sample entry when a real confirmed sample ID is configured, wallet payment, settlement status, signed recovery, and on-chain refund action. Owner UI supports registration and pause or resume.
- Content replacement is disabled in the public API and UI because the former path did not advance on-chain policy version.
- API responses have no-store and browser security headers, and public deployments reject unlisted browser origins, including localhost.

## Local checks on this branch

- `npm run test:contracts`: 20 passing.
- `npm run typecheck` in Worker: passed.
- `npm run typecheck` in frontend: passed.
- `npm run test --prefix worker`: 86 passing after contributor PRs #46 and #47 merged.
- `python3 scripts/check-secrets.py`: passed on the current tracked tree.
- Frontend build passed after the registration signature change, with no generated JavaScript emitted into source files.

## Gates before public deployment

- Merge readiness PR #48 and its stacked security PR #49 after all checks and live gates pass.
- Confirm the three production dependency audits remain clear in CI. The injected wallet replacement removed the vulnerable Dynamic dependency tree, but still needs a live browser wallet regression check.
- Verify a real injected-wallet connection, signed registration, signed payment, private R2 and D1 access, actual model response, and owner payout on the configured Monad network.
- Add real Cloudflare D1 and R2 resource identifiers, a deployed contract, Worker secrets, public site origin, and a confirmed sample collection. The tracked Wrangler configuration still contains a placeholder database ID.
- Review time-sensitive claims in the sample guide and collect actual user feedback. Do not invent results.
- Run the clean-browser live acceptance checklist in `docs/deployment.md` before calling the demo ready.

## Submission status

No public deployment URL, confirmed contract address, public video URL, or Metropolis portal confirmation has been recorded in this repository. Create the Metropolis project only after the deployed app and real video exist and their URLs work from a clean browser. The team should submit by 12 October, ahead of the stated 13 October 11:59 PM Eastern deadline.
