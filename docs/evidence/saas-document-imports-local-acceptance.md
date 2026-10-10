# Reviewed document imports local acceptance

Task 7D implementation is independently reviewed at `8b96451`. Actual browser uploads, exact-head hosted CI and hosted resource acceptance remain pending. This is not a readiness claim.

## Gates

- [x] Maintained pinned parsers, license inventory, Node 22 test/build compatibility and production dependency audit are verified.
- [ ] PDF selectable text and DOCX text are extracted locally with bounded work, no remote conversion and accurate unsupported-format guidance.
- [x] Input, actual decompression, output and timeout limits are enforced; malicious or malformed fixtures fail safely in the recorded tests.
- [x] Cancellation, unmount and wallet changes terminate or fence parsing and clear private previews in the recorded tests.
- [ ] Reviewed text enters ordinary registration or revision without automatic wallet signing, payment or publication.
- [x] Worker accepts bounded text only, rejects invalid UTF8 and raw document bytes before storage, and preserves the exact signed content hash in the recorded tests.
- [ ] Actual browser uploads, editable preview, error/retry and mobile controls pass against known fixtures.
- [ ] Existing collection versions and historical paid answer recovery remain intact.
- [ ] Covering tests, independent review and exact-head hosted CI pass.

## Runtime decision

The selected PDF.js dependency requires frontend Node 22.13 or later. Frontend build and test jobs will use Node 22; contract and Worker jobs retain their existing runtime unless verified compatibility requires a separate change. Parser loading belongs in the extraction worker so it does not enlarge the initial dashboard bundle. Current [Mozilla release notes](https://github.com/mozilla/pdf.js/releases/tag/v6.4.299) and the published package metadata informed this decision. Browser compatibility and extraction behavior still require validation.

## Controller observations, pending acceptance

On frozen source, the retained Vite server returned main/App modules successfully but optimized React dependency requests returned HTTP 504. Restarting only that frontend on its existing port with Node 22 and forced optimization restored the rehearsal dashboard. D1, R2 and the retained Hardhat chain were not reset. Frontend tests had finished before this restart.

Owner publishing showed PDF/DOCX up to 10 MiB, Markdown/TXT up to 2 MiB, selectable-text/coverage guidance, an unchecked disclosure and disabled Register Collection. The documented browser file chooser reached the input, but setting `selectable.pdf` failed because Chrome's ChatGPT extension has Allow access to file URLs disabled. No document transfer or extraction occurred. The controller supplied the extension's documented instructions to the user and did not enable broader filesystem access automatically. Actual PDF/DOCX upload, preview and publication checks remain pending.

At a 390-pixel viewport, client and scroll widths were both 386 pixels. Source controls spanned 39.6 to 346.0 pixels, Knowledge document spanned 60.4 to 325.2, and price/registration controls spanned 34.8 to 350.8. These controls fit; this does not establish preview layout or extraction acceptance. `DataVault-SaaS-Document-Controls-Mobile.png` is in Downloads, and the viewport was reset.

A read-only historical receipt check still returned HTTP 200 and `settled`, source hash `0xe9e69e523c5418551d979b111b535855dc2ad9c9b080a5446d610bee8addd9d2` and answer digest `sha256:91dfde748be52668c2fea08d0e895924b2a66a5d8e06a3ad151b696e3d20ef8d`. Final reviewed-candidate recovery remains a separate check.

## Implementation verification and review

Feature `1318a69` pins PDF.js 6.4.299 (Apache-2.0), fflate 0.8.3 (MIT) and saxes 6.0.0 (ISC). The implementer recorded 45/45 focused Worker tests, 55/55 serial frontend tests before the final DOCX hardening, then 10/10 affected frontend tests and passing Node 22 typecheck/build. Both production dependency audits reported zero vulnerabilities. A local isolated workerd/R2 test handled 2,097,152 bytes, with 334 ms ingestion and 241 ms retrieval wall time, four selected passages and no provider traffic. These are not hosted CPU or peak-memory measurements.

The original full Windows Worker run was interrupted during a long suspension. It exited one, with 391 passing tests, five timeouts, one optional skip and 12 RPC errors over 36,405 seconds. It is not passing full-suite evidence. One follow-up of the two affected existing files passed 32 tests with one optional skip, clearing those five cases without changing their source or timeouts. Fresh exact-head Linux CI remains required.

Independent review found an Important real-worker PDF startup defect. The imported PDF.js core posts an internal ready message; the client mistakenly treated it as a terminal result and terminated extraction. Fix `8b96451` gives application requests/results a validated tagged protocol and ignores unrelated dependency messages. A new test browser-bundles the real worker entry and dependencies, runs them in an isolated Node 22 worker with browser globals, and forwards messages through the real client. It reproduced the defect before the fix and then extracted the exact expected PDF/DOCX text, verified four denied network APIs and forbade nested worker construction. Final affected tests passed 11/11, with passing Node 22 typecheck/build. This shim is integration evidence, not actual browser/CSP acceptance. Scoped re-review approved the fix with no new findings and confirmed the corrected coverage claims.
