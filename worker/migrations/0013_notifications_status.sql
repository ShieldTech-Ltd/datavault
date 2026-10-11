CREATE TABLE notification_events (
 event_id INTEGER PRIMARY KEY AUTOINCREMENT, chain_id INTEGER NOT NULL, contract_address TEXT NOT NULL,
 event_type TEXT NOT NULL, source_id TEXT NOT NULL, recipient TEXT NOT NULL, collection_id TEXT NOT NULL,
 collection_name TEXT NOT NULL, amount_wei TEXT, created_at INTEGER NOT NULL,
 UNIQUE(chain_id,contract_address,event_type,source_id,recipient)
);
CREATE INDEX notification_recipient ON notification_events(chain_id,contract_address,recipient,event_id);
CREATE TABLE notification_deliveries (
 account_id TEXT NOT NULL, event_id INTEGER NOT NULL, state TEXT NOT NULL CHECK(state IN ('delivered','suppressed','retry')),
 attempts INTEGER NOT NULL DEFAULT 0, next_retry_at INTEGER NOT NULL DEFAULT 0, last_error TEXT,
 PRIMARY KEY(account_id,event_id)
);
CREATE TABLE notification_inbox (
 account_id TEXT NOT NULL,event_id INTEGER NOT NULL,read_at INTEGER,PRIMARY KEY(account_id,event_id)
);
CREATE TABLE notification_cursors (scope TEXT PRIMARY KEY,collection_cursor INTEGER NOT NULL DEFAULT 0,query_cursor INTEGER NOT NULL DEFAULT 0);
CREATE TABLE service_observations (
 chain_id INTEGER NOT NULL,contract_address TEXT NOT NULL,sample_at INTEGER NOT NULL,status TEXT NOT NULL CHECK(status IN ('up','down')),
 PRIMARY KEY(chain_id,contract_address,sample_at)
);
CREATE TRIGGER notification_registration AFTER UPDATE OF status ON collections
WHEN NEW.status='confirmed' AND NEW.confirmed_tx IS NOT NULL AND NEW.chain_id IS NOT NULL AND NEW.contract_address IS NOT NULL
BEGIN
 INSERT OR IGNORE INTO notification_events(chain_id,contract_address,event_type,source_id,recipient,collection_id,collection_name,created_at)
 VALUES(NEW.chain_id,lower(NEW.contract_address),'collection_registered',lower(NEW.confirmed_tx),lower(NEW.owner_address),NEW.collection_id,NEW.collection_name,NEW.created_at);
END;
CREATE TRIGGER notification_query AFTER UPDATE OF outcome ON queries
WHEN NEW.chain_id IS NOT NULL AND NEW.contract_address IS NOT NULL AND (NEW.outcome IN ('failed','refundable') OR (NEW.outcome='settled' AND NEW.settle_tx_hash IS NOT NULL))
BEGIN
 INSERT OR IGNORE INTO notification_events(chain_id,contract_address,event_type,source_id,recipient,collection_id,collection_name,amount_wei,created_at)
 SELECT NEW.chain_id,lower(NEW.contract_address),CASE WHEN NEW.outcome='settled' THEN 'payout_settled' ELSE 'query_'||NEW.outcome END,
 NEW.request_id,lower(CASE WHEN NEW.outcome='settled' THEN c.owner_address ELSE NEW.buyer_address END),NEW.collection_id,c.collection_name,NEW.amount_wei,coalesce(NEW.settled_at,NEW.created_at)
 FROM collections c WHERE c.collection_id=NEW.collection_id;
END;
CREATE INDEX notification_unread ON notification_inbox(account_id,read_at);
CREATE INDEX notification_delivery_retry ON notification_deliveries(account_id,state,next_retry_at,event_id);
CREATE INDEX notification_collection_recovery ON collections(chain_id,lower(contract_address));
CREATE INDEX notification_query_recovery ON queries(chain_id,lower(contract_address));
CREATE TRIGGER notification_preference_snapshot AFTER INSERT ON notification_events
BEGIN
 INSERT OR IGNORE INTO notification_deliveries(account_id,event_id,state,attempts)
 SELECT account_id,NEW.event_id,'suppressed',1 FROM accounts
 WHERE chain_id=NEW.chain_id AND contract_address=NEW.contract_address AND address=NEW.recipient AND notify_in_app=0;
END;
