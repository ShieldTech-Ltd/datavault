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

1. Set `DEPLOYER_PRIVATE_KEY` and `MONAD_RPC_URL` locally. Deploy with `npm run deploy:testnet`.
2. Record the contract address and deployment transaction. Verify chain ID 10143 and contract code at the address.
3. Create private R2 buckets matching `worker/wrangler.toml`, including the preview bucket if used.
4. Create the D1 database, replace `PLACEHOLDER_REPLACE_AFTER_D1_CREATE` with its actual ID in the deployment configuration, and apply migrations 0001 through 0006 in order.
5. Set `CONTRACT_ADDRESS`, `CHAIN_ID`, `MONAD_RPC_URL`, `MODEL_PROVIDER`, `MODEL_API_BASE`, and `MODEL_NAME` for the Worker. Set `SETTLEMENT_PRIVATE_KEY` and `MODEL_API_KEY` through Wrangler secrets. Never place keys in tracked files.
6. Set `VITE_CONTRACT_ADDRESS`, `VITE_CHAIN_ID`, and `VITE_CHAIN_RPC_URL` for the frontend build.
7. Build the frontend and deploy the Worker with static assets. Check that client assets and API errors expose no credentials.

The Worker must return 503 for paid quotes until contract, settlement, and model settings are present. No query should be opened against a deployment that returns 503.

## Register the sample collection

Use an authorized owner wallet and the public owner flow to upload the reviewed team-authored guide. Wait for the registration receipt and D1 confirmation. Set `DEMO_COLLECTION_ID` to the confirmed collection ID as a Worker runtime setting, for example with `wrangler secret put DEMO_COLLECTION_ID`, then verify the resulting Worker version. `GET /api/demo` must return that active collection. Keep a separate owner-controlled presentation collection for pause and refund demonstrations so the public sample remains usable.

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

After the live checks, publish a real video of the deployed product, no longer than three minutes. Before creating the Metropolis project, verify the public HTTPS site, video, GitHub repository, license, documentation, contract explorer, and transaction links from a clean browser. The Metropolis project and final submission require separate authorization and a portal confirmation record.
