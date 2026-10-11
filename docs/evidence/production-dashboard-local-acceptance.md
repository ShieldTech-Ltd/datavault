# Production dashboard local acceptance

Date: 9 October 2026. Branch: `codex/production-dashboard`. Base: `04d78aa369661e0f766928c0188f87d4739254ee`. Record the implementation commit from this branch's Git history; this report is included in that candidate.

## Implemented

The production frontend now uses the selected DataVault Light Dashboard Interface design: top navigation, narrow sidebar, connected-globe hero and registration/query/answer workflow. Marketplace, collection details, owner collections, earnings, buyer history, analytics, signed API documentation and settings use actual Worker responses. Failures and malformed responses cannot become successful zero-data dashboards.

Owner and buyer reads use the existing purpose-bound wallet signatures. Returned account identity is checked. Wallet changes remount private state. Linked request recovery verifies buyer, chain, contract and identifiers before selecting the original payment. Owner revenue describes direct settlement rather than a fabricated withdrawable platform balance.

The Text tab creates a Markdown file in memory and uses the existing signed private upload flow. File uploads retain the current backend format and 500 KB limit. Unsupported imports, upgrades and API key issuance are disabled or unavailable.

The explicit `/rehearsal.html` development entry uses disposable unlocked Hardhat accounts only, verifies loopback hosting and chain 31337, and is excluded from the production build. Normal production entry contains no test wallet or sample contributor preview.

## Verified checks

| Check | Result |
| --- | --- |
| Frontend typecheck, route/API tests, build | Passed, 4 frontend tests |
| Worker typecheck and tests | Passed, 139 tests |
| Solidity contract tests | Passed, 21 tests |
| SQL staging, confirmation, deployment scope and concurrency invariants | Passed |
| Release guard and smoke helper regressions | Passed, 8 tests |
| Frontend and Worker production dependency audits | Zero reported vulnerabilities |
| Wrangler package dry run | Passed, not a deployment |
| Production test-wallet/sample-code exclusion check | Passed |
| Desktop and mobile visual acceptance | Passed with explicit product-state constraints, see `design-qa.md` |

The build reports a main JavaScript chunk larger than 500 KB. Code splitting remains a performance improvement, not a demonstrated payment failure.

## Running local stack

- Frontend: `http://127.0.0.1:5175/`.
- Local Worker: port 8787, with a second rehearsal listener on 8790 sharing local D1/R2 persistence.
- Hardhat RPC: `http://127.0.0.1:8545`, chain 31337.
- Contract: `0x5FbDB2315678afecb367f032d93F642f64180aa3`.
- HTTPS model stub: port 9443 with a local certificate trusted by the development Worker process.
- Local env files and generated operator credentials remain ignored. No secret values are in this report.

The deterministic stub verifies the payment and provenance pipeline. It does not prove answer quality or a real model integration.

## Browser acceptance evidence

New original test knowledge was registered using the Text tab:

- Collection: `0xb9d0e79ff14147bc7861965f54022d25da2818b0b086a9f0df725de789879e85`.
- Registration transaction: `0x809e9d011e13818248b68c4ed412e79debeeb7a3b2f7134e475dca141af0a5d4`.
- A different local buyer paid for the new collection. Opening: `0x8ba26395e4f8e3e55a37e0714c61dc1b0baa013c4bf8d9c997d2bcda3d1c9e0b`.
- Settlement: `0x301ec602f594edac510e1f9832272f5d99d26c37743fe509ef8a6c25ef01071b`.
- Owner balance increased by exactly `1000000000000000` wei (0.001 test MON).
- Answer digest matched the contract settlement event. The owner earnings view showed one settlement and 0.001 MON.
- Registration and settlement refreshed the real dashboard counts and revenue automatically.

An earlier browser request (`0x52526178ae68df429bea2705cb1ce858cb3ce40726145c01af40f81301f095d8`) was recovered after a fresh page load without another payment. Switching accounts cleared its answer, and the wrong account's linked recovery returned a wallet/deployment mismatch. Signed history displayed its actual receipt and recovery link.

The owner paused the new collection (transaction `0x4fd25e32cdbf036c92595bccae3c36f951b31ca806ba0d7adb058b539f9d76cd`). Its quote was denied before payment. The owner then resumed access so the local collection remains reusable.

The command-line full local rehearsal additionally passed refund after the actual contract timeout, owner payout, digest checks, crash recovery, stored-answer settlement recovery, wrong-buyer denial and pause enforcement. Its refund transaction was `0xbd5cee78d09274928902e68097c5cdb5371fe2bc3017ea20d4443e0f90eef23d`. This refund was verified through the rehearsal script, not clicked in the browser.

The real payment progress states and recent-request controls follow the selected middle panel. Recovered answers select their original collection, and the Copy action was verified in the browser. Native Share is enabled only when supported by the browser.

A read-only independent code review found no critical or important findings. The final frontend build and typecheck passed after the reviewed UI adjustments.

Browser file chooser automation was blocked by the extension's file access permission. Registration was completed through the real Text path without changing that permission.

## Public deployment gates

LIVE DEMO NOT READY.

Wrangler reports that Cloudflare is not authenticated. The ignored `worker/wrangler.deploy.toml` is absent. The tracked config retains a placeholder D1 ID and empty contract address. Environment inspection found no deployment signer, model key, production settlement key or Cloudflare API token. Local ignored rehearsal credentials are disposable and must not be promoted.

Next required external work: sign into the intended Cloudflare account, configure real D1/R2 and the private deployment file, deploy a fresh Monad testnet contract with an authorized signer, configure an authorized operator and model with a spending cap, rebuild the matching browser manifest, and pass the live release guard. Then follow `docs/deployment.md` for real-wallet questions, payout, recovery, pause and timeout refund before recording any demo video.

No public resources were created, no live funds were spent, and no public deployment or video was claimed.
