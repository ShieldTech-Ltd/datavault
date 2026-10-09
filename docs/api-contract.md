# DataVault API contract

The production API and frontend share one Cloudflare Worker origin. Source content, questions, and answers stay off-chain. Selected source passages are sent to the configured model provider. `shared/api.ts` defines the buyer-facing result types and execution signature text.

## Authentication

Developer metadata keys use the separate account session protocol for management. They cannot replace wallet signatures for paid actions, escrow, receipts recovery, owner analytics, admin actions, session creation or key management.

## Scoped developer metadata keys

`POST /api/account/api-keys` requires an authenticated deployment account session, a trusted same origin, and `x-csrf-token`. Its strict JSON body is `{ "name": "Integration", "collectionIds": ["0x..."], "expiresInDays": 30, "scopes": ["collections:read"] }`. Names contain 1 to 80 trimmed characters. Expiry is an integer from 1 to 90 days. Select 1 to 24 unique confirmed collection IDs owned by the account in this deployment. Creation verifies live chain ownership, returns 403 for failed ownership and 503 when chain verification is unavailable. Unknown fields, duplicate scopes/IDs and unsupported scopes return 400. An atomic database guard permits at most five unexpired, unrevoked keys per account, returning 409 at the limit.

The 201 response contains `{ "key": { "id", "name", "displayPrefix", "scopes", "collectionIds", "createdAt", "expiresAt", "revokedAt", "status" }, "secret": "dv_..." }`. The secret contains 256 random bits and is returned only on creation. Only its SHA256 digest and nonsecret display prefix persist. Key IDs are independently random. `GET /api/account/api-keys` requires the session and returns at most 100 key descriptions with current active/expired/revoked status and collection names, active keys first, without any raw secret or digest. `DELETE /api/account/api-keys/:id` requires the same session/origin/CSRF and an empty JSON object. It permanently revokes only that account's key. Revocation takes effect on the next request; an in-flight request may already have claimed authorization. Creation and revocation produce transactional audit rows containing only key ID, account ID, action and timestamp.

`GET /api/developer/collections` accepts exactly one `Authorization: Bearer dv_<64 lowercase hex characters>` header over HTTPS (local HTTP only on the explicit local deployment). Query parameters, including credentials and collection filters, are rejected. The result `{ "collections": [{ "collectionId", "name", "description", "category", "visibility" }] }` contains only metadata for the explicitly allowed IDs, including owned unlisted collections. It never returns source text, content digests, answers, personal account details or session data. Every request checks deployment, expiry, revocation, exact scope and current ownership for every allowed collection. Invalid credentials return 401; lost ownership or scope returns 403; unavailable chain verification returns 503. Workspace-bound keys currently fail closed, reserved for the membership authorization phase. Account sign-out does not revoke developer keys. The existing public catalogue remains public.

The persistent atomic fixed-minute quota is 60 claimed requests per key by default. `DEVELOPER_RATE_LIMIT` accepts integer strings from 10 to 1000; invalid configuration uses 60. Quota claims include ownership/provider failures to bound repeated chain checks. Requests exceeding the quota return 429 with `Retry-After` seconds to the next UTC minute and increment a separate rejected counter. Successful metadata responses increment accepted counters; ownership-denied and chain-unavailable responses have distinct counters. `GET /api/account/api-keys/usage` requires the account session and returns timestamped daily (up to 150 rows) and minute (up to 120 rows) aggregates, newest first, scoped to that account, with `asOf`, `retentionDays: 30` and explicit list bounds. Minute rows additionally include `claimed`. Records older than 30 days are opportunistically deleted on usage reads and developer calls.

Counter semantics: claiming quota is one atomic SQL statement; each outcome updates its daily and minute counter in one database transaction. If a process fails after a claim but before recording the outcome, the claim remains and no accepted/outcome count is invented. If it fails after recording but before the client receives the response, the recorded outcome remains. Retries are separate calls, not idempotent usage updates. No API secret or Authorization header is written to audit rows or usage counters. The browser displays the secret once, offers user initiated copy, and clears it on navigation, wallet change and sign-out. A delayed creation after a wallet switch discards the secret and attempts revocation using the original session CSRF, which can fail if that session has already ended; the original account should inspect and revoke any stranded key when it signs in again.

## Wallet authorization

