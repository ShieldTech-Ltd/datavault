-- Immutable revision links are deployment scoped. One SQL statement, including
-- its triggers, either advances the family completely or rolls back completely.
CREATE TABLE collection_revision_families (
 chain_id INTEGER NOT NULL,
 contract_address TEXT NOT NULL,
 original_collection_id TEXT NOT NULL,
 owner_address TEXT NOT NULL,
 current_collection_id TEXT NOT NULL,
 current_ordinal INTEGER NOT NULL CHECK(current_ordinal >= 1),
 PRIMARY KEY(chain_id, contract_address, original_collection_id)
);
CREATE TABLE collection_revision_members (
 chain_id INTEGER NOT NULL,
 contract_address TEXT NOT NULL,
 collection_id TEXT NOT NULL,
 original_collection_id TEXT NOT NULL,
 parent_collection_id TEXT,
 owner_address TEXT NOT NULL,
 ordinal INTEGER NOT NULL CHECK(ordinal >= 1),
 linked_at INTEGER NOT NULL,
 PRIMARY KEY(chain_id, contract_address, collection_id),
 UNIQUE(chain_id, contract_address, original_collection_id, ordinal),
 UNIQUE(chain_id, contract_address, parent_collection_id),
 FOREIGN KEY(chain_id, contract_address, original_collection_id)
 REFERENCES collection_revision_families(chain_id, contract_address, original_collection_id),
 CHECK((ordinal = 1 AND parent_collection_id IS NULL AND collection_id = original_collection_id)
    OR (ordinal > 1 AND parent_collection_id IS NOT NULL AND collection_id != parent_collection_id))
);
CREATE TRIGGER revision_member_guard BEFORE INSERT ON collection_revision_members
BEGIN
 SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM collections c WHERE c.collection_id = NEW.collection_id
   AND c.chain_id = NEW.chain_id AND c.contract_address = NEW.contract_address
   AND c.status = 'confirmed' AND c.owner_address = NEW.owner_address
 ) THEN RAISE(ABORT, 'revision confirmed owner required') END;
 SELECT CASE WHEN NEW.ordinal > 1 AND NOT EXISTS (
  SELECT 1 FROM collections c WHERE c.collection_id = NEW.parent_collection_id
   AND c.chain_id = NEW.chain_id AND c.contract_address = NEW.contract_address
   AND c.status = 'confirmed' AND c.owner_address = NEW.owner_address
 ) THEN RAISE(ABORT, 'revision confirmed parent required') END;
 -- Initial family/root insertion is inside this statement's transaction.
 INSERT INTO collection_revision_families
 SELECT NEW.chain_id, NEW.contract_address, NEW.original_collection_id,
        NEW.owner_address, NEW.parent_collection_id, 1
 WHERE NEW.ordinal = 2 AND NEW.original_collection_id = NEW.parent_collection_id
 AND NOT EXISTS(SELECT 1 FROM collection_revision_members WHERE chain_id=NEW.chain_id
  AND contract_address=NEW.contract_address AND collection_id=NEW.parent_collection_id)
 AND NOT EXISTS(SELECT 1 FROM collection_revision_families WHERE chain_id=NEW.chain_id
  AND contract_address=NEW.contract_address AND original_collection_id=NEW.original_collection_id);
 INSERT INTO collection_revision_members
 SELECT NEW.chain_id, NEW.contract_address, NEW.parent_collection_id,
        NEW.original_collection_id, NULL, NEW.owner_address, 1, NEW.linked_at
 WHERE NEW.ordinal = 2 AND NEW.original_collection_id = NEW.parent_collection_id
 AND NOT EXISTS(SELECT 1 FROM collection_revision_members WHERE chain_id=NEW.chain_id
  AND contract_address=NEW.contract_address AND collection_id=NEW.parent_collection_id);
 SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM collection_revision_families f
   WHERE f.chain_id=NEW.chain_id AND f.contract_address=NEW.contract_address
   AND f.original_collection_id=NEW.original_collection_id AND f.owner_address=NEW.owner_address
   AND ((NEW.ordinal=1 AND f.current_collection_id=NEW.collection_id AND f.current_ordinal=1)
    OR (NEW.ordinal>1 AND f.current_collection_id=NEW.parent_collection_id AND f.current_ordinal=NEW.ordinal-1
     AND EXISTS(SELECT 1 FROM collection_revision_members p WHERE p.chain_id=NEW.chain_id
      AND p.contract_address=NEW.contract_address AND p.collection_id=NEW.parent_collection_id
      AND p.original_collection_id=NEW.original_collection_id AND p.ordinal=NEW.ordinal-1)))
 ) THEN RAISE(ABORT, 'revision stale parent') END;
END;
CREATE TRIGGER revision_family_advance AFTER INSERT ON collection_revision_members
WHEN NEW.ordinal > 1
BEGIN
 UPDATE collection_revision_families SET current_collection_id=NEW.collection_id, current_ordinal=NEW.ordinal
 WHERE chain_id=NEW.chain_id AND contract_address=NEW.contract_address
 AND original_collection_id=NEW.original_collection_id
 AND current_collection_id=NEW.parent_collection_id AND current_ordinal=NEW.ordinal-1;
 SELECT CASE WHEN changes()!=1 THEN RAISE(ABORT, 'revision stale parent') END;
END;
