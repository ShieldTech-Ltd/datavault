# DataVault release and judging plan

This file replaces the initial hackathon build plan. The earlier plan is preserved in Git history; it described proposed integrations and bounty targets that were not part of the submitted product. The Metropolis entry selected the Trust, Identity & AI Infrastructure track and **no sponsor bounty**.

## Current state, 14 October 2026

- The [live app](https://datavault.tamimtarafder12.workers.dev/) runs on Monad testnet.
- [PR #68](https://github.com/ShieldTech-Ltd/datavault/pull/68) merged Claude Messages API support, the current explorer link, and guided first-query onboarding into master.
- The browser app uses an injected EVM wallet and viem for connection and transaction signing. It does not integrate Dynamic SDK.
- Public analytics, receipts and Monad transactions show completed paid queries and owner payouts. The [judge quickstart](docs/demo-quickstart.md) links one matching request.
- The Metropolis portal showed **Ready for judging** on 14 October 2026, last saved at 01:33 UTC.

## Maintained product path

1. An owner uploads content to the Worker, reviews model disclosure, and registers the collection's price and policy on Monad.
2. A buyer connects an injected EVM wallet, reviews the current price, and opens an escrowed query.
3. The Worker verifies payment and current policy before reading private R2 passages and calling the configured model.
4. The Worker records the cited answer, settles payment to the owner, then releases the answer to the buyer. Public receipts omit answer and source text.
5. An owner can pause future queries. A buyer can recover a completed answer or refund an unsettled escrow after the ten-minute timeout.

## Follow-up gates

- Keep the public Worker, chain RPC, model quota and settlement wallet available for judging; check the site and a public receipt periodically.
- Review merged source, current CI, runtime configuration, and actual browser wallet behavior as separate forms of evidence.
- Do not claim integrations with unused sponsor SDKs, production readiness, copyright ownership, or control over external AI systems.
- Maintain the [README](README.md), [judge quickstart](docs/demo-quickstart.md), [deployment runbook](docs/deployment.md), and [security controls](docs/security.md) when the deployment changes.

The submitted technical video is a walkthrough of public screens and transaction evidence. It does not show a fresh buyer wallet approval or buyer-only answer.
