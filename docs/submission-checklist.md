# Metropolis submission record and judging checks

The Metropolis portal showed **Ready for judging** on 14 October 2026, last saved at 01:33 UTC. The primary track is **Trust, Identity & AI Infrastructure**. No sponsor bounties were selected. The deadline displayed in the portal was 14 October 2026 at 04:59 GMT+1.

| Entry item | Submitted value or evidence |
| --- | --- |
| Product | [DataVault live on Monad testnet](https://datavault.tamimtarafder12.workers.dev/) |
| Source | [ShieldTech-Ltd/datavault](https://github.com/ShieldTech-Ltd/datavault), MIT license |
| Demo video | [Public evidence walkthrough](https://drive.google.com/file/d/19YTD4yBQxM2qUid9Z4YmGXgBuTA5Y8sa/view?usp=sharing), under three minutes |
| Pitch video | [Team and product pitch](https://drive.google.com/file/d/1DuaVk97ce_5kSlH4zKF4TmkIPlC5JiRP/view?usp=sharing), under two minutes |
| Contract | [DataVault on Monad testnet](https://testnet.monadscan.com/address/0x304aca9375fbd2f645e6c2d0318effa407766430) |
| Buyer route | [Judge quickstart](demo-quickstart.md), including test-token setup and public transaction proof |

The demo video shows real public screens and recorded transactions, but does not show a new wallet approval or the buyer-only answer. The portal's judge instructions explain how to run that flow with a funded testnet wallet. Owner pause requires the collection owner's wallet; no owner credential is shared.

## During judging

1. Keep the Worker, model allowance, settlement wallet and chain RPC operational. Check the live app and a recent public receipt.
2. Preserve exact deployment, contract and transaction identifiers if the public deployment changes. Update the [judge quickstart](demo-quickstart.md) and README when they do.
3. Treat source merge, CI, actual deployment, and fresh browser wallet acceptance as separate gates.
4. Do not claim Dynamic SDK or another sponsor bounty integration: the submitted entry selected none, and the current frontend uses an injected EVM wallet with viem.

The submission page's Ready for judging state is the portal confirmation. A saved draft alone would not have been enough.
