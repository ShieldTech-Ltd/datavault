# Account phase local acceptance

Date: 9 October 2026. Feature branch: `codex/saas-accounts`, based on the unmerged PR #52 dashboard candidate. This record covers account sessions and settings, not all SaaS roadmap phases or a public release.

## Browser evidence

The existing local Worker/D1 stack received migration `0010_account_sessions.sql` without resetting collection or payment records. The frontend runs at `http://127.0.0.1:5175/`; browser tests used the explicit development-only `/rehearsal.html?route=%2Fsettings` entry and disposable Hardhat accounts.

- The owner signed the standard account sign-in message and received the profile form.
- Display name `DataVault Local Owner` and the disabled in-app preference were saved and restored across route navigation and a fresh page initialization.
- The save confirmation remains visible after a successful update.
- Account export downloaded a 520-byte JSON file containing that profile/preferences and its declared export scope. No question/source text or payment authorization was included.
- Switching to the local buyer immediately cleared the owner's profile. Signing in as buyer produced a separate empty profile; `DataVault Local Buyer` was saved independently.
- Sign-out removed the buyer profile form and returned to explicit sign-in.
- A buyer deletion request showed pending status and the explicit statement that no data had been deleted.
- At a 390 by 844 viewport, document and scroll widths were both 386 pixels, with no horizontal overflow. The viewport override was reset afterward.
- No browser console errors remained after the fixed transport was tested.

Browser testing found and fixed a default-fetch receiver error and a save-notice reset race. The export download event could not be captured reliably by browser automation, but the completed downloaded artifact was inspected directly and matched the owner account. Keyboard Space toggled the notification checkbox; automated pointer uncheck did not change it during this run.

## Limits

Sessions authorize profile metadata, not payments or paid query execution. Existing signed collection, history, payment and recovery protocols remain separate. Email delivery, inbox, teams, developer keys, imports, subscription billing and destructive account-deletion processing are still subsequent phases. Public deployment and real-model acceptance remain open.

Screenshots are saved in Downloads as `DataVault-SaaS-Account-Settings.png` and `DataVault-SaaS-Account-Settings-Mobile.png`.

## Candidate validation

Implementation candidate: `3d20516c42a3f61f633dadc5392db04cb84b6a13`. Worker suite: 150 tests passed across 17 files. Frontend suite: 9 tests passed. Both typechecks, production build and SQL invariant verification passed. Existing bundle-size and SSR router warnings remain.

Independent scoped review passed specification compliance and approved code quality with no blocking findings. The reviewer inspected the immutable implementation diff, guarded SQL, unchanged wallet integration and supplied logs. Final amended head differs from the initially reviewed commit only in router comments.

Root ran `scripts/rehearse-local.mjs` against the populated local stack after the feature changes. All 19 checks passed, including registration, escrow, wrong-buyer denial, cited stub answer, settlement, owner payout, receipt discovery, interrupted-query resume, answer recovery, analytics, pause denial and timeout refund. This proves the local model-stub integration, not a real model or public deployment.

Phase 1 is locally accepted. Remote CI, a focused PR and public acceptance remain open.
