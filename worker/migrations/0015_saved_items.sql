CREATE TABLE account_bookmarks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL,
  collection_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(account_id, collection_id)
);
CREATE INDEX idx_bookmarks_account ON account_bookmarks(account_id,id);
CREATE TABLE account_saved_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL,
  collection_id TEXT NOT NULL,
  question TEXT NOT NULL CHECK(length(question) BETWEEN 1 AND 1000),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_saved_questions_account ON account_saved_questions(account_id,id,expires_at);
CREATE INDEX idx_saved_questions_expiry ON account_saved_questions(expires_at);