- `GET /api/demo` and `POST /api/queries/prepare` are public metadata endpoints.
- `POST /api/collections` requires a wallet signature over chain, contract, owner, content hash, price, and timestamp before staging the document and transaction calldata. It proves wallet control, not legal content ownership.
- `POST /api/collections/:id/confirm` accepts `txHash` and `ownerAddress` only after a successful `CollectionRegistered` transaction from that owner is confirmed on the configured contract.
- `POST /api/collections/:id/upload` returns 410. Content replacement stays disabled. Changed content requires a separate signed upload, paid on-chain registration and confirmed immutable revision link.
- `POST /api/queries/execute` requires a confirmed matching `QueryOpened` receipt and a current signature by the on-chain escrow buyer.
- `POST /api/queries/:id/reconcile` and `GET /api/queries/:id/answer` require a current buyer signature.
- `GET /api/queries/:id/receipt` is public and excludes answer text and source passages.
- `GET /api/buyer/queries` requires a current signature from the buyer wallet before listing that wallet's recorded request metadata.

The payment and activity signatures above use EIP-191 personal signing. Send `x-signature` and `x-timestamp` headers. The timestamp is Unix milliseconds within five minutes of server time. CORS is a browser control, not authorization.

## Public demo and quote

`GET /api/collections?limit=12&offset=0&search=guide` returns at most 24 confirmed collection records per page. Search is a case-insensitive collection-name substring with a 64-character limit; SQL wildcard characters are treated literally. Rows are scoped to the configured chain and contract, then checked against current Monad owner and policy and includes name, owner, exact price, policy version, active status, recorded paid-query count, and whether the configured service can accept a new query. It never returns document text. An unavailable RPC produces 503, not an empty catalogue. `GET /api/collections/:id` returns one verified collection. The catalogue endpoints have a per-IP request quota.

`GET /api/marketplace/analytics` accepts optional `start=YYYY-MM-DD&end=YYYY-MM-DD` UTC calendar dates. Supply both or neither. End is exclusive, the range is 1 to 90 days, and the latest end is tomorrow at UTC midnight. Omitted dates select 30 UTC days including today. `windowStart`, `windowEnd` and `periodDays` state the exact window. Impossible, duplicate, reversed, incomplete or future date parameters return 400. Public scope includes only confirmed public collections in the configured deployment. Owner scope includes the signed owner's unlisted collections.

The existing `paidQueries` and `recordedRevenueWei` fields retain their meaning. Revenue uses exact integer wei strings. Missing historical amounts are disclosed through `revenueCoverage` and disable complete rankings. `daily` includes every UTC date, including zero activity, with `settledQueries`, `failedQueries`, `refundedQueries`, `knownAmounts` and `recordedRevenueWei`. Settlements use `settled_at`; failures and refunds use request `created_at`, stated by `failureTimeField`. Rankings, recent settlements and daily totals use the same window. `confirmedCollections` is the currently confirmed collection inventory, independent of the selected activity window. The UI labels it Current confirmed collections and identifies current public or owned inventory. Historical ranking labels show exact selected UTC start/end dates, with the end excluded. Publications in a period would require a separate future metric. No question, answer or private passage is exposed.

Analytics select at most 10,001 relevant records and return 503 with `aggregationLimit: 10000` and `coverageComplete: false` when the exact aggregation bound is exceeded. Choose a smaller window. An unavailable deployment or RPC chain also returns 503. `GET /api/owner/analytics?address=0x...&start=...&end=...` requires the existing signature over `datavault-owner-summary:<chainId>:<lowercase contract>:<lowercase owner>:<timestamp>`. `GET /api/owner/analytics/export` uses that same authorization, owner scope, date range, stable ordering and aggregation bound. It returns a CSV attachment containing Request ID, Collection ID, Collection name, Settled at UTC, Amount wei and Settlement transaction. Unknown amounts are empty. Fields use RFC4180 quoting and neutralize leading formula characters, including whitespace or control prefixes. Account cookies cannot replace owner signatures.

`GET /api/owner/collections?address=0x...&limit=12&offset=0` uses the same current owner signature as owner analytics. It returns only that owner's confirmed collections after checking each owner and policy on Monad, with current price, active status, paid-query count, and pagination metadata. It does not return private source text.

