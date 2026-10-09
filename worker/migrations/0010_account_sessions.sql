CREATE TABLE accounts (
  account_id TEXT PRIMARY KEY,
  address TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  contract_address TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '' CHECK(length(display_name) <= 80),
  locale TEXT NOT NULL DEFAULT 'en-GB' CHECK(locale = 'en-GB'),
  notify_in_app INTEGER NOT NULL DEFAULT 1 CHECK(notify_in_app IN (0,1)),
  notify_email INTEGER NOT NULL DEFAULT 0 CHECK(notify_email = 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(address, chain_id, contract_address)
);
CREATE TABLE account_nonces (
  nonce TEXT PRIMARY KEY,
  address TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  contract_address TEXT NOT NULL,
  origin TEXT NOT NULL,
  message TEXT NOT NULL,
  browser_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER
);
CREATE INDEX account_nonces_expiry ON account_nonces(expires_at);
CREATE TABLE account_sessions (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(account_id),
  csrf_token TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX account_sessions_expiry ON account_sessions(expires_at);
CREATE TABLE account_deletion_requests (
  request_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(account_id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status = 'pending'),
  created_at INTEGER NOT NULL,
  UNIQUE(account_id, status)
);
