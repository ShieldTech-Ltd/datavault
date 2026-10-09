# Selected Notion imports

DataVault imports supported text from one to five explicitly selected Notion page UUIDs into a private review draft. It never searches or crawls the workspace. Child pages, linked pages, databases, synced blocks, files and remote embeds are omitted. Unsupported block types are counted in private provenance. Review and edit the draft, choose a name and price, accept disclosure, then sign with the current publishing owner wallet through the existing registration flow.

## Operator configuration

Create a public Notion connection with **Read content** capability only. Disable insert/update content, comments and user-information capabilities. Configure an exact HTTPS redirect URI:

```text
https://YOUR_PUBLIC_ORIGIN/api/connectors/notion/callback
```

Set these values privately in the Worker deployment:

| Value | Purpose |
| --- | --- |
| `NOTION_CLIENT_ID` | Public connection client UUID |
| `NOTION_CLIENT_SECRET` | Private OAuth client secret |
| `PUBLIC_ORIGIN` | Exact trusted HTTPS origin, without a trailing slash or path |
| `CONNECTOR_TOKEN_KEY` | Private 32-byte AES key encoded as 64 hexadecimal characters |

Notion configuration is independent of GitHub configuration. Missing or invalid configuration disables the provider. Local development remains provider-disabled; no localhost origin or destination bypass is added. Apply migration `0022_notion_imports.sql` after `0021_shared_import_jobs.sql`. The migration rebuilds the import provider constraint while preserving existing identifiers, private object keys, rows and indices, with account foreign keys enabled. No existing migration is edited.

Select the intended pages in Notion's consent page picker. After the callback, DataVault requires an explicit signed-in session and CSRF-protected confirmation for the current wallet. A callback alone cannot authorize imports. The pending connection and browser binding expire after five minutes. A top-level callback uses the existing SameSite=Lax account cookie; the separate Notion browser binding is HttpOnly and Secure.

The token and introspection responses do not document a complete integration-capability inventory. DataVault validates the OAuth bearer response, workspace/bot identifiers and active introspection result. It cannot prove that an operator configured only read capabilities from those responses. The operator capability settings are a deployment gate. DataVault's adapter only calls OAuth endpoints, selected-page reads and selected child-block reads. It never writes Notion content or reads users, questions or answers.

## Token lifecycle and cleanup

The current API documents `access_token` and a nullable `refresh_token`, without an `expires_in` field or a fixed lifetime. DataVault stores the encrypted pair without inventing expiry. **Rotate Notion authorization** performs an authenticated refresh-token grant through the shared exclusive refresh lease and compare-and-swap version fence. A missing refresh token, rejected permission or expired refresh lease requires reconnecting. Rotating credentials invalidates drafts bound to the previous credential version.

Tokens use the existing `v1` AES-GCM envelope with a fresh nonce and authenticated account, deployment and provider context. The encrypted payload is never included in API metadata or account exports. Replacing the encryption key requires reconnecting affected connections; this change does not introduce automatic old-key rotation.

Disconnect removes local capability and cancels import drafts before attempting Basic-authenticated `POST /v1/oauth/revoke`. A failed remote revoke remains a durable cleanup obligation. Expired pending credentials also retain a durable cleanup obligation before local credential removal. Replacing a connection or successfully revoking another token cannot clear an older obligation. When revocation cannot be confirmed, the user must remove the earlier connection in Notion workspace settings. No token is retained inside cleanup obligation metadata for automatic retry.

## Bounds and review semantics

- API version: `2026-03-11`.
- One to five distinct dashed page UUIDs per import.
- Maximum 500 blocks and five nested child-block levels across selected pages.
- Maximum two million cumulative response bytes and 500,000 UTF-8 text bytes.
- Ten-second timeout per provider request. Fixed `https://api.notion.com` endpoints, manual redirect handling and rejection of every 3xx response before body consumption.
- Supported copied text: paragraphs, headings, lists, to-do items, toggles, quotes, callouts, code and table rows. Columns and tables are traversed as containers. Rich-text links and mentions contribute their plain text only.
- No automatic expansion of child pages, databases, synced blocks or embeds, even when Notion grants parent-page descendant access.
- A global maximum of one queued/running import and 20 new jobs per rolling day per account, shared with GitHub and website imports.
- Existing bounded inline dispatch, retry, cancellation, lease, expiry and private R2 draft primitives are reused. Tokens are never job payloads.
- Drafts expire after 24 hours. Every provider request and the final draft acceptance use current connector/version fences. Draft download repeats the current credential check after reading R2.
- Provenance contains selected page ID, title, extraction UTC, API version, block count and unsupported-type counts. Notion pages may change during extraction; the API does not provide an atomic snapshot of all selected pages.

## Current validation boundary

Unit tests use controlled provider responses. The actual workerd smoke disables outbound networking and verifies crypto and no-follow redirects against a fixed Notion host. No real Notion OAuth consent or private API access has been performed. Provider-disabled browser acceptance, populated local workerd migration acceptance and hosted checks are tracked separately by the release controller. These tests do not prove public OAuth deployment readiness.

## Primary references refreshed 9 October 2026

- [Authorization and selected-page consent](https://developers.notion.com/guides/get-started/authorization)
- [Create a token, including nullable refresh token response](https://developers.notion.com/reference/create-a-token)
- [Refresh a token](https://developers.notion.com/reference/refresh-a-token)
- [Introspect a token](https://developers.notion.com/reference/introspect-token)
- [Revoke a token](https://developers.notion.com/reference/revoke-token)
- [Retrieve a page](https://developers.notion.com/reference/retrieve-a-page)
- [Retrieve block children and pagination](https://developers.notion.com/reference/get-block-children)
- [API introduction](https://developers.notion.com/reference/intro)
- [Cloudflare D1 foreign-key enforcement](https://developers.cloudflare.com/d1/sql-api/foreign-keys/)
