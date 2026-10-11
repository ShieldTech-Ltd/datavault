# Developer keys local acceptance

Date: 9 October 2026. Locally accepted at `b74a929c70c02a80a87bb1904b22392a23cc713d` following independent specification and quality review. Hosted exact-head checks remain a separate gate.

## Browser and API results

The signed-in owner loaded five genuinely owned collections, selected only Browser Acceptance Knowledge and created Local Browser Acceptance with a one-day expiry. The secret was displayed once, captured privately for a localhost test, redacted from observations and dismissed before screenshots. The list showed only its short prefix, scope, allowed collection name and expiry.

The developer endpoint returned HTTP 200 with exactly one selected collection: `0xb9d0e79ff14147bc7861965f54022d25da2818b0b086a9f0df725de789879e85`. Fields were collectionId, name, description, category and visibility. No sources, paid answers, personal account fields or credentials were returned.

The first Windows PowerShell Invoke-WebRequest received the response but failed in its legacy parser. Retrying with UseBasicParsing verified HTTP 200. The real UI correctly recorded two successful calls and two quota claims, zero quota rejections, ownership denials or chain failures. These are disposable local calls, not production traffic.

The UI's explicit revoke confirmation changed the key to revoked. The next actual developer request returned HTTP 401. Its temporary private credential file was then removed. Switching to Buyer immediately hid owner records; the signed-in buyer had no keys or recorded usage. Returning to Owner restored the revoked record without a secret. Sign-out hid the key list.

A second disposable key, Mobile Disclosure Acceptance, verified mobile one-time disclosure. At 390px its secret element bounds were 45.60 to 340px within the 386px client width, with scroll width386. Navigating away and returning showed no disclosure. That key was revoked too. A fresh application entry retained both revoked records and no secret. Independent D1 metadata counts confirmed two records and zero active keys for the owner. No pre-existing data was deleted.

## Design and verification

The selected light design remains. Actual mobile form and fieldset bounds were 34.80 to 350.80px; checkbox bounds47.60 to63.60px, within client/scroll386. Key actions also fit. Screenshots in Downloads: DataVault-SaaS-API-Keys.png, DataVault-SaaS-API-Keys-Mobile.png and DataVault-SaaS-API-Keys-Mobile-Usage.png. All exclude raw secrets.

Migration0016_developer_keys.sql applied10commands to populated local D1 without reset. Implementer verification passed220Worker tests across26files,29frontend tests, both typechecks and final production build. Independent task review approved spec compliance and code quality with no blockers. Meaningful tests cover strict scope/ownership/session/CSRF, atomic concurrent key and rate limits, expiry/revocation, privacy, paid authorization isolation and stale wallet creation fencing. Workspace keys fail closed until Task6.

Initial browser HMR retained an old AccountClient instance, producing a missing method error. A fresh rehearsal entry initialized the final class correctly; no source fix or data reset was needed. The final workflow must use a fresh entry after class/interface changes.

## Remaining limits

Clipboard interactions were not browser-tested. Source handles copy success/failure, and final cross-feature browser acceptance remains pending. Review minors: dense formatting, known SSR/optimizer/CJS and bundle warnings, additional second-collection exclusion and exact Retry-After assertions. Stale creation revocation is best effort if the original session has already logged out; reconnect and inspect/revoke stranded keys. Already claimed calls may finish after revocation. Counter cleanup is opportunistic with30daylogical read retention.

Hosted follow-up: all eight PR #59 checks passed at exact head `1d1eed7bff08a281c3a498b062477cde02a39755`. Clean Linux jobs ran 220/220 Worker tests across 26 files and 29/29 frontend tests, both typechecks, final build, contract tests, guards, production dependency audit and package dry run. This resolves the earlier pending hosted gate.

These are local Hardhat/Worker tests. They do not establish public deployment or final SaaS readiness.
