-- Separate tx hash fields per lifecycle step and richer receipt data.
-- tx_hash is renamed to settle_tx_hash; open and refund hashes added.
-- chain_id and contract_address make receipts self-describing.
-- content_hash records the exact document version used during retrieval.

ALTER TABLE queries RENAME COLUMN tx_hash TO settle_tx_hash;
ALTER TABLE queries ADD COLUMN open_tx_hash TEXT;
ALTER TABLE queries ADD COLUMN refund_tx_hash TEXT;
ALTER TABLE queries ADD COLUMN chain_id INTEGER;
ALTER TABLE queries ADD COLUMN contract_address TEXT;
ALTER TABLE queries ADD COLUMN content_hash TEXT;
