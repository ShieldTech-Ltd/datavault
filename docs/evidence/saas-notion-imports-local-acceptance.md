# Selected Notion imports local acceptance

Task 7C is independently reviewed and locally accepted at `e63feee`. Exact-head hosted checks remain pending. Live provider consent and deployment readiness are not claimed.

## Gates

- [x] Shared lifecycle preserves accepted GitHub OAuth confirmation, refresh, permission, version and cleanup semantics.
- [x] Populated migration preserves GitHub/website job identifiers, indices, global admission and R2 references without reset.
- [x] Notion fixed-host OAuth uses current official token/refresh/revoke semantics, encrypted credentials and current-wallet confirmation.
- [x] Selected-page traversal remains bounded; unsupported formats report coverage and no remote embedded resources are fetched.
- [x] New drafts require current credentials and explicit review before ordinary owner registration.
- [x] Unconfigured browser UI is truthful, wallet changes clear private views, export contains only safe metadata, and mobile controls fit.
- [ ] Covering suites, independent review and exact-head hosted CI pass.

External HTTPS provider configuration, real user consent, selected private pages and live refresh/revocation are separate acceptance gates. Mocked API tests and deterministic workerd smoke do not prove live Notion behavior.

## Controller observations

On frozen implementation source, a private ignored local D1 SQL export was created first (67,700 bytes, no contents printed). Migration `0022_notion_imports.sql` then applied with nine successful commands and no reset. Both existing cancelled GitHub/website jobs retained their IDs and source digests. All five named job indexes remained present; `PRAGMA foreign_key_check` returned no violations. The historical paid receipt remained settled with unchanged source hash and answer digest.

Fresh Owner settings showed disconnected, unconfigured Notion and a disabled Connect button. No provider navigation or consent was attempted. Wallet switch immediately removed private profile/workspace/connector state. Buyer sign-in showed its own profile and no Owner workspace. Buyer export `datavault-account (9).json` was 5,939 bytes, with unconfigured/disconnected Notion, zero Notion and website imports, and no credential or source fields. Owner export `(10).json` was 3,516 bytes with the same disabled Notion metadata, zero Notion jobs and its own website job metadata. The earlier immediate export followed by wallet switch produced no new download; accepted export evidence uses completed own-account downloads.

The Notion publishing tab showed selected-page and omitted-format guidance, unavailable connection status and a disabled import action. Its internal Manage Notion connection link preserved the Owner wallet/profile. At a 390-pixel viewport, client and scroll widths were both 386 pixels; the connection panel spanned 34.8 to 350.8 pixels and the disabled Connect button spanned 34.8 to 157.7 pixels. Screenshots are in Downloads as `DataVault-SaaS-Notion-Connection.png` and `DataVault-SaaS-Notion-Connection-Mobile.png`. The temporary viewport was reset.

## Verification and independent review

The feature at `8038ff9` produced a full Vitest summary of 387 passing tests and one optional live GitHub skip across 35 files. Its PowerShell redirection wrapper exited one after wrapping a known stderr warning; a separate warning reproduction confirmed this shell behavior. The suite's uncaptured native exit is not inferred from that reproduction. No unhandled-error or failure summary appeared. Clean Linux exact-head CI is a separate gate.

Frontend serial tests passed 51/51 and focused Notion tests passed 4/4. Both typechecks, frontend build, production dependency audits (zero vulnerabilities), actual workerd transport/crypto smoke and Worker package dry-run passed. Existing SSR diagnostics and the large frontend chunk warning remain documented release tasks. Runtime smoke has outbound networking disabled and is not live OAuth proof.

Independent review found an Important cleanup-loss path: reconnect or failed disconnect could remove a token with only an overwriteable warning bit, then successful replacement hid uncertainty. Fix `e63feee` atomically records obligations before credential removal, adopts legacy uncertainty before replacement, and clears only the corresponding successfully revoked obligation. Ten cases reproduced RED and passed GREEN, with rollback and late-success coverage. Complete GitHub and Notion auth suites passed 60/60 with native-preserving exit zero; typecheck and both runtime smokes passed. Scoped re-review approved the fix with no new Critical or Important findings. No schema or UI changed in this fix.

Notion's documented token response has no expiry field. Explicit authenticated refresh uses the encrypted rotating token pair and shared lease/version fences; a null refresh token requires reconnect. Operator Read content only configuration and selected-page consent remain required. Introspection does not provide a documented exhaustive capability inventory, so the implementation does not claim comprehensive scope verification. Consult [provider setup](../notion-imports.md) before enabling it.
