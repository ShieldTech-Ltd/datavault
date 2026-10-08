-- Fence a resumed query against writes from the Worker that lost its lease.
ALTER TABLE queries ADD COLUMN lease_token TEXT;
