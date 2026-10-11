CREATE TABLE github_import_jobs (
 id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(account_id),
 repository TEXT NOT NULL, ref TEXT NOT NULL, paths TEXT NOT NULL, commit_sha TEXT,
 status TEXT NOT NULL CHECK(status IN ('queued','running','review_ready','failed','cancelled','expired')),
 idempotency_key TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
 lease_token TEXT, lease_expires_at INTEGER, draft_key TEXT, content_digest TEXT,
 error TEXT, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX github_import_inflight ON github_import_jobs(account_id) WHERE status IN ('queued','running');
CREATE UNIQUE INDEX github_import_idempotent ON github_import_jobs(account_id,idempotency_key) WHERE status IN ('queued','running','review_ready');
CREATE INDEX github_import_owner ON github_import_jobs(account_id,created_at);
CREATE INDEX github_import_expiry ON github_import_jobs(expires_at);
