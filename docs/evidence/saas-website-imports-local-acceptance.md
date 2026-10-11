# Approved website imports local acceptance

Task 7B is independently reviewed and locally accepted at `4e2d27d`. Exact-head hosted checks remain pending. This is implementation evidence, not a public deployment claim.

## Verified behavior

- Populated migration `0021_shared_import_jobs.sql` applied successfully with three commands and no reset. Existing GitHub identifiers, source digests and confirmed collections remained intact.
- Empty operator configuration showed an unavailable state with disabled URL, permission and import controls. The local fixture alone used `WEBSITE_IMPORT_HOSTS=raw.githubusercontent.com`.
- Actual workerd imported the selected public MIT repository fixture at `https://raw.githubusercontent.com/ShieldTech-Ltd/datavault/04d78aa369661e0f766928c0188f87d4739254ee/docs/receipt-format.md`. Job `f580e9f5a1f566a5ababf87cacba517648960f99465be18a80dbde180426395e` reached `review_ready` on attempt one, fetched at `2026-10-09T18:39:30.566Z`.
- Private provenance recorded source SHA-256 `694d4c8cbbed4471ca15ce26933c289918b7b9ce4ec69e5c39358abc28374222`. Downloaded normalized Markdown was 985 bytes with SHA-256 `6b78ddd6a0f8e7456cd847df845e37d8eb740691ef4f15aa77c4fb04a0440d51`, matching the persisted draft digest. Preview displayed selectable text.
- Reviewed staging filled the ordinary Text registration form as `Browser Website Receipt Knowledge`. Disclosure remained unchecked and registration disabled. This task performed no new publication transaction.
- Switching to Buyer immediately cleared private state. Buyer sign-in showed an empty own import list. Returning to Owner and signing in restored the durable draft and preview after navigation.
- Owner account export `datavault-account (8).json` was 3,361 bytes, included website job metadata, and omitted source text, answers and credential/state fields.
- At a 390-pixel viewport, document client and scroll widths were both 386 pixels. Website fields were within 47.6 to 338 pixels; actions and registration controls remained within the viewport. Desktop and mobile screenshots are saved in Downloads as `DataVault-SaaS-Website-Imports.png` and `DataVault-SaaS-Website-Imports-Mobile.png`.
- Cancelling the disposable draft removed preview and persisted `cancelled`. The earlier GitHub job stayed cancelled, its published collection stayed confirmed with unchanged content hash, and the historical paid receipt remained settled with unchanged content hash and answer digest.

## Verification and review

The frozen feature Worker suite passed 339 tests with one optional live GitHub test skipped across 31 files, using the established bounded Windows command. Frontend serial tests passed 47/47; focused concurrent GitHub-auth and website tests passed 6/6. Typechecks and frontend build passed. The default concurrent all-file frontend run stalled and was stopped; it is not reported as passing. Older SSR cache isolation remains a final release task.

Independent review found that awaited provenance hashing could finish after the page deadline. Fix `4e2d27d` added abort and elapsed-time checks after hashing. Two controlled regressions verified RED/GREEN, all five focused provider tests passed, typecheck and actual workerd smoke passed, and scoped review approved both findings. Actual Worker production dependency audit exited zero with zero vulnerabilities, including locked parse5 8.0.1 and entities 8.1.0.

Tests cover global cross-provider atomic admission, migration compatibility, selected-only extraction, hostile URLs and HTML, private/mixed/changed DNS, bounded CNAMEs, redirects, streamed/aggregate resource limits, timeouts, cancellation, expiry, credential versions and account isolation. Deterministic workerd smoke uses intercepted network responses; the browser fixture above supplies separate actual public fetch evidence.

## Remaining release boundaries

Exact approved hosts and trustworthy DNS are required. DNS checks do not pin the subsequent HTTPS connection, so this is not complete DNS-rebinding resistance for arbitrary hosts. Normalized Unicode URL expansion beyond the raw 2,048-character limit remains a minor final-review item. Drafts expire logically after 24 hours; physical cleanup is bounded and opportunistic until scheduled/operator maintenance is configured. Real public resources, logging/privacy controls, provider setup, final cross-feature browser acceptance and deployment checks remain open.
