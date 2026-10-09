CREATE TABLE connector_cleanup_obligations (
 id TEXT PRIMARY KEY,
 account_id TEXT NOT NULL REFERENCES accounts(account_id),
 provider TEXT NOT NULL,
 deployment TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE INDEX connector_cleanup_owner ON connector_cleanup_obligations(account_id,provider,deployment);