`GET /api/buyer/queries?address=0x...&limit=20&offset=0` requires `datavault-buyer-history:<chainId>:<lowercase contract>:<lowercase buyer>:<timestamp>`. It returns at most 50 request records per page, scoped to that buyer and the configured chain and contract. It includes collection ID, transaction hashes, amount, outcome, and timestamps, but never question text, answer text, or private passages. A buyer can sync this history on another device and use the separate authenticated answer endpoint to recover a settled answer.

`GET /api/demo` returns the configured sample collection ID, name, owner address, and current on-chain price only when its D1 row is confirmed and on-chain policy is active. Otherwise it returns 404. The sample ID is configured only after actual owner registration.

`POST /api/queries/prepare` accepts `{ "collectionId": "0x...", "question": "..." }` and returns `{ "collectionId", "collectionName", "priceWei", "priceDisplay" }`. It returns 503 if contract, settlement key, or model key is absent or the configured settlement key does not match the collection's on-chain operator. A quote does not reserve a price. `openQuery` enforces the current price and active policy when the buyer signs.

## Execute a paid query

After the buyer's `openQuery` transaction confirms, send:

```json
{
  "requestId": "0x...",
  "collectionId": "0x...",
  "question": "...",
  "openTxHash": "0x..."
}
```

Sign the exact message from `executionMessage` in `shared/api.ts`:

```
datavault-execute:<chainId>:<lowercase contract>:<lowercase requestId>:<lowercase collectionId>:<sha256 question hex>:<lowercase openTxHash>:<timestamp>
```

The Worker verifies signature, escrow buyer, collection, amount, policy version, expiry, the successful opening receipt, and the confirmed source owner's match with the on-chain owner before claiming the request and reading private storage. It retrieves only the content version named by the confirmed D1 hash and checks the fetched bytes before model use. D1 allows one active Worker lease per request ID. A duplicate during that lease does not call the model. If a Worker exits before recording an answer, the original buyer can sign the same request and exact question again after the lease expires. An atomic takeover gives the new Worker a fencing token; writes from the old Worker cannot record a competing answer or settle it.

A confirmed settlement returns `QueryResult` with `outcome: "settled"`, answer text, its SHA-256 digest, versioned cited passage IDs, cited passage text, opening and settlement transaction hashes, and receipt URL. An uncertain broadcast or confirmation returns `outcome: "settlement_pending"` with the opening hash, any known settlement hash, and a receipt URL, without answer text. The caller must reconcile and recover the answer after settlement. Failures leave a still-open escrow eligible for the on-chain timeout refund.

## Reconcile, recover, and receipt

To reconcile, sign `datavault-reconcile:<chainId>:<contractAddress>:<requestId>:<timestamp>` and `POST /api/queries/:id/reconcile` with signature headers. Use the lowercase contract address and request ID. The Worker checks the escrow and matching `QuerySettled` digest event. If its database lost the settlement hash after broadcast, it searches from the opening block and restores the matching hash. If a stored answer was never dispatched for settlement, reconciliation can claim an expired settlement lease, verify the answer and current escrow, and settle without a second model call or payment. To recover a settled answer, sign `datavault-answer:<chainId>:<contractAddress>:<requestId>:<timestamp>` and `GET /api/queries/:id/answer`. Only the escrow buyer can recover it. Recovery checks the answer bytes, stored digest, and settlement event before returning the answer, cited IDs, outcome, and settlement hash. An RPC outage returns 503; a digest mismatch withholds the answer.

The public receipt contains request and collection IDs, buyer address, chain and contract, content hash, policy version, exact escrow amount when recorded, opening and settlement hashes, cited passage IDs, answer digest, outcome, and timestamps. The `QuerySettled` event anchors the SHA-256 answer digest on Monad. The buyer view checks the answer bytes against that digest and the settlement event. Older receipts may have a null amount. This proves the recorded answer matches the settled digest; it does not prove the buyer saw the answer or that the answer is factually correct.

## Limits and errors

Uploads are limited to 512000 document bytes with at most 16 KB of multipart overhead. Other POST and PATCH bodies are limited to 8 KB before parsing. Questions are limited to 500 characters and prices to 10 MON. Registration and execution use an atomic per-IP fixed-window quota. Expected errors include 400 for malformed input, 401 for missing or expired signature, 403 for wrong buyer or paused policy, 404 for absent resources, 409 for transaction or policy mismatch, 413 for oversized requests, 429 for rate limits, and 503 for incomplete deployment configuration.

