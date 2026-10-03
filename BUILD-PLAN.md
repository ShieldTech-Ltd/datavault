# DataVault Query License: Metropolis Build and Demo Plan

## Summary

Build **DataVault**, a service where an individual or organization can offer an AI service paid, controlled access to a knowledge collection. The first demo uses a small, team-written UK practical guide. A real AI answers a buyer’s question using that guide, a Monad transaction records the payment, and pausing access blocks later queries.

This is a focused version of the idea. It does **not** claim to detect every AI use of someone’s content, prove copyright ownership, or force unrelated AI companies to pay. A hash is an integrity reference, not encryption or proof of ownership. Revocation blocks future queries through participating services; it cannot erase outputs already delivered.

Use **Cloudflare Workers** for the website and gated API, **R2** for the private demo collection, **D1** for request status and receipts, **Monad** for policy and escrow settlement, and **Dynamic** for sign-in, embedded wallets, and transaction signing. This uses Cloudflare as infrastructure, not as a partner or a Cloudflare Pay Per Use integration. [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/), [R2 bindings](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/), [D1](https://developers.cloudflare.com/d1/get-started/)

**Primary track:** Trust, Identity & AI Infrastructure.  
**Priority bounty:** Dynamic, with a deployed demo and meaningful wallet/signing use. Use Kimi only if its API is available and genuinely powers the demo. Do not make agent-wallet delegation a deadline-critical feature: first verify it works with the chosen Monad configuration. Dynamic documents custom EVM network support and embedded-wallet transactions. [Dynamic custom EVM networks](https://docs.dynamic.xyz/chains/evmNetwork), [Dynamic transactions](https://docs.dynamic.xyz/wallets/embedded-wallets/creating-transactions)

## Product and implementation

- **Owner flow:** Sign in with Dynamic, upload the team-authored Markdown guide to a private R2 bucket, and set a fixed per-query price and active/paused status. Register the collection identifier, content digest, price, policy version, and status on Monad. State clearly that sign-in does not prove ownership.
- **Buyer flow:** Sign in with Dynamic, ask a question, review the quoted price, then sign a Monad testnet transaction that places the fixed payment in escrow. The guide is retrieved only after the Worker verifies the payment and current on-chain policy.
- **Answer and settlement:** The Worker retrieves relevant passages, calls one real model provider, and returns an answer with source references. After a successful response is recorded, the contract settles the escrow to the owner. If the model or service fails, the answer is withheld and the buyer can reclaim an unsettled payment after the timeout.
- **Revocation and replay protection:** The owner can pause access or update the policy on-chain. The Worker checks current policy immediately before retrieval. Each request has a unique ID; duplicate requests cannot trigger another model call or payment.
- **Cloudflare boundary:** Serve the React/Vite app as Worker static assets. Use a Worker API, private R2 storage, and D1 for request state and receipt records. Keep model and settlement credentials in Worker secrets. Do not expose an R2 public URL or store source text, prompts, or answers on-chain.
- **Monad contract interface:** `registerCollection`, `updatePolicy`, `openQuery`, `settleQuery`, and `refundExpired`. Store collection ID, owner, price, policy version, active status, request ID, escrow state, and receipt commitment. Never put prompts or source passages in transaction data.
- **Worker API:** `POST /api/collections`, `POST /api/collections/:id/upload`, `POST /api/queries/prepare`, `POST /api/queries/execute`, and `GET /api/queries/:id/receipt`. The receipt includes request ID, collection and policy version, payment transaction, cited passage IDs, response digest, and outcome.
- **Model choice:** Try Kimi access on the first build day because the event lists a Kimi bounty. If access is unavailable, use another real model provider and make no Kimi bounty claim. Do not simulate successful AI queries or payments.
- **Trust language:** Tell owners that selected passages are sent to the model provider to answer a query. The demo guide must contain no sensitive personal data. Receipts prove what this app recorded, not that a model answer is true or that external AI systems comply.

Cloudflare provides the query and storage layer; Monad provides the shared policy and payment record. This is a coherent integration, but does not imply a Cloudflare partnership or make the product production-ready. [Monad documentation](https://docs.monad.xyz/)

## Build sequence and ownership

Deadline shown in the supplied dashboard: **14 October 2026 at 04:59 GMT+1**. Freeze on October 12 and submit early.

- **October 3 to 4, feasibility gate:** Create a separate DataVault project repository, not inside DUSK. Confirm Cloudflare deployment access, Dynamic sign-in and a signed transaction on Monad, contract deployment, real model access, and the exact portal rules. Write the small UK guide and get feedback from three likely users. If any critical integration fails, reduce the demo scope immediately.
- **October 4 to 6, payments and gate:** Implement and test the escrow contract; deploy to the permitted Monad network. Build the Worker API, R2 storage, D1 request state, policy checks, and payment verification.
- **October 6 to 8, working product:** Build the owner and buyer screens, Dynamic authentication and embedded-wallet signing, real model retrieval with citations, and receipt history.
- **October 9 to 10, failure paths:** Verify revocation, stale policy, replayed request, insufficient payment, model failure, Worker timeout, settlement failure, and expired refund. Fix issues before adding polish.
- **October 11 to 12, public demo and freeze:** Deploy the site and contract, publish setup instructions and links, run the complete flow from a clean browser, capture the real demo, and freeze changes.
- **October 13 to 14, submission buffer:** Check every required portal field and submit well before the displayed deadline.

**Team split:** You own the contract, API gate, payment state machine, and security checks. Ritik owns the frontend, Dynamic sign-in flow, owner/buyer experience, and video editing. Both review the end-to-end demo and submission claims.

## Demo video and acceptance

Target a **90-second video**. Use Higgsfield for a short visual opening and clean titles or transitions, then show actual footage of the deployed product. Do not generate or fake app screens, wallet prompts, AI answers, or transactions. The Dynamic bounty description you shared allows an optional video of up to two minutes.

1. Show the owner setting a price and enabling the collection.
2. Ask a real question and show the Dynamic wallet signing the escrow payment.
3. Show the cited AI answer, actual Monad transaction, and receipt.
4. Pause the collection and show the next request denied before retrieval.
5. State the limitation plainly: this controls access through participating services.

**Done means:** a public website, a working Monad contract, Dynamic sign-in and real transaction signing, private gated retrieval, a real model answer with citations, successful settlement and failure refund behavior, an inspectable receipt, a public repository with setup instructions, and a video that matches the live product.