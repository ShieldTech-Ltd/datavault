# DataVault API Contract

## Base URL

Production: served from the same Cloudflare Worker that hosts the frontend.
Local dev: `http://localhost:8787`

## Authentication and authorization

| Endpoint | Auth mechanism |
|---|---|
| `POST /api/collections` | Owner wallet address in form field; no server-side session required at registration |
| `POST /api/collections/:id/upload` | ECDSA signature over `datavault-upload:<collectionId>:<sha256(body)>:<timestamp>` |
| `POST /api/queries/prepare` | None (public price lookup) |
| `POST /api/queries/execute` | On-chain escrow verified by the Worker before any retrieval or model call |
| `GET /api/queries/:id/receipt` | Public (receipts are intentionally visible for auditability) |

## CORS

The `ALLOWED_ORIGINS` environment variable accepts a comma-separated list of permitted request origins (e.g. `https://datavault.example.com`). Localhost origins are always permitted for development. Unknown origins receive `Access-Control-Allow-Origin: null`, causing browsers to reject credentialed requests.

## Request limits

| Limit | Value |
|---|---|
| Max upload / body size | 500 KB |
| Max question length | 500 characters |
| Max price | 10 MON (10^19 wei) |
| Rate limit: execute | 10 requests per 60 seconds per IP |
| Rate limit: register | 5 requests per 60 seconds per IP |
| Rate limit: all other API routes | 30 requests per 60 seconds per IP |

## Endpoints

### POST /api/collections

Register a new knowledge collection.

**Request:** `multipart/form-data`

| Field | Type | Validation |
|---|---|---|
| `file` | File | Required, `.md` or `.txt`, max 500 KB |
| `priceWei` | string | Positive integer, max 10 MON |
| `ownerAddress` | string | `0x`-prefixed 20-byte hex address |

**Response 200:**
```json
{
  "collectionId": "0x...",
  "contentHash": "0x...",
  "operatorAddress": "0x...",
  "txCalldata": "0x..."
}
```

The `txCalldata` encodes `registerCollection(collectionId, priceWei, operatorAddress)`. The frontend sends this as a transaction to the contract using the owner's wallet. The `operatorAddress` is the Worker's settlement key.

**Errors:** 400 (validation), 409 (already registered), 429 (rate limit)

### POST /api/collections/:id/upload

Replace collection content. The `collectionId` path segment must be a `0x`-prefixed 32-byte hex string.

**Headers:**

| Header | Format | Notes |
|---|---|---|
| `x-signature` | `0x` + 130 hex chars (65-byte ECDSA) | Signs the message below |
| `x-timestamp` | Unix milliseconds | Must be within 5 minutes of server time |

**Signed message:** `datavault-upload:<collectionId>:<sha256hex(body)>:<timestamp>`

**Request body:** Raw text/markdown, max 500 KB

**Errors:** 400 (validation), 401 (missing/expired/malformed auth), 403 (signature mismatch), 404 (collection not found), 413 (body too large)

### POST /api/queries/prepare

Fetch the current price for a collection before opening escrow.

**Request JSON:**

| Field | Type | Validation |
|---|---|---|
| `collectionId` | string | `0x`-prefixed 32-byte hex |

**Response 200:**
```json
{
  "collectionId": "0x...",
  "priceWei": "1000000000000000",
  "priceDisplay": "0.001000",
  "collectionName": "..."
}
```

**Errors:** 400 (validation), 403 (paused), 404 (not found)

### POST /api/queries/execute

Execute a paid query. The Worker verifies the on-chain escrow before any retrieval or model call.

**Request JSON:**

| Field | Type | Validation |
|---|---|---|
| `requestId` | string | `0x`-prefixed 32-byte hex |
| `collectionId` | string | `0x`-prefixed 32-byte hex |
| `question` | string | Non-empty, max 500 chars |

**Response 200:**
```json
{
  "answer": "...",
  "passages": ["..."],
  "requestId": "0x...",
  "txHash": "0x...",
  "receiptUrl": "/api/queries/0x.../receipt"
}
```

**Errors:** 400 (validation), 402 (escrow not found or underpaid), 409 (already finalised or policy changed), 422 (no passages found), 429 (rate limit), 500 (model/settlement error)

### GET /api/queries/:id/receipt

Retrieve a receipt for a completed query. Receipts are public for auditability; the response includes only the passage IDs (not content) and a SHA-256 digest of the model response.

**Response 200:**
```json
{
  "requestId": "0x...",
  "collectionId": "0x...",
  "buyerAddress": "0x...",
  "txHash": "0x...",
  "policyVersion": 1,
  "passageIds": ["p0", "p1"],
  "responseDigest": "sha256:...",
  "outcome": "settled",
  "createdAt": 1000000000,
  "settledAt": 1000000005
}
```

**Errors:** 400 (invalid requestId format), 404 (not found)

## Error response format

All errors return JSON with a single `error` string. Internal details, provider error bodies, and secrets are never included.

```json
{ "error": "Human-readable description" }
```

## Disclosure

The Worker retrieves selected passages from the private R2 collection and sends them to a third-party AI model API (Kimi or OpenAI-compatible) to generate answers. Buyers are informed of this before purchase. Passage content is not stored by the Worker after the model call completes.
