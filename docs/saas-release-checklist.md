# SaaS release acceptance

This checklist distinguishes implemented features from live service readiness. Record candidate SHA, deployment origin, chain/contract, migration versions and redacted evidence for every release.

## Local implementation

- [x] Account sign-in rejects replay, another origin, wrong deployment and expired challenges.
- [x] Profile/preferences persist across navigation and reload. Wallet changes clear private state.
- [x] Export contains only the signed-in account's supported records. Deletion requests accurately show pending processing.
- [x] Collection metadata is owner-controlled; unlisted metadata is excluded from public listings and aggregates.
- [x] Price changes require confirmed owner transactions. Historical receipts/answers retain original identity after revisions.
- [x] Notifications correspond to real persisted events; duplicate delivery is idempotent.
- [x] Analytics and exports match recorded settlement amounts and report incomplete coverage.
- [x] Developer keys are scoped, hashed at rest, shown once and revocable.
- [x] Workspace membership is checked on every private operation, including API-key access.
- [ ] Importers bound content, reject internal targets and require review before owner publication.
- [ ] Plan entitlements are server-enforced; provider webhook retries/reordering are handled.
- [ ] Desktop and mobile browser journeys pass with two accounts.
- [ ] Payment, answer, payout, recovery, pause and timeout refund rehearsal passes.
- [ ] Production excludes development wallets and sample activity. Exact-head CI/security checks pass.

Local evidence: [account acceptance](evidence/saas-account-local-acceptance.md), [collection management acceptance](evidence/saas-collection-local-acceptance.md). See also [revision acceptance](evidence/saas-revisions-local-acceptance.md) and [notification acceptance](evidence/saas-notifications-local-acceptance.md). Checkmarks apply to those recorded candidates. Re-run cross-feature acceptance against the final release commit.

Analytics and saved-item evidence: [local acceptance](evidence/saas-analytics-local-acceptance.md). Dated activity and exact owner CSV were checked alongside cross-wallet isolation, opt-in, export and deletion. Current collection inventory is explicitly separate from dated activity.

Developer keys: [local acceptance](evidence/saas-api-keys-local-acceptance.md) records metadata-only scope, actual usage, immediate revocation denial and wallet/mobile boundaries. Final cross-feature checks remain pending.

Workspaces: [local acceptance](evidence/saas-workspaces-local-acceptance.md) records invitation acceptance, Editor/Viewer boundaries, last-Owner protection, immediate key revocation and restored grants without reviving old keys. Final cross-feature checks remain pending.

## Public deployment

Selected public GitHub imports: [local acceptance](evidence/saas-github-imports-local-acceptance.md) records source provenance, confirmed publication and cancellation without changing historical receipts. Remaining importer and final-release gates stay open.

- [ ] Intended Cloudflare account and public domain are recorded.
- [ ] D1/R2 resources, migrations, Worker configuration and secrets are configured privately.
- [ ] Deployed contract/operator and frontend manifest agree with the real network.
- [ ] Real model endpoint/key and spending cap are configured; cited response is verified live.
- [ ] Fresh-browser wallet onboarding, publication and a new paid query complete successfully.
- [ ] Owner payout is confirmed on chain; recovery, pause denial and timeout refund pass live.
- [ ] Verified email and OAuth providers are configured before their features are advertised.
- [ ] Billing provider, currency, actual plan limits and cancellation behavior are approved before real charges.
- [ ] Privacy/retention, account deletion processing, source-provider consent and support contact are published.
- [ ] External availability monitoring, error visibility, backup/restore rehearsal and rollback procedure are verified.
- [ ] User-facing feature claims reflect enabled, accepted capabilities only.

Passing local tests or deploying a Worker alone does not complete this checklist. A disabled provider-dependent feature may remain disabled for a narrower release, but that release must not advertise it as available.
