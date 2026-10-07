# DataVault deployment runbook

This runbook prepares the public demo. It does not authorize deployment or spending funds.
Record the final values in a private release ledger, and publish only public addresses and redacted evidence.

## Before deployment

1. Confirm current Metropolis portal requirements and that Monad testnet remains accepted.
2. Review and merge readiness PR #48 and stacked security PR #49 in order. Contributor PRs #46 and #47 are already on master. Record the merged commit.
3. Run clean installs, contract tests, Worker tests, both typechecks, and the frontend build on that commit.
4. Confirm a Cloudflare account with a private R2 bucket, a D1 database, and permission to deploy Workers.
5. Confirm the public HTTPS origin and Monad testnet RPC are configured.
6. Confirm model access and set a spending cap. Fund only authorized test wallets and the settlement operator.
7. Verify the sample guide and obtain permission to publish it. The guide currently contains time-sensitive factual claims.

## Deploy the contract and bindings

1. Set a newly generated, private `DEPLOYER_PRIVATE_KEY` and `MONAD_RPC_URL` locally. Never fund or reuse the example key committed in early history. Deploy with `npm run deploy:testnet`. The script requires an explicit target network, rejects known unsafe example keys, checks chain ID 10143 on testnet, and refuses to proceed without a signer.
2. Record the printed contract address and deployment transaction. The script checks that contract code exists at the address; verify the transaction again in the Monad explorer.
3. Create private R2 buckets matching `worker/wrangler.toml`, including the preview bucket if used.
4. Create the D1 database, replace `PLACEHOLDER_REPLACE_AFTER_D1_CREATE` with its actual ID in the deployment configuration, and apply all committed migrations in order, including 0007 for exact escrow amounts in analytics.
5. Set `CONTRACT_ADDRESS`, `CHAIN_ID`, `MONAD_RPC_URL`, `MODEL_PROVIDER`, `MODEL_API_BASE`, and `MODEL_NAME` for the Worker. Set `SETTLEMENT_PRIVATE_KEY` and `MODEL_API_KEY` through Wrangler secrets. Never place keys in tracked files.
6. Set `VITE_CONTRACT_ADDRESS`, `VITE_CHAIN_ID`, and `VITE_CHAIN_RPC_URL` for the frontend build.
7. Build the frontend and deploy the Worker with static assets. Check that client assets and API errors expose no credentials.

Before the Worker deploy command, run `npm run check:release-config` with the public `VITE_` values, `CONTRACT_ADDRESS`, and `CHAIN_ID` set for that build. It fails on placeholder D1 and contract settings. Run `npm run compile`, then `npm run check:release-config -- --live` to confirm that both Worker and frontend RPC endpoints report the configured chain and that the contract runtime bytecode matches the compiled DataVault artifact. The live check needs network access and does not inspect Wrangler secrets or remote resource permissions. Verify those separately. After the site and video exist, run `npm run check:release-config -- --submission --live` with `DEMO_COLLECTION_ID`, `DEPLOYMENT_TX_HASH`, `PUBLIC_SITE_URL`, and `DEMO_VIDEO_URL` set. The submission mode checks formats and HTTPS URLs, then a person must open every URL and verify the actual content.

The Worker must return 503 for paid quotes until contract, settlement, and model settings are present. No query should be opened against a deployment that returns 503.
The Worker also checks the RPC chain ID during registration, quotes, paid execution, and settlement. A mismatched or unavailable RPC fails these operations closed; restore the correct endpoint before inviting another payment.

## Register the sample collection

Use an authorized owner wallet and the public owner flow to upload the reviewed team-authored guide. Wait for the registration receipt and D1 confirmation. Set `DEMO_COLLECTION_ID` to the confirmed collection ID as a Worker runtime setting, for example with `wrangler secret put DEMO_COLLECTION_ID`, then verify the resulting Worker version. `GET /api/demo` must return that active collection. Keep a separate owner-controlled presentation collection for pause and refund demonstrations so the public sample remains usable.

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
