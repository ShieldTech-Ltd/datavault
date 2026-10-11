CREATE TABLE connector_oauth_states (
 state_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(account_id),
 provider TEXT NOT NULL, deployment TEXT NOT NULL, session_hash TEXT NOT NULL,
 browser_hash TEXT NOT NULL, verifier TEXT NOT NULL, expires_at INTEGER NOT NULL,
 consumed_at INTEGER
);
CREATE INDEX connector_state_expiry ON connector_oauth_states(expires_at);
CREATE TABLE account_connectors (
 id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(account_id),
 provider TEXT NOT NULL, deployment TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('pending','connected','needs_reconnect','disconnected')),
 credential TEXT, credential_version INTEGER NOT NULL DEFAULT 1,
 repositories TEXT NOT NULL DEFAULT '[]', login TEXT,
 session_hash TEXT, browser_hash TEXT, pending_expires_at INTEGER,
 refresh_lease TEXT, refresh_expires_at INTEGER,
 revocation_pending INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 UNIQUE(account_id,provider,deployment)
);
ALTER TABLE github_import_jobs ADD COLUMN connection_id TEXT;
ALTER TABLE github_import_jobs ADD COLUMN credential_version INTEGER;
