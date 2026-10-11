# Workspace local acceptance

Verified 9 October 2026 against feature `bb87454` and error-guidance fix `c9f3a38`. Independent task review and scoped fix review passed. This records local implementation evidence, not public service readiness.

## Browser gates

- [x] Owner creates a real workspace and shares only explicitly selected owned collection metadata.
- [x] Invitation is bound to Buyer wallet, accepted once and reflects current role.
- [x] Editor can perform permitted off-chain metadata edits; Viewer cannot edit.
- [x] Owner settings/membership/share actions remain unavailable to lower roles.
- [x] Last Owner cannot leave/remove/demote themselves without another Owner.
- [x] Workspace-bound key checks current issuer role/grant on every call.
- [x] Wallet switch and revoked membership clear private workspace views.
- [x] Desktop/mobile actual control bounds match the chosen light design.
- [x] Concurrency/deployment/ownership/RPC/invitation boundary tests and independent review pass.

## Stack and checks

Frontend 5175, Worker 8787, populated D1/R2, Hardhat chain 31337 and existing contract/model stub were preserved. Migration 0017 applied 17 commands without a reset. Worker full suite passed 232 tests across 27 files, followed by final workspace 13/13 after the concurrent invitation retry adjustment. Final frontend 35/35, typecheck and build passed. Existing SSR, CJS and chunk-size warnings remain. Hosted exact-head checks are pending.

## Actual browser journey

Disposable local Owner wallet created Local Browser Workspace, ID `aefdf35917867c57dee3d6b085918cabcc894633d0f419213efcbfb4e656c8b0`. It explicitly shared only Browser Acceptance Knowledge metadata, collection `0xb9d0e79ff14147bc7861965f54022d25da2818b0b086a9f0df725de789879e85`. No source text, paid answers or on-chain authority was shared.

Buyer wallet saw its own seven-day Editor invitation, accepted it and opened the Editor workspace. It saved a temporary description. Owner observed that saved value, then restored the original description, Technology category and public visibility. Viewer demotion removed editing and Owner controls while retaining the explicit metadata read.

Owner created a one-day Workspace Revocation Acceptance key for that workspace and single collection. Copy secret displayed actual success feedback through keyboard submission. Secrets were redacted from observations and never captured in screenshots or committed. A localhost bearer request returned HTTP 200 and exactly one record with collectionId, name, description, category and visibility only. Buyer was promoted to a second workspace Owner, then the original issuer demoted itself to Viewer. The next key request returned HTTP 401, and the collection disappeared from valid workspace grants. Buyer restored the original Owner role, then left; its private workspace view cleared. Original Owner explicitly shared its collection again. The old key still returned HTTP 401 after role/grant restoration. Temporary credential file was removed.

With the original wallet again the sole Owner, a fresh rehearsal entry retried Leave and Confirm. The Worker returned 409 and the final client explained appointing another Owner before leaving or changing the Owner role. The membership remained Owner. This replaced misleading service-outage wording found during initial browser testing.

Wallet changes immediately cleared the preceding private profile/team views and required the next wallet's own sign-in. Account export `datavault-account (4).json`, 1526 bytes, contained the caller's Owner membership and an empty own-invitation list, with no source content, paid answers or key secrets. Export does not include other members' profiles.

At 390px viewport, client and scroll width were 386px. Team form/select bounds were 34.8 to 350.8px, action bounds remained inside the viewport and the dashboard descendant overflow list was empty. Wallet addresses wrapped. Desktop and mobile screenshots are saved in Downloads as DataVault-SaaS-Workspaces.png and DataVault-SaaS-Workspaces-Mobile.png. Some pointer submissions did not trigger requests; keyboard actions produced and verified actual transitions. Pointer-specific behavior is not claimed from those attempts.

Route/SQLite tests cover wrong-wallet/replayed/expired invitations, current membership and ownership, RPC failures, unrelated deployment/workspace IDs, quota/cap concurrency and last-Owner races. The key UI selects from the first 50 shared records; API pagination supports subsequent records. Chain ownership is verified at RPC observations, not a shared atomic snapshot with D1. Source sharing and delegated wallet authority remain separate features. Final cross-feature browser checks and real provider/network acceptance remain pending.

## Hosted follow-up

Draft PR #60 at exact head `a89faf6cba6af1b4ea59ac5909eb4ab4462e54cd` passed all eight CI/Security checks. Run 37960906146 recorded Worker 233/233 tests across 27 files and frontend 35/35 with final build, using clean Linux installs. These checks do not establish public deployment readiness. A subsequent pointer-based Leave/Confirm check also produced the actual 409 guidance while preserving Owner membership; earlier inconclusive pointer attempts remain excluded.
