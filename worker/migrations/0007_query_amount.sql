-- Preserve the exact escrow amount for product analytics. Older rows remain NULL.
ALTER TABLE queries ADD COLUMN amount_wei TEXT;
CREATE INDEX IF NOT EXISTS idx_queries_outcome_settled ON queries(outcome, settled_at);
CREATE INDEX IF NOT EXISTS idx_collections_status_created ON collections(status, created_at);
