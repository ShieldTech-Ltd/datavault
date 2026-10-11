# Selected approved website imports

The account dashboard can import one to five explicitly selected public pages into a private review draft. No crawl, login, script execution, automatic registration or payment occurs. The owner must confirm permission before fetching and review the resulting text before using the existing signed collection registration flow. A failed registration leaves the draft recoverable for its remaining lifetime.

## Operator setup

Apply migration `0021_shared_import_jobs.sql` after the existing migrations, without resetting D1. Configure `WEBSITE_IMPORT_HOSTS` with a comma-separated list of exact lowercase public hostnames, for example `docs.example.com,www.example.com`. There are no wildcards or user-editable overrides. An absent, empty or invalid list disables new website imports. Approve only domains whose operator and DNS behavior you trust and whose content you are authorized to import. Localhost and chain ID 31337 do not bypass the production policy.

The requester supplies final HTTPS URLs without user information, query strings, fragments, explicit ports or IP literals. Hostnames must exactly match the configured list. Redirects are always rejected, including same-host redirects. Use the final page URL instead. Supported responses are UTF-8 or ASCII `text/plain` and `text/html`. PDF, authenticated pages, JavaScript-rendered content and other encodings are unavailable.

## API and privacy

All routes use the current deployment's account session. Mutations also require the existing Origin and CSRF checks.

| Route | Result |
| --- | --- |
| `GET /api/account/imports/website` | Latest 100 owner jobs, `available`, `approvedHosts` and bounded inline dispatch mode |
| `POST /api/account/imports/website` | `{ "urls": ["https://approved.example/page"], "permissionAccepted": true }` |
| `GET /api/account/imports/website/:id` | Owner-only job metadata |
| `GET /api/account/imports/website/:id/draft` | Owner-only `text/plain`, no-store private source preview |
| `GET /api/account/imports/website/:id/draft?download=1` | Private source download |
| `POST /api/account/imports/website/:id/run` | Empty JSON object, retry or resume within the existing attempt limit |
| `POST /api/account/imports/website/:id/cancel` | Empty JSON object, cancel and invalidate the private draft |

Website metadata includes selected URLs and successful fetch provenance: URL, UTC fetch time and SHA-256 of the decoded source text. The draft content digest identifies the assembled extracted text. Provenance is private D1 metadata. Account export includes job metadata, never draft contents. Remote HTML is parsed with parse5 and presented only as escaped textarea text. Scripts, styles, navigation, forms and selected hidden elements are excluded; linked resources are never fetched. Extraction is deliberately conservative and is not a visual rendering of the page.

## Shared durable state

Both providers use `import-jobs.ts` and the existing `github_import_jobs` table. The historical table name is retained to preserve existing rows, connector cancellation queries and R2 draft keys. Migration 0021 adds `provider` (default `github`) and `provenance`. It does not copy state into a second provider table. Existing GitHub API routes and exports remain available.

Admission is one atomic SQLite `INSERT ... SELECT` over the common table, with the existing unique inflight index. The account limit is one queued/running import and 20 new jobs per rolling 24 hours across GitHub and website together. Retries, lease ownership, cancellation, expiry cleanup and draft finalization use the same runner. Jobs allow three attempts, a two-minute lease and a 24-hour draft lifetime. The first version dispatches inline and supports explicit resume after interruption; it does not introduce a separate queue.

Private GitHub imports retain connection and credential-version fences. A refreshed credential version changes private selection idempotency, allowing a fresh import of the same selection while the old draft remains unavailable. Old jobs are never rebound to new credentials. Existing public GitHub selection keys and private R2 paths are unchanged.

## Network bounds and limitations

Each page has a ten-second deadline including DNS and streamed body reads. Selected response bodies share a 2,000,000-byte budget and extracted text shares a 500,000-byte UTF-8 budget. Declared lengths and actual streams are bounded independently. DNS JSON responses have a separate 32,768-byte bound.

The provider uses only `https://cloudflare-dns.com/dns-query` for A and AAAA checks. It rejects failed/truncated DNS responses, private and reserved answers, mixed public/private answers, malformed addresses, loops and more than five CNAME links. Two checked DNS snapshots must agree. Every DNS and page fetch uses `redirect: 'manual'`; all 3xx responses fail before body consumption or following. No user authorization or cookies are forwarded.

DNS validation followed by HTTPS fetching does not pin the connection to the inspected address. The operator allowlist is an essential additional trust boundary. This feature does not claim arbitrary-host SSRF safety or full resistance to DNS rebinding. Dynamic DNS changes can produce conservative failures. Removing a host prevents future fetching and retries; existing owner drafts remain readable until cancellation or expiry.

Sources checked during implementation: [parse5](https://parse5.js.org/), [Cloudflare DoH JSON](https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/make-api-requests/dns-json/), [IANA IPv4 special-purpose registry](https://www.iana.org/assignments/iana-ipv4-special-registry/), [IANA IPv6 special-purpose registry](https://www.iana.org/assignments/iana-ipv6-special-registry/).
