CREATE TABLE collection_metadata (
 chain_id INTEGER NOT NULL,
 contract_address TEXT NOT NULL,
 collection_id TEXT NOT NULL,
 description TEXT NOT NULL DEFAULT '' CHECK(length(description) <= 2000),
 category TEXT NOT NULL DEFAULT 'General' CHECK(category IN ('General','Technology','Business','Research','Education','Finance','Legal','Other')),
 visibility TEXT NOT NULL DEFAULT 'public' CHECK(visibility IN ('public','unlisted')),
 updated_at INTEGER NOT NULL,
 PRIMARY KEY(chain_id, contract_address, collection_id)
);