## Wallet account sessions and settings

Private saved items use account sessions. `GET /api/account/bookmarks` and `GET /api/account/saved-questions` accept `limit` from 1 to 50 (default 20) and a positive integer `cursor`. Responses contain `items` and `nextCursor` in descending stable item ID order. Collections must be confirmed in the account's current deployment; known unlisted IDs are allowed. `POST /api/account/bookmarks` accepts only `{collectionId}` and is idempotent per account and collection. `POST /api/account/saved-questions` accepts only `{collectionId, question, optIn: true}`, requires a nonblank question up to 1,000 characters, and atomically caps each account at 50 active questions. Every saved question expires after 30 days. Expired questions are excluded from reads and exports immediately, with bounded physical cleanup on saved-item requests.

`DELETE /api/account/bookmarks/:id` and `DELETE /api/account/saved-questions/:id` accept only an empty JSON object and idempotently delete that account's item. All mutations require the existing trusted-origin session and CSRF checks. Account JSON export includes own bookmarks and active saved questions alongside canonical email/profile preferences, inbox metadata and pending deletion requests. It excludes paid answers and source content. The UI offers per-save unchecked question opt-in and private list/delete/export actions. Use fills the normal query form and clears the previous quote; it never invokes payment. Use is rejected while quoting, paying, awaiting settlement or recovering a failed request. No saved question is stored in browser localStorage.

Account sessions authorize profile metadata only. They do not authorize owner activity reads, source content, paid execution, answer recovery, settlement, refunds or on-chain ownership. Those routes retain their existing wallet signatures and receipt checks.

| Route | Request | Response |
| --- | --- | --- |
| `POST /api/auth/challenge` | `{address}` | `{message, nonce, expiresAt}` |
| `POST /api/auth/verify` | `{message, signature}` | `{account, csrfToken, expiresAt}` and session cookie |
| `POST /api/auth/logout` | No body, authenticated CSRF header | 204 and cleared session cookie |
| `GET /api/account` | Session cookie | `{account, csrfToken, expiresAt}` |
| `PATCH /api/account` | Partial `{displayName, locale, notificationPreferences}` | `{account}` |
| `GET /api/account/export` | Session cookie | JSON attachment |
| `POST /api/account/deletion-request` | `{}` with CSRF header | `{requestId, status: "pending"}` |

Challenge and verification require an exact same-origin `Origin`. Standard SIWE messages bind the wallet, origin, five-minute expiration, configured chain and `urn:datavault:<chainId>:<lowercase contract>` resource. Verification accepts only the exact issued message, a matching browser challenge cookie and an EOA personal-sign signature. Contract-wallet verification is unsupported. Guarded SQL consumes each nonce once, including concurrent verification requests. Expired nonces and sessions are removed opportunistically when challenges are issued.

The random opaque 256-bit session cookie is `HttpOnly; Secure; SameSite=Lax; Path=/`, expires after 24 hours and has no Domain attribute. D1 stores its SHA-256 digest, not the cookie token. Accounts and sessions are scoped to wallet, chain and contract. Public HTTP is rejected. Non-Secure HTTP cookies and a loopback Vite proxy origin are permitted only on exact `localhost` or `127.0.0.1` deployments configured for local chain 31337. Public `ALLOWED_ORIGINS` entries do not permit cross-origin cookie account mutations; credentialed cross-origin CORS is not enabled.

Every authenticated mutation requires the exact session `x-csrf-token` and a trusted origin. Logout requires origin even when the session has expired; a valid active session additionally requires its CSRF token. All API responses use `Cache-Control: no-store`. Auth operations have a per-IP quota of 10 per minute and account mutations 20 per minute. POST and PATCH JSON bodies are bounded to 8 KB before parsing.

`account` contains lowercase `address`, `displayName` (at most 80 characters, no control characters), `locale` (currently `en-GB`), `notificationPreferences: {inApp, email}`, and millisecond `createdAt`/`updatedAt`. Unknown fields, address edits and unsupported locales are rejected. In-app preferences default true but no notification inbox is implemented yet. Email defaults false and cannot be enabled until verified-email support exists. CSRF tokens are response metadata and are excluded from profile exports.

