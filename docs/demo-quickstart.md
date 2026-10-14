# Judge quickstart

DataVault is a public Monad testnet demonstration. No DataVault account is required for a paid query. Use an injected EVM wallet such as MetaMask or a wallet browser on Monad testnet (chain ID `10143`). The app can ask the wallet to add or switch networks. The [Monad testnet faucet](https://faucet.monad.xyz/) can supply test MON; allow `0.001` test MON per query plus gas.

## Run a paid query

1. Open the [live app](https://datavault.tamimtarafder12.workers.dev/) and connect your wallet.
2. In [Marketplace](https://datavault.tamimtarafder12.workers.dev/marketplace), choose the active **DataVault Product Guide** and select **Ask a question**. The [direct buyer link](https://datavault.tamimtarafder12.workers.dev/query?collection=0x669acf971595da659526f319a7a8911749755de85eccfc0c45853bf1b8ea38b5) preselects that collection.
3. Ask a question such as “How does DataVault handle paid questions and owner access controls?” Select **Review current price** and inspect the live quote.
4. Approve the escrow transaction in your wallet. After confirmation, sign the separate request authorization. That signature does not make another payment. Wait for the cited answer, receipt, and settlement transaction.
5. Keep the same buyer wallet connected to revisit or recover the completed request without paying again.

The owner registration and pause controls require the collection owner's wallet, which is not shared with judges. An unsettled escrow can be refunded by its buyer after the contract's ten-minute timeout.

## Inspect existing public proof without a wallet

The [public analytics](https://datavault.tamimtarafder12.workers.dev/analytics) page links recent settlements to receipts and Monad transactions. One completed request has a [public receipt](https://datavault.tamimtarafder12.workers.dev/api/queries/0xa68eb38f26e874622823b39da95adff329c684efa86149eaaeee350e71653f9e/receipt), an [escrow opening transaction](https://testnet.monadscan.com/tx/0x69130f4f3054a20b656eb09ad765f777d308244bdf95de9ea8f9ba5369477663), and an [owner settlement transaction](https://testnet.monadscan.com/tx/0x862c17a568db323517108f4058fca06a813e45248ff43ead11578af180a7523c). The deployed contract is [0x304aca9375fbd2f645e6c2d0318effa407766430](https://testnet.monadscan.com/address/0x304aca9375fbd2f645e6c2d0318effa407766430).

The [technical demo video](https://drive.google.com/file/d/19YTD4yBQxM2qUid9Z4YmGXgBuTA5Y8sa/view?usp=sharing) and [pitch video](https://drive.google.com/file/d/1DuaVk97ce_5kSlH4zKF4TmkIPlC5JiRP/view?usp=sharing) are shared for link access. The technical video walks through public product screens and recorded transaction evidence; it does not show the buyer-only answer or a new wallet approval.

The public receipt excludes the private question, answer, and source passages. A content hash is an integrity reference, not proof of copyright ownership, and a receipt does not certify that an answer is factually correct. Selected passages are sent to the configured model provider to generate answers.
