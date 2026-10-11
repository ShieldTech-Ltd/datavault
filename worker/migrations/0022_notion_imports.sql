-- Jobs have no incoming foreign keys. Rebuild their provider CHECK while keeping
-- account foreign keys enabled, IDs, object keys and every existing index.
CREATE TABLE notion_import_jobs_migration (
 id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(account_id),
 repository TEXT NOT NULL, ref TEXT NOT NULL, paths TEXT NOT NULL, commit_sha TEXT,
 status TEXT NOT NULL CHECK(status IN ('queued','running','review_ready','failed','cancelled','expired')),
 idempotency_key TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
 lease_token TEXT, lease_expires_at INTEGER, draft_key TEXT, content_digest TEXT,
 error TEXT, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
 connection_id TEXT, credential_version INTEGER,
 provider TEXT NOT NULL DEFAULT 'github' CHECK(provider IN ('github','website','notion')),
 provenance TEXT NOT NULL DEFAULT '[]'
);
INSERT INTO notion_import_jobs_migration SELECT * FROM github_import_jobs;
DROP TABLE github_import_jobs;
ALTER TABLE notion_import_jobs_migration RENAME TO github_import_jobs;
CREATE UNIQUE INDEX github_import_inflight ON github_import_jobs(account_id) WHERE status IN ('queued','running');
CREATE UNIQUE INDEX github_import_idempotent ON github_import_jobs(account_id,idempotency_key) WHERE status IN ('queued','running','review_ready');
CREATE INDEX github_import_owner ON github_import_jobs(account_id,created_at);
CREATE INDEX github_import_expiry ON github_import_jobs(expires_at);
CREATE INDEX import_jobs_provider_owner ON github_import_jobs(provider,account_id,created_at);
