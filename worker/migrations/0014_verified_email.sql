-- The legacy accounts.notify_email CHECK=0 stays intact. This additive table is
-- canonical for verified email and explicit transactional notification consent.
CREATE TABLE account_email (
 account_id TEXT PRIMARY KEY REFERENCES accounts(account_id),
 verified_email TEXT, verified_at INTEGER, email_version INTEGER NOT NULL DEFAULT 0,
 notify_email INTEGER NOT NULL DEFAULT 0 CHECK(notify_email IN (0,1)),
 consent_version INTEGER NOT NULL DEFAULT 0, opt_in_at INTEGER, opt_in_event_id INTEGER,
 CHECK(notify_email=0 OR (verified_email IS NOT NULL AND verified_at IS NOT NULL AND opt_in_at IS NOT NULL))
);
CREATE TABLE email_challenges (
 token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(account_id),
 email TEXT NOT NULL, email_version INTEGER NOT NULL, origin TEXT NOT NULL,
 chain_id INTEGER NOT NULL, contract_address TEXT NOT NULL, ip_hash TEXT NOT NULL,
 created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('pending','accepted','send_failed','revoked','consumed')),
 consumed_by TEXT, provider_message_id TEXT
);
CREATE INDEX email_challenge_account ON email_challenges(account_id,created_at);
CREATE INDEX email_challenge_ip ON email_challenges(ip_hash,created_at);
CREATE TABLE email_outbox (
 outbox_id INTEGER PRIMARY KEY AUTOINCREMENT, account_id TEXT NOT NULL, event_id INTEGER NOT NULL,
 email_version INTEGER NOT NULL, consent_version INTEGER NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sending','accepted','retry','suppressed','dead_letter')),
 attempts INTEGER NOT NULL DEFAULT 0, next_retry_at INTEGER NOT NULL DEFAULT 0,
 lease_token TEXT, lease_expires_at INTEGER, provider_message_id TEXT, last_error TEXT,
 UNIQUE(account_id,event_id,email_version)
);
CREATE INDEX email_outbox_ready ON email_outbox(account_id,state,next_retry_at,lease_expires_at);
