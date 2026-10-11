CREATE TABLE developer_keys (
 id TEXT PRIMARY KEY,
 account_id TEXT NOT NULL REFERENCES accounts(account_id),
 chain_id INTEGER NOT NULL,
 contract_address TEXT NOT NULL,
 workspace_id TEXT,
 name TEXT NOT NULL,
 secret_hash TEXT NOT NULL UNIQUE,
 display_prefix TEXT NOT NULL,
 scopes TEXT NOT NULL,
 collection_ids TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 revoked_at INTEGER
);
CREATE INDEX developer_keys_account ON developer_keys(account_id,created_at);
CREATE TABLE developer_key_audit (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 key_id TEXT NOT NULL,
 account_id TEXT NOT NULL,
 action TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE TRIGGER developer_key_created AFTER INSERT ON developer_keys BEGIN
 INSERT INTO developer_key_audit(key_id,account_id,action,created_at) VALUES(NEW.id,NEW.account_id,'created',NEW.created_at);
END;
CREATE TRIGGER developer_key_revoked AFTER UPDATE OF revoked_at ON developer_keys
WHEN OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL BEGIN
 INSERT INTO developer_key_audit(key_id,account_id,action,created_at) VALUES(NEW.id,NEW.account_id,'revoked',NEW.revoked_at);
END;
CREATE TABLE developer_key_minute (
 key_id TEXT NOT NULL REFERENCES developer_keys(id),
 timestamp INTEGER NOT NULL,
 claimed INTEGER NOT NULL DEFAULT 0,
 accepted INTEGER NOT NULL DEFAULT 0,
 rejected INTEGER NOT NULL DEFAULT 0,
 ownership_denied INTEGER NOT NULL DEFAULT 0,
 chain_unavailable INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(key_id,timestamp)
);
CREATE TABLE developer_key_daily (
 key_id TEXT NOT NULL REFERENCES developer_keys(id),
 timestamp INTEGER NOT NULL,
 accepted INTEGER NOT NULL DEFAULT 0,
 rejected INTEGER NOT NULL DEFAULT 0,
 ownership_denied INTEGER NOT NULL DEFAULT 0,
 chain_unavailable INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(key_id,timestamp)
);
CREATE INDEX developer_key_minute_retention ON developer_key_minute(timestamp);
CREATE INDEX developer_key_daily_retention ON developer_key_daily(timestamp);
