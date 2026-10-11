-- Bind collection metadata to the contract and chain used at registration.
-- Older rows remain unbound until explicitly verified and migrated.
ALTER TABLE collections ADD COLUMN chain_id INTEGER;
ALTER TABLE collections ADD COLUMN contract_address TEXT;
CREATE INDEX IF NOT EXISTS idx_collections_deployment_status
  ON collections(chain_id, contract_address, status, created_at);