The export includes only the current deployment's own profile, notification preferences and pending deletion requests. It excludes cookie tokens, keys, source content, questions, paid answers, other wallets and immutable on-chain records. A deletion request is idempotent while pending. It is stored for later processing, does not delete anything and makes no completed-deletion promise. Private source/paid-answer retention and destructive processing must be defined in a separate phase; on-chain records are immutable.

The Settings page restores a matching session without prompting the wallet. Sign-in prompts only after the user clicks the button. Wallet/network changes hide the old profile immediately, fence delayed responses and revoke the previous session where possible. Session tokens remain in HttpOnly cookies and are never saved to browser storage. Sign-out errors are visible and can be retried.

## Collection settings

`PATCH /api/collections/:id/metadata` requires a signed-in account session, same-origin request and `x-csrf-token`. The account must match both the confirmed deployment-scoped collection owner and the current owner read from the configured chain. Missing collections return 404, owner failures return 403, and unavailable chain verification returns 503.

The JSON object accepts only `description` (string, maximum 2,000 characters), `category` (`General`, `Technology`, `Business`, `Research`, `Education`, `Finance`, `Legal`, `Other`) and `visibility` (`public` or `unlisted`). At least one property is required. Omitted properties preserve saved values. Collections without a metadata row default to an empty description, General category and public visibility.

Unlisted collections remain accessible and queryable by ID. This setting excludes their identifiers, names and settlements from public catalogue search and public marketplace analytics. Signed owner collection and analytics endpoints include the owner's unlisted records. Public analytics report `scope: "public"` and count public collections only. Visibility is catalogue discoverability, not content access authorization.

Query price changes use the existing on-chain `updatePolicy(collectionId, newPrice, currentActive)` transaction. The owner UI accepts exact MON decimals up to 18 places, greater than zero and at most 10 MON. It displays the saved policy only after a successful receipt and chain readback. Price and pause changes advance the policy version and may invalidate outstanding quotes and requests under the current policy rules. Metadata changes require no payment transaction.


## Immutable collection revisions

Changed content uses the existing signed registration and receipt-confirmation flow. Its hash-derived collection ID and private R2 version key are new. Confirmed old hashes, bytes, paid requests and settled-answer recovery remain associated with their original IDs. Revision linking does not update an old on-chain policy, transfer ownership, undo registration or pause any version.

`POST /api/collections/:id/revisions` accepts exactly `{ "collectionId": "0x..." }`, naming a distinct separately confirmed new collection. It requires the deployment's account session, trusted origin and exact `x-csrf-token`. Both database records must be confirmed in this deployment and belong to the account. Both live owners must match the account after RPC chain verification. Missing/staged/cross-deployment records return 404, invalid bodies 400, owner/CSRF/origin failures 403, missing sessions 401 and unavailable RPC 503. Revision mutations share the account quota (20 per IP per minute).

A collection belongs to at most one deployment-scoped family. The family records its original ID, owner, current ID and increasing ordinal. One atomic D1 batch statement and SQLite triggers initialize the family/root, validate the expected current parent, insert the new link and advance current together. Unique membership, ordinal and parent constraints prevent forks. A stale parent or already-linked candidate returns 409. An identical parent/candidate retry returns the existing history without advancing the family again, including after a concurrent identical winner. Trigger failure rolls back initialization; a zero-row guard cannot leave an orphan family.

`GET /api/collections/:id/revisions?limit=50&cursor=0` returns `versions` (ID, name, ordinal, registration transaction), `nextCursor` (last returned ordinal when another visible page exists, otherwise null), and visible `originalCollectionId`/`currentCollectionId`. Limits are 1 to 50 and cursors are nonnegative ordinals. History is ordered by stable increasing ordinal and includes only confirmed deployment records. A collection outside any family has version 1. No content, question, answer or buyer activity appears in this response.

Public history excludes an unlisted member's ID/name unless that exact member is independently requested by its known ID. A matching owner account session can read the complete own history. Hidden original/current IDs are omitted; a hidden current target is represented by `newerUnlistedRevision: true`. The public collection-detail response exposes `currentCollectionId` only when the target is public, otherwise only `newerUnlistedRevision`. Direct known unlisted URLs remain accessible. This is discoverability control, not a private ACL.

