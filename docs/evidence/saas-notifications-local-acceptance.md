# Notifications and operational status, local acceptance

Date: 9 October 2026. Candidate: 26ee386b3dc63afbe0d08518437fa9db1774f312. Locally accepted after four scoped review fixes; external configuration remains open.

## Browser acceptance to record

- [x] Signed-in original owner sees only its recorded registration, settlement or actual failure events.
- [x] Mark-read persists across reopening/navigation and retry does not create a duplicate item.
- [x] A second disposable wallet has isolated inbox state; signed-out access shows sign-in.
- [x] Explicit in-app opt-out suppresses new events; re-enabling does not deliver those suppressed events.
- [x] Account export includes supported own inbox metadata and excludes credentials, questions, source passages and answers.
- [x] Desktop and 390 px mobile controls fit the selected light dashboard.
- [x] Without adequate monitor observations, availability remains unknown with its sampling/coverage explanation.
- [x] A local fixed-origin monitor run observes actual local connectivity; local evidence is labelled and does not imply public monitoring, real-model readiness or payment health.

## Implementation and review evidence

Feature range 22c1c39..26ee386. Independent spec and quality reviews passed, including all four fix rounds. Migration 0013 was applied to populated local D1 without resetting it. Initial Worker suite passed 178 tests; changed adapters/account/status tests passed 25, monitor tests passed 3, final frontend suite passed 19. Both typechecks and frontend build passed. Detailed event evidence follows.

## External gates

Public monitor origin, authentication secret, deployment and cadence remain unconfigured. Provider-dependent email is separate. No observed uptime percentage or email-delivery claim follows from this local record.

## Initial browser regression

At f1e727a, the owner's persisted in-app preference was false, and the inbox was empty. Enabled it using keyboard Space and Enter; Settings saved appeared. Authored and published disposable local text titled Browser Inbox Acceptance. Confirmed collection: 0x2abe6d8084b728254144000217ea43cbe2e7fa96244469c998fb76332e2eb9a9. Registration transaction: 0x7713b3c68886886221b66c9abbc44280c6ed3a97f5acb6a4484a75fea1d6d21a.

Opening the inbox after confirmation still showed No notifications yet, reproducing the review's stale-inbox finding. Read-only local D1 inspection showed event_id 19, collection_registered, with that transaction/collection and original owner recipient; notify_in_app was 1. This head is not accepted. The existing event will be used to verify refresh behavior after the fix.

Pointer checkbox/save interactions required keyboard fallback in this browser environment. No pointer-interaction pass or product defect is inferred from that fallback alone.

## Fresh event after the functional fix

At d2c0cb6, marked the first entry read, closed and reopened the inbox: the entry remained read and the unread badge cleared. Published a fresh disposable collection, Browser Inbox Refresh Acceptance, without reloading the document. ID: 0x9cf884d387bc719a09905f746db718f1b31510f75e14bba521ebe89f10bff40f. Transaction: 0x45129b68dcd9ad4a942b7b82b4a76455b86994c4a1270a65967c4bbaa471f7b5.

Opening the inbox fetched the fresh entry and showed one unread notification plus the already-read first entry. Refresh retained exactly two distinct collection links, with no duplicated historical notification. At 390 by 844, document client and scroll widths both equalled 386. The dashboard showed Unknown, 0% observation coverage, Monitoring disabled, and explicit model/payment exclusion.

Independent scoped review passed all three functional fixes. Screenshot inspection found Refresh and Mark read still rendered as tiny native gray controls. Visual integration fix round 2 is required before acceptance. Desktop/mobile screenshots will be refreshed afterward.

## Preference, isolation, export and monitor checks

Switched from original owner to the second disposable wallet (0x70997970c51812dc3a010c7d01b50e0d17dc79c8). The previous owner's entries cleared; signed-out inbox required sign-in. After sign-in, it showed only that wallet's recorded rehearsal registrations and settled owner payouts, with exact 1000000000000000 wei per payout. Original owner's two browser-publication entries were absent.

Original owner disabled in-app delivery, then published Browser Inbox Suppression Acceptance without opening the inbox. ID: 0x2c413a18721d06cd78c125948dcb8712f0fbf97a2b843ea425efa36a8637614a. Transaction: 0x51a16298385f0b5826e8750d3f442acacd9e51e2847c6c0a6d7b72ca35416ad0. Re-enabled and opened the inbox: only the preceding two entries appeared. Read-only D1 verified event 23 state suppressed and no inbox row.

Downloaded datavault-account (1).json, 1182 bytes, through the account UI. File inspection verified the original owner and two notifications; no credential, signature, CSRF, question, answer-text or source-text fields were present. Export scope remained explicit.

A real local fixed-origin monitor run probed Worker8787 successfully (worker_api up). Ingestion was unconfigured, so its bounded nonsecret spool retained one observation; no shared observation was inserted and no availability percentage was claimed. Spool proof: TEMP/datavault-monitor-local-proof-1791554663316.json. Synthetic coverage/failure observations remained confined to isolated test databases.

The payout Request details link originally opened a buyer recovery screen that incorrectly addressed the payout owner as the payer. Public receipt endpoint for request 0xdff52dfe2cf6999146e229bb23bdeb7b79edcb80e7d92ffbef03ace04eb00944 returned settled, exact recorded amount and public receipt fields only. Fix round 3 uses Settlement receipt for owner payouts and retains actual buyer recovery navigation for failures/refundable events. Final scoped review and browser link verification pending.

## Final browser acceptance

At 26ee386, actual panel bounds were measured after the mobile containing-block fix: 390 px viewport/client386, left14/right371.60; 375/client370, left14/right356.40; 360/client355, left14/right341.20; 320/client315, left14/right301.20. All headings, buttons and collection links were inside those viewports, with no horizontal document overflow. Desktop panel remained 380 px wide within the 1531 px client viewport. Screenshots: Downloads/DataVault-SaaS-Notifications.png and Downloads/DataVault-SaaS-Notifications-Mobile.png. The failed prior mobile image is retained separately as DataVault-SaaS-Notifications-Mobile-Before-Fix.png.

Clicked the original owner's collection notification: internal navigation reached its collection while preserving the local wallet harness. Switched and signed in as the second wallet; its 15 recorded notifications stayed isolated. Every owner payout link was labelled Settlement receipt, targeted the existing public receipt endpoint and used a new tab with noreferrer. The corresponding settled receipt was independently verified above. Buyer failure recovery links are covered by the actual React interaction/render regression tests; no synthetic failure was inserted into shared browser data.

External monitor secret/cadence, Queue/cron bindings and provider email remain disabled or unconfigured. Local browser acceptance does not prove a production deployment or live provider delivery.

Hosted CI at snapshot ea4cc51 (PR #56) passed all eight checks. Worker job 113861613587/run37942911274 independently passed 21 test files and 182 tests with a clean install on Linux. Frontend, contract, package dry-run, credential guard, D1 invariants, release guards and production dependency audit also passed. Root monitor script tests remain local evidence until the final release tooling extends the current lib-only script CI glob.
