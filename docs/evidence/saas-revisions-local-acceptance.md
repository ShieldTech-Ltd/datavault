# Immutable collection revisions, local acceptance

Date: 9 October 2026. Feature candidate `5ceba0a02755b91610c627954823ed06b1b1321e` received positive-path browser acceptance. Independent review identified a transaction-return recovery blocker; this document does not accept that head until the fix and scoped review are recorded below.

The populated local D1 received migration 0012 without resetting prior collections or paid records. The disposable Hardhat chain, Worker, D1, R2 and HTTPS model stub were used. These results do not establish public-network or real-model readiness.

## Publication and history

The owner published reviewed text titled Browser Acceptance Knowledge v2 through the existing paid registration flow. The new collection ID is `0x70a2e4ab3690dd91965ac724eadeb1f97fcb47344b0363aef13ef4018e4ad0a9`. It was linked as revision 2 of original collection `0xb9d0e79ff14147bc7861965f54022d25da2818b0b086a9f0df725de789879e85`. History showed revision 1 and current revision 2. The original collection remained active at policy version 5; publication did not automatically pause or alter its policy.

Setting revision 2 to unlisted and opening the original detail as a fresh buyer showed only revision 1 and the notice that a newer unlisted revision exists. The new ID, title and current-revision link were absent. Owner visibility was restored to public afterward.

## Original paid answer recovery

A fresh buyer recovered request `0x519ad40331ebc6d62150befadf76ce7117ca0ad413094fada19d6c244733629f` without another payment. The UI verified its stored answer digest. The recovered answer remained: The guide says to keep clear records, citing original passage `0xe9e69e523c5418551d979b111b535855dc2ad9c9b080a5446d610bee8addd9d2:chunk-0`.

Opening transaction: `0x8ba26395e4f8e3e55a37e0714c61dc1b0baa013c4bf8d9c997d2bcda3d1c9e0b`. Settlement: `0x301ec602f594edac510e1f9832272f5d99d26c37743fe509ef8a6c25ef01071b`. Stored digest: `sha256:91dfde748be52668c2fea08d0e895924b2a66a5d8e06a3ad151b696e3d20ef8d`.

Read-only D1 inspection confirmed the request paid content hash still equals the original collection hash `0xe9e69e523c5418551d979b111b535855dc2ad9c9b080a5446d610bee8addd9d2`, with unchanged amount `1000000000000000` wei. New source text did not replace the old receipt's source.

## Checks and limitations

The implementation reported 168 Worker tests, 11 frontend tests, both typechecks and frontend build passing. Root reran the full local rehearsal after this feature: all 19 checks passed, covering registration, escrow, buyer authorization, cited answer, confirmed settlement and payout, interrupted-query recovery, history/analytics, pause denial and timeout refund.

Screenshots are in Downloads: DataVault-SaaS-Revision-History.png and DataVault-SaaS-Revision-Old-Answer-Recovery.png. Viewport screenshots were reliable; full-page capture intermittently hit a browser automation timeout. A disclosure checkbox required keyboard Space after a pointer action did not change its checked state. No pointer-interaction pass is claimed for that action.

## Recovery review gate

Pending: persist a submitted registration under its original owner before wallet/unmount fencing, then prove original-owner recovery of the same transaction. Positive browser evidence above does not cover this negative path. Final fix commit, covering tests and scoped independent review will be recorded before accepting this phase.
Root additionally checked revision controls at 390 by 844: document client and scroll widths both 386 pixels, no horizontal overflow. Viewport screenshot saved as DataVault-SaaS-Revision-History-Mobile.png, then viewport override reset.

Fix candidate: `30a64818eb037276d4fc9254d811dbdf646d4d8b`. Actual OwnerDashboard component tests first failed on the missing persisted transaction, then passed wallet switch, network switch and unmount recovery. Six covering tests also prove ordinary-screen revision recovery with parent provenance, legacy storage migration, preservation of another owner's pending record and no repeated upload/payment. All 17 frontend tests, typecheck and production build passed after non-destructive dependency repair. Clean local npm ci was blocked by Windows locking live esbuild.exe; it was not claimed as passing. Exact-head remote CI is the clean-install gate. Independent scoped review is pending.

Independent scoped review passed the P1 fix at `30a6481` with no new actionable findings. The reviewer independently ran the six component tests, all passing. Root inspected the refreshed local revision dashboard after the fix and saved its screenshot. Phase 2B is locally accepted. Public network, real model and remote provider acceptance remain open.