The manage UI's Publish new revision flow reuses normal registration, including content, name, exact query price and sharing disclosure. The new publication starts public even when the original is unlisted. It links only after Worker registration confirmation. If linking fails, the published collection remains registered: both IDs remain visible with a link retry, and a manually supplied confirmed ID can be linked after refresh. There is no rollback promise. Old policy controls remain explicit; voluntarily pausing or changing the old policy may affect outstanding quotes and requests. Wallet and network re-reads fence prompts, confirmation and link operations; switched account history is hidden while fresh history loads.

## Wallet workspaces

Workspace operations use the deployment-bound account session. Mutations require trusted same-origin JSON and `x-csrf-token`. POST/PATCH/DELETE under `/api/workspaces/` join the account mutation quota (20 per IP per minute). Guessing a workspace ID grants no access.

| Endpoint | Access and behavior |
| --- | --- |
| GET /api/account/workspaces | Own active memberships only, maximum 100 records |
| POST /api/account/workspaces | `{name}` creates workspace and creator Owner atomically. Trimmed name 1 to 80 characters, maximum 5 owned workspaces per wallet and deployment |
| GET /api/account/invitations | Own wallet pending unexpired invitations in current deployment, maximum 100 records |
| GET /api/workspaces/:id | Current member gets workspace name and own role |
| PATCH /api/workspaces/:id | Owner changes `{name}` |
| GET /api/workspaces/:id/members | Current member reads wallet/role/joined time, no account profiles |
| POST /api/workspaces/:id/invitations | Owner creates `{address,role}`, valid wallet and Owner/Editor/Viewer. Seven-day expiry, one pending invite per wallet. No message sent |
| GET /api/workspaces/:id/invitations | Owner reads pending current invitations |
| DELETE /api/workspaces/:id/invitations/:inviteId | Owner revokes, empty JSON object |
| POST /api/workspaces/:id/invitations/:inviteId/accept | Invited wallet accepts, empty JSON object. Atomic single use and expiry/revocation guard. Retry cannot change the current membership role |
| PATCH /api/workspaces/:id/members/:wallet | Owner changes `{role}` |
| DELETE /api/workspaces/:id/members/:wallet | Owner removes membership, empty JSON object |
| POST /api/workspaces/:id/leave | Leave own membership, empty JSON object |

SQLite enforces a remaining Owner, including concurrent demotion/removal attempts. Conflicts return 409. Maximum 50 members and 50 pending invitations. Members/invitations/shared collections accept `limit` (1 to 50, default 20) and `cursor`, returning `nextCursor`. Audit rows contain actor wallet, action, target identifier and time, without credentials, source content or questions.

## Explicit shared metadata

`POST /api/workspaces/:id/collections` with `{collectionId}` requires the current account to be both workspace Owner and actual live on-chain owner of a confirmed collection in this deployment. It records that wallet as grantor. `DELETE /api/workspaces/:id/collections/:collectionId` with an empty JSON object allows Owner or grantor removal. `GET /api/workspaces/:id/collections` checks current membership, current grantor Owner membership, confirmed deployment record and live grantor ownership. Invalid grants are omitted. Unavailable chain verification returns 503 and no shared metadata. Fields are collection ID/name/description/category/visibility. No raw sources, R2 references, paid questions or buyer answers are returned.

`PATCH /api/collections/:collectionId/metadata?workspaceId=:id` accepts existing description/category/visibility fields with account session and CSRF. A current Owner or Editor needs a valid grant from a current workspace Owner who still owns the collection on chain. Viewer is denied. Membership and grant authority are repeated in the write statement after chain verification. Without `workspaceId`, individual wallet ownership remains required. Team access grants no price, pause, publication, payout, on-chain signature or paid-query authority. Public catalogue and analytics do not incorporate workspace grants. Unlisted shared metadata appears in the authorized workspace feed only.

Developer key creation optionally accepts `workspaceId`. Issuer must currently be workspace Owner and every allowed collection ID must have a valid live grant. Every call checks issuer's current Owner membership, active workspace, exact allowed IDs, scope and live grant ownership. Demotion/removal atomically revokes issuer workspace keys and invalidates their grants. Workspace key list/usage remains issuer-private and is unavailable after issuer loses Owner membership. Personal keys retain existing ownership rules. Secret is shown once. Invitations provide no credentials.

Account export includes only the requesting wallet's memberships and pending invitations, alongside existing account metadata. It includes no other account profiles or key secrets. Deletion requests remain pending; the last Owner must appoint another Owner before leaving.
