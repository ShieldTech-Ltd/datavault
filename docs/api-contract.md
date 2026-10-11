# DataVault API contract

The production API and frontend share one Cloudflare Worker origin. Source content, questions, and answers stay off-chain. Selected source passages are sent to the configured model provider. `shared/api.ts` defines the buyer-facing result types and execution signature text.

## Authentication

- `GET /api/demo` and `POST /api/queries/prepare` are public metadata endpoints.
- `POST /api/collections` requires a wallet signature over chain, contract, owner, content hash, price, and timestamp before staging the document and transaction calldata. It proves wallet control, not legal content ownership.
- `POST /api/collections/:id/confirm` accepts `txHash` and `ownerAddress` only after a successful `CollectionRegistered` transaction from that owner is confirmed on the configured contract.
- `POST /api/collections/:id/upload` returns 410. Content replacement is unavailable until it can advance on-chain policy version.
- `POST /api/queries/execute` requires a confirmed matching `QueryOpened` receipt and a current signature by the on-chain escrow buyer.
- `POST /api/queries/:id/reconcile` and `GET /api/queries/:id/answer` require a current buyer signature.
- `GET /api/queries/:id/receipt` is public and excludes answer text and source passages.
- `GET /api/buyer/queries` requires a current signature from the buyer wallet before listing that wallet's recorded request metadata.

The payment and activity signatures above use EIP-191 personal signing. Send `x-signature` and `x-timestamp` headers. The timestamp is Unix milliseconds within five minutes of server time. CORS is a browser control, not authorization.

## Public demo and quote

`GET /api/collections?limit=12&offset=0&search=guide` returns at most 24 confirmed collection records per page. Search is a case-insensitive collection-name substring with a 64-character limit; SQL wildcard characters are treated literally. Rows are scoped to the configured chain and contract, then checked against current Monad owner and policy and includes name, owner, exact price, policy version, active status, recorded paid-query count, and whether the configured service can accept a new query. It never returns document text. An unavailable RPC produces 503, not an empty catalogue. `GET /api/collections/:id` returns one verified collection. The catalogue endpoints have a per-IP request quota.

`GET /api/marketplace/analytics` returns settlements completed in the last 30 days for the configured chain and contract, confirmed collection count, exact known revenue in wei, coverage of historical amount data, top earning collections when ranking is complete, and recent settlement metadata. Older query rows have null amounts, so revenue can be unavailable or a lower bound. The endpoint returns 503 when the configured contract or RPC chain is unavailable; it does not display local D1 records as current marketplace activity. No question, answer, or private passage is exposed. `GET /api/owner/analytics?address=0x...` requires a current signature over `datavault-owner-summary:<chainId>:<lowercase contract>:<lowercase owner>:<timestamp>` and limits the same data to collections registered by that owner.

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
