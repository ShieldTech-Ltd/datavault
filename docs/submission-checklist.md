# Metropolis submission evidence checklist

Internal target: 12 October 2026. The participant-provided Terms v3 state a final deadline of 13 October 2026 at 11:59 PM Eastern. Recheck the authenticated portal because organizer terms may change. The [Rise In event listing](https://www.risein.com/monad/monad-metropolis-hackathon) itself displays 12 October in its deadline field and 13 October in its timeline. This checklist does not claim that the project has been submitted.

## Required evidence

| Requirement | Proof to record | Current state |
|---|---|---|
| One track | Confirm Trust, Identity and AI Infrastructure in the portal; describe the reusable paid-query API and the buyer app as its reference client. | Chosen in README; portal confirmation missing. |
| Working Monad product | Public HTTPS site, chain ID, deployed contract, registration, opening, settlement, pause, and refund transaction links. | Live evidence missing. |
| Public source | GitHub URL, OSI-approved MIT license, README setup, architecture, stack, attribution, AI coding tool disclosure, and build-window history. | Source prepared; combined PRs and final public audit pending. |
| Demo video | Public URL, at most three minutes, real app operation, and visible Monad interactions. | Not recorded. |
| Documentation | Project problem, intended user, architecture, Monad purpose, setup and deployment instructions, contract address, and judge quickstart. | Draft source documentation exists; real addresses and URLs missing. |
| Rights and safety | Permission for sample content and assets, no credentials or private user data in source or video, and honest limitations. | Sample and final artifact review pending. |

## Freeze and submit

1. Merge approved contributor PRs, #48, and stacked #49. Record the final commit and pass all required CI and Security checks.
2. Resolve the frontend dependency audit, replace placeholder deployment configuration, verify secrets by name without exposing values, and run `npm run check:release-config`.
3. Complete the live acceptance list in [deployment.md](deployment.md), including three paid queries, fresh-wallet onboarding, recovery, pause denial, and genuine refund. Record redacted transaction evidence and actual completion times.
4. Record and publish the real video from [demo-script.md](demo-script.md). Run `npm run check:release-config -- --submission` with public URLs and transaction identifiers, then open every URL in a clean browser.
5. Prepare the portal entry with the selected track, public repo, site, video, contract, Monad explanation, and known limitations. Review the final entry against the portal's current fields and terms before submitting.
6. Record the portal confirmation and timestamp after an authorized submission. A prepared form or uploaded video is not submission proof.

The public demo must remain available during the verified judging period with funded testnet operation, model quota, manual smoke checks, and an incident owner. Do not promise uptime that the provider has not guaranteed.
