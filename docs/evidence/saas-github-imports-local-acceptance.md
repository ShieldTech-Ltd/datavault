# Selected public GitHub imports local acceptance

Accepted locally on 9 October 2026 at feature `0ebc779`, after independent review and two scoped fixes. Hosted CI passed at `87333d1`. Private GitHub authorization and public deployment readiness remain separate gates.

## Verified implementation

Fixed GitHub API destination, selected public Markdown/TXT paths, exact resolved commit, bounded bytes and duration. No recursive crawl or operator token fallback. Account-scoped jobs support idempotent selection, three attempts, fenced leases, cancellation and 24-hour logical draft expiry. Processing is bounded inline, without an enabled queue. Reviewed drafts stage into ordinary registration without automatic signing or publication.

Current workerd does not support `redirect:error`. Requests use `redirect:manual` and reject every 3xx before consuming or following. Independent review approved preview selection fencing, exhausted stale-lease recovery and safe import-specific error guidance. Active jobs alone poll automatically. Physical cleanup is opportunistic and bounded; scheduled maintenance remains a public release gate because idle expired private bytes can persist until cleanup runs.

## Actual browser and populated storage

Migration `0018` applied six commands to populated D1 without resetting data. Chrome used the existing Worker, private R2, Hardhat contract and disposable local wallets.

Owner imported public `ShieldTech-Ltd/datavault`, `master`, `docs/receipt-format.md`. Job `f126aeba8a207011e90c20593b1bfef897f8533beb7fc87d8414182914b58543` recovered from the runtime failure to `review_ready` on attempt 2, resolving commit `04d78aa369661e0f766928c0188f87d4739254ee`.

Escaped preview and downloaded `github-import.md` contained 986 bytes. SHA-256 `694d4c8cbbed4471ca15ce26933c289918b7b9ce4ec69e5c39358abc28374222` matched job provenance. Use reviewed draft switched to ordinary registration without automatic publication. Explicit local registration created **Browser GitHub Receipt Knowledge**:

- Collection: `0xfb9ef6100907a9edf0405c19b2a81d07ea55e7e80f4e9c3b77c14f1782280087`.
- Confirmed transaction: `0xf7f923ba164cb7f29fcef659548ccbc0550a9f239d0cbbd9a4a7fdcf7d88f571`.
- Price: `1000000000000000` wei (0.001 MON).
- Confirmed content hash: `0x468a14d535157bbe18fae43a50873912da8db24aad656efba0bc322ed1b616d0`, independently matching the download's keccak256.

Buyer wallet switch immediately cleared private preview; its own job list was empty. Owner sign-in recovered its draft. Own account export contained job metadata without source body or tokens. Cancellation removed preview actions/text and retained the confirmed collection. Original collection hash and historical public settled receipt remained unchanged.

Actual 390px viewport had client/scroll width 386 and import control bounds 47.6 to 350, without overflowing controls. Provenance wrapped. Captures are in Downloads: `DataVault-SaaS-GitHub-Imports.png` and `DataVault-SaaS-GitHub-Imports-Mobile.png`.

After fix `0ebc779`, a fresh browser session submitting `../receipt-format.md` received actual Worker 400 and displayed: "Check owner/repository, branch or commit, and 1 to 10 distinct relative Markdown or TXT paths. Avoid ../ and absolute paths." No new recovery-list job appeared. A failed full-page screenshot capture did not affect this visible acceptance result.

## Covering checks

Feature full Worker suite: 253 passed, one opt-in live-provider test skipped, 28 files. Full frontend suite: 38 passed. Both typechecks and production build passed. Runtime/preview/lease fixes passed 22 Worker tests plus one skipped live test and four frontend tests. Final guidance change passed 12 affected frontend/client/workspace regressions, typecheck and build. Scoped independent review approved both fix rounds with no open blocker. Existing bundle warning remains for release optimization.

Hosted follow-up: PR #61 remains a draft, stacked on PR #60. All eight checks passed at exact head `87333d1ef2e319c25e6ee5894f2fb9a162d3ece8`. CI run `37966231769` Worker job `113941158329` passed 255 tests with one opt-in live test skipped across 28 files. Frontend job `113941158700` passed 41 tests and production build after clean Linux installation.

Private connections, remaining adapters, final cross-feature acceptance and live deployment remain separate tasks. No PR was merged.
Additional populated-D1 check during connector work: the durable job table still contained exactly one job, status cancelled, after the negative-path browser attempt. Validation did not admit a new job.
