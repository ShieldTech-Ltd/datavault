# Private GitHub App connector

Private imports use the signed-in account's GitHub App user access token. They never use a PAT, installation token or operator fallback. Public selected-file imports continue to work without a connector.

## Deployment setup

Apply migration `0019_account_connectors.sql` after all existing migrations. It adds nullable connection fields to existing import jobs, preserving populated public jobs and their idempotency keys.

Register a GitHub App with repository Contents: Read-only and the mandatory Metadata: Read-only permission. Do not request other repository, organization or account permissions. Install it on selected repositories only. The connector rejects all-repository installations, write permissions, unknown permissions and unknown app identities. Its bounded first version supports at most 100 installations and 100 repositories in total; larger grants fail closed. A user needs both installation access and GitHub user consent.

Configure these Worker values using deployment secrets where appropriate:

| Value | Required format |
| --- | --- |
| `GITHUB_APP_ID` | Registered app numeric ID |
| `GITHUB_CLIENT_ID` | Registered GitHub App client ID |
| `GITHUB_CLIENT_SECRET` | Secret for that app |
| `CONNECTOR_ORIGIN` | Exact HTTPS origin serving both UI and API, without trailing slash |
| `CONNECTOR_TOKEN_KEY` | 32 random bytes encoded as 64 hexadecimal characters, held as a secret |

Register the exact callback `${CONNECTOR_ORIGIN}/api/connectors/github/callback`. Do not configure wildcard or caller-selected callbacks. Live authorization intentionally requires HTTPS, even on the local development chain. Missing or malformed configuration leaves the private connection UI disabled. No private configuration or live consent was created by this implementation.

Enable expiring GitHub App user tokens. Both expiring and non-expiring responses are supported; expiration is the provider registration setting. The authorization request uses S256 PKCE and does not request the legacy OAuth `repo` scope. All GitHub calls use fixed GitHub hosts, API version `2026-03-10`, a ten-second per-request deadline, bounded streamed JSON and `redirect: manual`, with every non-success response rejected before consumption. No credential-bearing redirect is followed.

## Account and credential lifecycle

Connect is an explicit account mutation protected by the current session, CSRF token and exact trusted origin. Its 256-bit random state is stored only as a hash and binds account, deployment, browser cookie and exact session. PKCE verifiers are encrypted. State expires after five minutes and is atomically consumed once.

The callback exchanges the code server-side, checks the token against the configured client, validates app identity and permissions using the user-visible installations and app metadata, and enumerates repositories through the user installation API. The callback creates a pending connection and redirects to fixed account settings. The current wallet must hydrate to the same account session and explicitly confirm with CSRF and the browser cookie. Pending credentials cannot import and expire after five minutes. A wallet change revokes or mismatches the session; it cannot silently confirm the previous wallet's pending grant.

Credentials use AES-GCM with random IVs and an authenticated version/account/deployment/provider binding. Access and refresh tokens are never returned in status, export, notices or frontend storage. The shared connector-security library and provider-keyed state schema support later connectors. Keep request-level access logs from recording callback query strings, which contain short-lived OAuth codes and state; application code does not log these values.

Refresh uses an exclusive database lease, credential version compare-and-swap, and encrypted access/refresh token rotation. Other imports return a retry conflict while refresh is in progress. An expired ambiguous refresh lease requires reconnection instead of reusing a potentially consumed refresh token. Revocation, invalid credentials and permission validation failure require reconnection. Before a new import, the connector revalidates current app and installation permissions. Each content request decrypts the current own credential and checks its version. Draft access and completion also require the matching current connected version.

Disconnect atomically removes local credentials and cancels private jobs, including current review drafts, then deletes tracked draft objects. It joins the account mutation quota of 20 per minute. The provider token is revoked through GitHub's official DELETE token endpoint using the configured client credentials. If remote revocation is unconfirmed, local access remains disabled and the UI directs the user to GitHub's authorized-app settings. Expired pending grants discard their local encrypted credentials and similarly expose manual revocation guidance. Confirmed collections and existing paid recovery records remain intact.

## Verification and remaining gate

Run from `worker`:

```text
node node_modules/vitest/vitest.mjs run --minWorkers=1 --maxWorkers=2 --testTimeout=20000 --hookTimeout=20000
node node_modules/typescript/bin/tsc --noEmit
node scripts/github-auth-runtime-smoke.mjs
```

The tests use real SQLite migrations and mock only external GitHub responses. The runtime smoke executes the real shared helper in workerd with outbound network disabled and verifies AES-GCM, JSON consumption and rejection of 300, 301, 302, 303, 307 and 308 redirects. Frontend tests cover wallet fencing and disabled-provider consent behavior.

A configured HTTPS deployment, actual GitHub App installation, real user consent, live refresh/revocation and private fixture import still require a separate authorized acceptance run. Mocked provider tests are not live GitHub proof.

## Primary references checked 9 October 2026

- [GitHub App user access tokens and S256 PKCE](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)
- [GitHub user-token refresh and rotation](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens)
- [GitHub token check and revocation](https://docs.github.com/en/rest/apps/oauth-applications?apiVersion=2026-03-10)
- [User-visible installations and repositories](https://docs.github.com/en/rest/apps/installations?apiVersion=2026-03-10)
- [App identity and permission metadata](https://docs.github.com/en/rest/apps/apps?apiVersion=2026-03-10#get-an-app)
- [Cloudflare Workers fetch](https://developers.cloudflare.com/workers/runtime-apis/fetch/)
