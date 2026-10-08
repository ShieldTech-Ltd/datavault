# Security controls and release gates

The paid path handles private source material, buyer questions, and a settlement key. Treat the public demo as a financial service with limited funds. No scanner or test suite can guarantee that bugs or credential leaks will never occur.

## Credential handling

- Store the settlement and model keys only as Wrangler secrets. Keep deployer keys in untracked local environment files or an approved secret manager. Never use the deployer key as the settlement key.
- The model endpoint must use HTTPS and cannot embed credentials or query parameters. The Worker rejects an insecure endpoint before sending the model key.
- Only `VITE_` values intended to be public may enter the frontend build. Inspect the built assets for secret values before deployment.
- Use separate, low balance testnet wallets. Rotate a key immediately if it appears in a commit, log, artifact, screenshot, or chat. Removing it from a later commit does not undo exposure.
- An early `.env.example` commit contained a low-integer example deployer key. It is public in Git history and must never hold funds or be reused. The release checks reject low-integer, repeated-byte, and all 20 default Hardhat test wallets for production roles. They cannot prove that any other supplied key is private.
- Keep R2 buckets private and restrict Cloudflare account access. Apply least privilege to GitHub and Cloudflare tokens.
- The credential guard scans tracked files and reachable Git history for local env files and common credential formats. It excludes only the exact documented legacy example blob. It is a guardrail, not a substitute for provider secret scanning or human review.
- The browser stores only request identifiers, transaction hashes, and status for recovery. It removes legacy plaintext questions from local history and only displays a recovered answer for the connected buyer wallet.

## Request and response boundary

- Owner and buyer actions use current wallet signatures. Paid execution binds chain, contract, collection, request, question digest, opening transaction, and timestamp.
- The Worker verifies matching successful Monad receipts before registering or executing, checks current policy and operator, and withholds answers until settlement is confirmed.
- Uploaded passage text is escaped before placement inside model prompt delimiters. Model outputs still require validated citations, and prompt injection remains a residual risk to review with real adversarial documents.
- API responses use `Cache-Control: no-store`. All responses use `X-Content-Type-Options: nosniff`, frame denial, a CSP that restricts scripts to the site and connections to the site or HTTPS endpoints, and a restrictive referrer policy. React's inline styles require the CSP style exception. A public deployment accepts only its own browser origin and explicitly configured origins. Local cross-port origins are accepted only when the Worker itself runs on localhost.
- The Worker caps JSON request bodies at 8 KB and registration request bodies at 512000 bytes plus 16 KB of multipart overhead before parsing. The document itself remains limited to 512000 bytes.
- Registration and execution use an atomic D1 fixed-window quota per caller IP. Quotes, public catalogue and receipt reads, registration confirmation, and signed reconciliation have separate quotas before their D1 or RPC work. This does not stop an attacker using many IPs. Set Cloudflare account-level rate and spending limits before public use.
- The unsupported content replacement endpoint returns 410. A new content version requires an on-chain policy update first.

## CI and release decision

CI runs contract tests, frontend typecheck/build, and Worker typecheck and tests in parallel. The separate Security workflow runs a dependency-free tracked credential guard, D1 migration and concurrency checks, and production dependency audits. It has read-only repository permission and no production secrets.

The frontend uses the existing viem dependency with an injected EVM wallet. The production dependency audit currently reports zero known advisories locally. Keep the audit gate active and repeat it before deployment; registry data can change. Wallet connection and transaction flows still require a live browser regression check.

Before deployment, require the CI and Security checks on the protected branch, review the combined result, verify no keys in assets or logs, and run the live paid, recovery, pause, and refund checks in [deployment.md](deployment.md). Keep the PR in draft while any release gate fails.
