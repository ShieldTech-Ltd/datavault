# DataVault deployment runbook

This runbook prepares the public demo. It does not authorize deployment or spending funds.
Record the final values in a private release ledger, and publish only public addresses and redacted evidence.

## Before deployment

1. Confirm current Metropolis portal requirements and that Monad testnet remains accepted.
2. Confirm merged PRs #48, #49, and #50. Review PR #51 for source, backend, database migration, security, and frontend integration readiness. Require passing CI and Security checks, then merge it as source integration. Record the merge commit. Merging does not declare the public product or demo ready.
3. Run clean installs, contract tests, Worker tests, both typechecks, and the frontend build on the merge commit before deployment. Perform the live end-to-end gate below on the deployed candidate before recording a demo or submitting the project.
4. Confirm a Cloudflare account with a private R2 bucket, a D1 database, and permission to deploy Workers.
5. Confirm the public HTTPS origin and Monad testnet RPC are configured.
6. Confirm model access and set a spending cap. Fund only authorized test wallets and the settlement operator.
7. Review the focused sample guide against its linked official sources, obtain permission to publish it, and record feedback from three likely users. Its tax rates and thresholds were removed to avoid stale claims.

## Deploy the contract and bindings

1. Set a newly generated, private `DEPLOYER_PRIVATE_KEY` and `MONAD_RPC_URL` locally. Never fund or reuse the example key committed in early history. Deploy with `npm run deploy:testnet`. The script requires an explicit target network, rejects known unsafe example keys, checks chain ID 10143 on testnet, and refuses to proceed without a signer.
2. Record the printed contract address and deployment transaction. The script checks that contract code exists at the address; verify the transaction again in the Monad explorer. Confirm this deployment uses the two-argument `settleQuery(requestId, answerDigest)` contract and emits the digest in `QuerySettled` before admitting paid queries.
3. Create private R2 buckets matching the Worker configuration, including the preview bucket if used. Copy `worker/wrangler.toml` to the ignored `worker/wrangler.deploy.toml` and set real, non-secret resource identifiers and runtime values there. Keep secrets out of both files.
4. Create the D1 database, replace `PLACEHOLDER_REPLACE_AFTER_D1_CREATE` in the ignored deployment config with its actual ID, and apply all committed migrations with `npm run db:migrate:remote --prefix worker`. This command selects `wrangler.deploy.toml` and the remote database explicitly. Confirm the database ID and account shown by Wrangler before accepting the migration prompt. This includes 0007 for exact escrow amounts, 0008 for collection deployment identity, and 0009 for fenced query leases. Collections created before 0008 remain unbound and are excluded from current marketplace views until their chain and contract are verified and migrated.
5. Set `CONTRACT_ADDRESS`, `CHAIN_ID`, `MONAD_RPC_URL`, `MODEL_PROVIDER`, `MODEL_API_BASE`, and `MODEL_NAME` in the ignored deployment config. Keep `SETTLEMENT_PRIVATE_KEY` and `MODEL_API_KEY` out of both Wrangler files.
6. Set `VITE_CONTRACT_ADDRESS`, `VITE_CHAIN_ID`, and `VITE_CHAIN_RPC_URL` for the frontend build. Build the frontend and pass the release checks described below.
7. Deploy the Worker with static assets using `cd worker && npx wrangler deploy --config wrangler.deploy.toml`. With the two required secrets absent, paid quotes must return 503. Check that client assets and API errors expose no credentials.
8. Upload `MODEL_API_KEY` with `cd worker && npx wrangler secret put MODEL_API_KEY --config wrangler.deploy.toml`. Upload `SETTLEMENT_PRIVATE_KEY` last with the same config. A secret update deploys a new Worker version, so verify the target Worker and account before each command. Confirm both names with `npx wrangler secret list --config wrangler.deploy.toml` and confirm the operator address matches the owner collection policy before inviting paid queries. Never print or record secret values.

