# Analytics and saved-items local acceptance

Date: 9 October 2026. Locally accepted at feature candidate `1f8846f8edbdfb60b6b90367aca2cfbaec56ddc8`, following independent specification and quality review and scoped label-fix review. Hosted exact-head checks remain a separate gate.

## Verified routes and accounting

Public analytics selected 9 October to 10 October UTC (exclusive end): one daily bucket, 12 settlements, 12 known amounts, `12000000000000000` recorded wei, zero failures/refunds. The default 30-day window matches these recorded local rows and displays zero days. Historical 1 October to 2 October displayed one genuine zero bucket. An end before the start displayed an explicit error without stale totals; correcting it restored data.

Current confirmed collections remains current inventory, separate from dated activity. The final candidate explicitly labels current public/owned inventory and the selected ranking window. Registrations in a period would be a separate future metric.

Signed owner analytics showed five current owned collections and one settlement, `1000000000000000` wei, complete 1/1 amount coverage. Downloaded `datavault-owner-analytics.csv` contained that same single row and exact amount for request `0x519ad40331ebc6d62150befadf76ce7117ca0ad413094fada19d6c244733629f`. CSV protection, date boundaries, incomplete amounts and visible 10,000-row overflow have automated checks. No synthetic settlement rows were inserted into the browser database.

## Private saved items

The original owner bookmarked the original confirmed collection and explicitly opted into saving the non-sensitive question, "What are the DataVault payment and receipt rules?" Consent reset after save. The list showed 30-day expiry on 8 November. Use filled the ordinary query form, cleared any quote and required a fresh quote before payment. It did not open escrow or pay.

Switching to the buyer immediately cleared the old private list, question and consent. After signing in, buyer bookmark and question lists were empty. Returning to the owner restored the owner's saved question. Account export `datavault-account(3).json` contained one bookmark, one question and two notifications, without credentials, paid answers or source content.

Root-created question and bookmark were deleted through their UI actions, followed by reload. An independent read-only D1 count confirmed zero records of both types for that owner. Existing collections, receipts and answers were preserved. Stable pagination, atomic caps, expiry and stale wallet/window response fences have automated boundary checks.

## Design and browser evidence

Desktop and 390px mobile retain the selected light design. Actual analytics and saved-item control bounds were 34.80 to 350.80px within the 386px document client width. Paid-form controls were 30.80 to 354.80px. Stable measurements showed no overflowing elements. Native date keyboard actions triggered real React state; saved-item keyboard actions were used where pointer behavior was inconclusive.

Screenshots in Downloads: `DataVault-SaaS-Analytics-Daily.png`, `DataVault-SaaS-Owner-Analytics.png`, `DataVault-SaaS-Owner-Analytics-Mobile.png`, `DataVault-SaaS-Saved-Question-Mobile.png`, and `DataVault-SaaS-Analytics-Final.png`.

## Verification and limits

Migration `0015_saved_items.sql` applied six commands to populated local D1 without reset. Five affected Worker files passed 28 tests. Affected frontend suites passed, including final seven analytics/saved-item tests. Worker/frontend typechecks and final build passed. Independent specification and quality review approved the implementation and scoped fix.

Concurrent SSR tests shared the running Vite optimizer cache and caused a development dependency 504. New tests isolate their cache. Root restarted only Vite using its direct CLI and `--force`, preserving Worker, chain, model, D1 and R2, then completed browser checks. Older SSR cache sharing remains a final workflow review item. Compressed JSX and the 1,027.51kB main chunk warning remain maintenance/performance items for final review.

These local Hardhat, D1/R2 and model-stub results do not prove real network settlement, public deployment, provider delivery or final cross-feature acceptance.
