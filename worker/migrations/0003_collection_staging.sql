-- Add staging lifecycle to collections.
-- A collection starts as 'staging' when the owner uploads content and receives calldata.
-- It becomes 'confirmed' when the owner calls POST /api/collections/:id/confirm
-- with the on-chain registration tx hash, and the Worker verifies the on-chain state.
-- 'orphaned' marks staging rows that were never confirmed within the expiry window.

ALTER TABLE collections ADD COLUMN status TEXT NOT NULL DEFAULT 'confirmed';
ALTER TABLE collections ADD COLUMN staged_at INTEGER;
ALTER TABLE collections ADD COLUMN confirmed_tx TEXT;

-- Backfill existing rows (all pre-staging rows are already confirmed)
UPDATE collections SET status = 'confirmed' WHERE status = 'confirmed';
