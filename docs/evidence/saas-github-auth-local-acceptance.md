# Private GitHub connections local acceptance

Accepted locally on 9 October 2026 at feature `012ebb0` after independent task review and a scoped lifecycle fix. Hosted CI passed at test-fix head `6d73f60`. The provider remains unconfigured; this is implementation and disabled-provider acceptance, not live OAuth or private-repository proof.

## Implementation and covering evidence

The read-only GitHub App connector uses selected repositories, S256 PKCE, encrypted server-only user credentials, account/browser/session/deployment state binding and explicit current-wallet confirmation of a pending connection. Pending capability cannot import. Fixed provider requests reject redirects, permission drift and operator-token fallback. Refresh leases and credential versions fence concurrent requests and disconnects.

Migration `0019` adds shared connector state/storage and nullable linkage to existing GitHub jobs. Migration `0020` adds independent cleanup obligations containing only random IDs and timestamps. Failed callback or rotated-token cleanup remains visible through status/export and manual revocation guidance. A successful old-token cleanup clears only its own obligation, preserving independent uncertainty. Unretained orphan tokens cannot be retried automatically; obligations do not expire or become verified merely because time passed or a different token was revoked.

Independent review approved feature and scoped fix, with no open blocker. Full Worker run passed 275 tests with one existing opt-in public-provider skip across 29 files before the final shared-state refactor. Final auth/HTTP verification passed 28 tests. The cleanup fix passed the complete affected auth file's 28 tests and nine frontend tests; both typechecks passed. Full frontend passed 43 tests and build passed with the existing bundle warning. Actual isolated workerd smoke passed AES-GCM, bounded JSON and all six redirect rejection cases with outbound networking disabled. Populated SQLite migration compatibility passed.

## Existing-stack browser and migration checks

Local D1 received `0019` (five commands) and `0020` (two commands), without reset or changes to confirmed collections and historical receipts. Fresh Chrome rehearsal entry after the fix showed the Owner's profile and workspace alongside Status: disconnected, a truthful provider-unavailable message and disabled Connect GitHub. No provider navigation or consent occurred.

Buyer wallet switch immediately cleared the signed-in private view. Its own sign-in showed its own profile, no Owner workspace and the same unconfigured connection status. Buyer account export `(6).json` contained 5,761 bytes, own address, disconnected/unconfigured `githubConnection`, zero `githubImports`, memberships and invitations, and no source body or credential fields.

Fresh Owner export `(7).json` after `0020` contained 2,466 bytes, own address, disconnected/unconfigured connection, false revocationPending (no actual local obligations exist), one existing cancelled public import, and no source body or provider-secret fields. Current export field names were verified before claims.

Internal navigation from registration to Connection settings retained the fixture wallet. Public GitHub import controls and the existing cancelled recovery job remained available while private connection selection stayed unavailable. No publication occurred during this connector check.

Actual final 390px viewport had client/scroll width 386. Connector panel bounds were 34.8 to 350.8; Connect button bounds were 34.8 to 159.3. Desktop/mobile captures are in Downloads as `DataVault-SaaS-GitHub-Connection.png` and `DataVault-SaaS-GitHub-Connection-Mobile.png`. Viewport was reset afterward.

## Remaining gates and deferred review items

Apply both migrations before enabling this feature. Follow [provider setup](../github-authorization.md) for actual HTTPS origin, read-only selected-repository app configuration and private secrets. Actual installation, consent, private fixture import, live refresh and remote revocation remain separate authorized acceptance gates.

Deferred minor guidance: normal refresh invalidates older private drafts under the required version fence; users need an explicit fresh-import explanation. API publicOnly metadata/source copy and the pending confirmation deadline need consistency work. Existing large frontend bundle remains a final release optimization item. Final cross-feature and public-network acceptance are still pending.

## Exact-head hosted follow-up

PR #62 remains a draft stacked on PR #61. Initial head `7a607c1` had one five-second quota integration timeout in CI, with 282 other Worker tests passing. Test-only fix `6d73f60` seeds real SQLite near the boundary and verifies actual Worker PATCH admission 19, DELETE admission 20, next DELETE denial and persisted count 20. Independent scoped review approved it without production or timeout changes. The clock is not frozen; Retry-After is the limiter's constant 60 seconds.

Focused default-timeout reproduction failed before the fix and passed afterward. A full default Windows run on the 16-CPU Node25.6 host passed the revised test but had 19 other SQLite subprocess-contention timeouts, with 264 passing and one skipped. This does not establish default Windows suite success.

All eight hosted checks passed at exact head `6d73f60dd5cfd5106f3e916eee0925cf88f04804`. CI run `37971282833`, Worker job `113958257762`, passed 283 tests with one opt-in public-provider skip across 29 files. Frontend job `113958257690` passed 44 tests and production build after clean Linux installation. No PR was merged or provider enabled.
