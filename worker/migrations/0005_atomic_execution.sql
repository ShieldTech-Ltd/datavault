-- Atomic execution claim support.
-- claimed_at:      Unix ms when a Worker instance claimed this requestId.
-- lease_expires_at: Unix ms after which a stale claim can be reclaimed.
-- answer_text:     Persisted model answer stored before the settlement tx is broadcast.
--                  Allows the buyer to recover the answer if the Worker crashes post-settlement.

ALTER TABLE queries ADD COLUMN claimed_at INTEGER;
ALTER TABLE queries ADD COLUMN lease_expires_at INTEGER;
ALTER TABLE queries ADD COLUMN answer_text TEXT;
