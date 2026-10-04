-- Rate limiting: one row per (endpoint bucket, caller IP).
-- window_start is a Unix timestamp (seconds). count resets when the window expires.
CREATE TABLE IF NOT EXISTS rate_limits (
  key          TEXT    NOT NULL PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL DEFAULT 1
);
