-- Keep the existing table, identifiers, indexes and private R2 keys intact.
-- Both providers share its atomic admission and unique inflight account index.
ALTER TABLE github_import_jobs ADD COLUMN provider TEXT NOT NULL DEFAULT 'github' CHECK(provider IN ('github','website'));
ALTER TABLE github_import_jobs ADD COLUMN provenance TEXT NOT NULL DEFAULT '[]';
CREATE INDEX import_jobs_provider_owner ON github_import_jobs(provider,account_id,created_at);
