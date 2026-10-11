# Verified transactional email

Email is disabled in the active configurations. The native `EMAIL.send` adapter
requires an Email Sending binding, a privately configured `EMAIL_FROM` sender,
an exact HTTPS `PUBLIC_ORIGIN` and an `EMAIL_LINK_SECRET` of at least 32 bytes.
Do not use an incoming Host header to configure links. The optional
`worker/wrangler.email.example.toml` is an unconfigured packaging example.
No sender domain, provider credentials or real delivery were activated here.

## Account confirmation and consent

The signed wallet session, same-origin check and CSRF authorize email creation,
verification and removal. A random 256-bit challenge expires after 15 minutes,
is stored as a digest, binds the account, deployment, normalized address and
trusted origin, and becomes usable only after provider acceptance. Reservation
enforces a 60-second cooldown and five attempts per rolling hour for each account
and hashed IP. Tokens travel only in transient verification-message fragments.
Opening the page never consumes a challenge. The owning wallet must sign in and
explicitly confirm. The frontend erases its fragment after a confirmation attempt
and keeps no token in localStorage.

Verification leaves email notifications off. Consent is an explicit checkbox for
future collection registration and settled payout events. `account_email` is the
canonical additive email record. The legacy `accounts.notify_email` constraint
and wallet session/payment data are preserved. Session profiles, PATCH and account
export consistently read the canonical email record. Export contains only the
own verified address/status, not pending addresses, challenge digests, tokens or
private provider message IDs.

Consent records a timestamp, event watermark and version. An event must be newer
than the current opt-in in both time and event ID. Re-enabling does not send old
events, including old registrations discovered by later reconciliation. Events
at the exact opt-in millisecond are conservatively excluded. Replacing or removing
an address revokes challenges and consent, increments the address version and
suppresses old queued deliveries. In-app preferences remain independent.

## Delivery and unsubscribe

Persisted notification events feed a unique event/account/address-version outbox.
Recovery enqueues at most fifty new rows per account per pass, excluding already
queued events so later events can progress. Each consumer processes at most ten
email rows, with atomic claims, random fencing
leases, five attempts and exponential retry delay capped at one hour. Failed final
attempts enter `dead_letter`. Claims that crash on their final lease become terminal
after expiry. Eligibility, address version and consent version are rechecked before
send. Withdrawal suppresses queued rows. An already in-flight external submission
cannot be recalled.

A private provider `messageId` records acceptance, not delivery or an on-chain
receipt. Queue acknowledgements follow persisted acceptance or terminal suppression
or dead-letter disposition; nonterminal email work retries. There is no provider
idempotency guarantee. A crash after provider acceptance and before the D1 record
can cause duplicate external mail when its lease expires. Fencing prevents stale
consumers from overwriting newer D1 claims, but cannot undo external sends.

Messages contain fixed safe descriptions and links, without source, question,
answer, collection name or personal display name. Unsubscribe capabilities use
HMAC-SHA256 with purpose, account, deployment and trusted origin. They grant only
email-consent withdrawal, not account data access or in-app preference changes.
The landing page requires explicit confirmation. Link GET never unsubscribes.
The public POST endpoint also supports RFC 8058 form posts from mail clients.
`List-Unsubscribe` contains an angle-bracket HTTPS endpoint and
`List-Unsubscribe-Post` is `List-Unsubscribe=One-Click`.

## Configuration and evidence limits

After authorized private sender configuration, copy reviewed binding settings to
the actual deployment configuration and regenerate binding types with its installed
Wrangler. Do not upgrade dependencies just to match examples. Verify sender domain,
recipient restrictions, deployment compatibility and actual inbox delivery as
separate release gates. Schedule/queue enablement remains a separate operator
choice; no provider setup or outbound email command ran for this implementation.

Tests use a clearly labelled in-process fake native binding and real SQLite SQL.
They prove application logic, not provider or inbox delivery. The installed
Wrangler 3.114.17 and workers types were inspected. The types expose structured
`SendEmail.send` and `EmailSendResult.messageId`; this does not establish that the
old local Wrangler simulator supports the current structured runtime API. Current
Cloudflare docs say local simulation can log email content and save it to files,
so private verification links must not be exercised through an unreviewed simulator
or included in console logs, screenshots or reports.

Primary sources retrieved on 2026-10-09:

- [Workers sending API](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/), updated 2026-09-16.
- [Binding restrictions](https://developers.cloudflare.com/email-service/configuration/send-bindings/).
- [Email headers and allowlist](https://developers.cloudflare.com/email-service/reference/headers/).
- [Local sending and simulator limits](https://developers.cloudflare.com/email-service/local-development/sending/).
