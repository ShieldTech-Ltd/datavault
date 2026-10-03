-- DataVault D1 schema
-- Apply with: wrangler d1 migrations apply datavault-db [--local]

CREATE TABLE IF NOT EXISTS collections (
  collection_id TEXT PRIMARY KEY,         -- bytes32 hex, same as on-chain
  owner_address TEXT NOT NULL,
  collection_name TEXT NOT NULL,
  content_hash TEXT NOT NULL,             -- keccak256 of document content
  policy_version INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,      -- 1 = active, 0 = paused (mirrors on-chain)
  created_at INTEGER NOT NULL             -- unix timestamp
);

CREATE TABLE IF NOT EXISTS queries (
  request_id TEXT PRIMARY KEY,            -- bytes32 hex, same as on-chain
  collection_id TEXT NOT NULL,
  buyer_address TEXT NOT NULL,
  tx_hash TEXT,                           -- openQuery tx hash
  policy_version INTEGER NOT NULL,
  passage_ids TEXT NOT NULL DEFAULT '[]', -- JSON array of passage identifiers
  response_digest TEXT,                   -- sha256 of the answer text
  outcome TEXT NOT NULL DEFAULT 'pending',-- pending | settled | refunded | failed | denied
  created_at INTEGER NOT NULL,
  settled_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_queries_collection ON queries(collection_id);
CREATE INDEX IF NOT EXISTS idx_queries_buyer ON queries(buyer_address);
