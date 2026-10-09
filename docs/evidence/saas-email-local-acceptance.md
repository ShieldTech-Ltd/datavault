# Verified email and transactional delivery acceptance

Date: 9 October 2026. Candidate b23cb8ec31eb540e8e49300d7773405cbb6f3329. Independently reviewed and locally accepted for the disabled-provider UI and labelled fake-binding route tests. Live provider delivery is not accepted.

## Local acceptance gates

- [x] An unconfigured provider shows an honest unavailable state, with no simulated verified email or send result.
- [x] Settings retain the selected light design at desktop and mobile widths.
- [x] Verification requires the owning wallet session and an explicit action; opening a link does not consume it.
- [x] Verification and notification consent remain separate; historical and re-enable backlog is excluded.
- [x] Wrong account, expiry, replay, replacement and removed addresses are denied by the actual route tests.
- [x] Local fake-binding tests prove bounded delivery retries, fencing, unsubscribe scope and safe export.
- [x] Independent specification/quality review passes at the recorded candidate.

Root browser acceptance checks only the actually configured local UI. Fake-provider test results must be labelled as tests and must not be presented as a real email delivered to an inbox.

## External acceptance gates

Sender domain, Email Service binding, trusted public origin, private link secret, actual verification delivery and notification delivery remain unconfigured. Public claims require a real provider journey after those resources are privately configured.

## In-progress root browser evidence

Applied stable migration0014_verified_email.sql to existing populated local D1 using npm run db:migrate:local: seven commands succeeded, no reset. A sign-in during the prior HMR/schema transition had a recoverable restore error; fresh disposable Buyer sign-in succeeded after migration. No provider configuration was enabled.

Buyer settings showed Email provider unavailable, no verified address, disabled email input, disabled Send verification and disabled transactional email checkbox. In-app preference remained enabled and its separate semantics were visible. At 390 px, actual email input bounds left34.80/right350.80 were within client386, document scroll386. Screenshot: Downloads/DataVault-SaaS-Email-Settings-Mobile.png; desktop: DataVault-SaaS-Email-Settings.png.

Opened actual /settings/email-verify and /settings/email-unsubscribe through the local wallet harness without supplying any token. Verification required the requesting wallet sign-in and explicit Confirm email; no-token confirmation was disabled. Unsubscribe similarly required explicit confirmation and remained disabled without a token. Neither link GET verified or unsubscribed an account. At390, verification button left34.80/right148.86; unsubscribe left34.80/right185.51; client and scroll386. Skip-to-content target and main landmark existed. Return to settings preserved the wallet harness through internal navigation. Screenshots: Downloads/DataVault-SaaS-Email-Verify-Mobile.png and DataVault-SaaS-Email-Unsubscribe-Mobile.png. Viewport override was reset.

This is honest disabled-provider UI evidence only. Enabled-provider verification and delivery remain local fake-binding route tests until actual sender/private links are configured. Independent review and final candidate recording are pending.

At feature d7486ff, original Owner signed in successfully and retained DataVault Local Owner, enabled in-app consent and one unread notification; email remained disabled and unverified. Download account export saved datavault-account (2).json (1231 bytes): two original-owner notifications, account.email verifiedEmail/verifiedAt both null, notificationPreferences inApp true/email false. No token, secret, signature, CSRF, question, answerText, sourceText, providerMessageId or digest fields. The browser download-event wait did not complete in the automation interface, but the actual downloaded file was independently inspected; no duplicate click was needed.

Independent review found a scheduler readiness/starvation regression; fix round1 is active. Positive browser checks above do not accept this head until the scoped fix review passes.

## Final local acceptance

Feature d7486ff and scheduler fix b23cb8e passed independent specification and quality review. Fix review found the original scheduler starvation finding addressed, with no new blocking findings. Six-account regression scenarios verify that backoff, active leases and unavailable-provider work cannot monopolize the first five scheduled accounts; due configured work still progresses. Prior minor UX/test suggestions remain recorded for final whole-branch review.

Verification: email16/16, existing notifications/status8/8 and adapters4/4 passed before the fix. Account13/13 passed on an explicit20-second timeout rerun after one concurrent Windows5-second timeout. The fix passed final adapters10/10 and six focused email regressions. Frontend focused8/8, both typechecks, frontend build, generated native binding declarations and inactive optional package dry-run passed. No actual provider send, domain activation or deployment occurred. Acceptance is limited to implemented routes, labelled fake binding tests and actual unavailable-provider browser behavior.

Provider acceptance is not inbox delivery. A crash after external acceptance but before D1 persistence can cause a duplicate submission on retry. Existing in-flight submissions cannot be recalled after withdrawal. Live sender configuration and real verification/notification delivery remain external gates below.