Before the Worker deploy command, set `DATAVAULT_WRANGLER_CONFIG=worker/wrangler.deploy.toml` and run `npm run check:release-config` with the public `VITE_` values, `CONTRACT_ADDRESS`, and `CHAIN_ID` set for that build. The guard reads the same ignored Wrangler file used for deployment, checks `frontend/dist/release-manifest.json` against the built browser configuration, and fails on placeholder D1 or contract settings. Keep `VITE_CHAIN_RPC_URL` credential-free because it is embedded in public JavaScript. Run `npm run compile`, then `npm run check:release-config -- --live` to confirm that both Worker and frontend RPC endpoints report the configured chain and that the contract runtime bytecode matches the compiled DataVault artifact. The live check needs network access and does not inspect Wrangler secrets or remote resource permissions. Verify those separately. After the site and video exist, run `npm run check:release-config -- --submission --live` with `DEMO_COLLECTION_ID`, `DEPLOYMENT_TX_HASH`, `PUBLIC_SITE_URL`, and `DEMO_VIDEO_URL` set. The submission mode checks formats and HTTPS URLs, then a person must open every URL and verify the actual content.

The Worker must return 503 for paid quotes until contract, settlement, and model settings are present. No query should be opened against a deployment that returns 503.
The Worker also checks the RPC chain ID during registration, quotes, paid execution, and settlement. A mismatched or unavailable RPC fails these operations closed; restore the correct endpoint before inviting another payment.

## Register the sample collection

Use an authorized owner wallet and the public owner flow to upload the reviewed team-authored guide. Wait for the registration receipt and D1 confirmation. Set `DEMO_COLLECTION_ID` to the confirmed collection ID with `cd worker && npx wrangler secret put DEMO_COLLECTION_ID --config wrangler.deploy.toml`, then verify the resulting Worker version. `GET /api/demo` must return that active collection. Keep a separate owner-controlled presentation collection for pause and refund demonstrations so the public sample remains usable.

Set `PUBLIC_SITE_URL` to the deployed HTTPS origin and run `npm run smoke:public`. This read-only smoke checks the homepage, JavaScript asset, security headers, active demo collection, and a quote that matches its price. It opens no escrow and uses no wallet or model key. A passing result is only a prerequisite for the paid browser checks below.

## Live acceptance

Record the deployment commit, URL, chain ID, contract, owner, operator, collection ID, content hash, model provider, and date. From a fresh browser and new buyer wallet:

- Connect an injected EVM wallet, use the documented test-funding route, and complete three consecutive paid questions with newly generated cited answers.
- Check each opening and settlement transaction on Monad and verify the owner payout.
- Refresh after payment and recover the same request without another charge.
- Check that a different wallet cannot execute or recover the first buyer's request.
- Confirm a pause transaction and show that the next query is denied before private retrieval or model use.
- Create an unsettled failure in a private rehearsal and verify the buyer can refund after the actual ten-minute timeout without the Worker.
- Check desktop and mobile layouts, wrong network, wallet rejection, model outage, pending settlement, and insufficient funds.

Report `LIVE DEMO NOT READY` with named blockers until all checks pass. Local tests and green CI do not substitute for these checks.

## Rollback and operation

Retain the previous deployed commit and configuration. For a bad app deploy, restore the previous Worker build and verify its contract and D1 schema compatibility before admitting new payments. Never point a new frontend at an old incompatible Worker. Pause the sample collection through the owner wallet if paid execution is unsafe. Do not delete D1 request or receipt records during rollback. Watch operator test MON and model budget manually during the judging period. Record outages and pending settlements without logging questions, answers, source passages, or secrets.

## Submission handoff

After the live checks, publish a real video of the deployed product, no longer than three minutes, using [the demo script](demo-script.md). Work through [the submission evidence checklist](submission-checklist.md). Before creating the Metropolis project, verify the public HTTPS site, video, GitHub repository, license, documentation, contract explorer, and transaction links from a clean browser. The Metropolis project and final submission require separate authorization and a portal confirmation record.
