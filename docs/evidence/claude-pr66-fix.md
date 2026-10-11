# Claude frontend PR repair

PR #66 keeps the contributor's visual polish in the existing local-only `/preview` dashboard. Production retains `master`'s real marketplace, owner, buyer, registration recovery and answer provenance flows. It does not replace the separate SaaS implementation in PRs #52 through #65.

The four merge conflicts were resolved by retaining the current production components and release-manifest plugin. The faulty drop zone was removed in favor of the existing native file picker. The Pages fallback was removed: frontend assets and `/api` remain packaged with the Cloudflare Worker on one origin. Sample earnings are labeled as a preview. Reduced-motion preferences disable the added utility animations.

Production groups React and viem into vendor chunks. These are static dependency chunks, not lazy routes. The sample dashboard and charts are excluded from the production build. A build regression test checks the generated assets, release identity, headers and exclusion of sample key/notification code. It failed on the Pages fallback before the fix and passed after removal.

Local checks used Node 22: frontend typecheck/build, three frontend tests, Worker typecheck and 139 Worker tests, and 21 contract tests passed. Frontend and Worker production dependency audits reported zero vulnerabilities. The existing CI remains the final check of the pushed commit.

This is a source integration candidate, not evidence of a deployed SaaS or live testnet acceptance. Public resources, provider credentials and the live checks in `docs/deployment.md` remain required. No deployment or merge into master is performed by this repair.
