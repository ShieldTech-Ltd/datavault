CREATE TABLE workspaces (
 id TEXT PRIMARY KEY, chain_id INTEGER NOT NULL, contract_address TEXT NOT NULL,
 name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 80), created_at INTEGER NOT NULL,
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1))
);
CREATE TABLE workspace_members (
 workspace_id TEXT NOT NULL REFERENCES workspaces(id), address TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('Owner','Editor','Viewer')), joined_at INTEGER NOT NULL,
 PRIMARY KEY(workspace_id,address)
);
CREATE TABLE workspace_invitations (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), address TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('Owner','Editor','Viewer')), inviter TEXT NOT NULL,
 created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, accepted_at INTEGER, revoked_at INTEGER
);
CREATE UNIQUE INDEX workspace_invite_pending ON workspace_invitations(workspace_id,address)
 WHERE accepted_at IS NULL AND revoked_at IS NULL;
CREATE INDEX workspace_member_wallet ON workspace_members(address,workspace_id);
CREATE INDEX workspace_invite_wallet ON workspace_invitations(address,expires_at);
CREATE TABLE workspace_grants (
 workspace_id TEXT NOT NULL REFERENCES workspaces(id), collection_id TEXT NOT NULL,
 grantor TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(workspace_id,collection_id)
);
CREATE TABLE workspace_audit (
 id INTEGER PRIMARY KEY AUTOINCREMENT, workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 actor TEXT NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TRIGGER workspace_last_owner_delete BEFORE DELETE ON workspace_members
 WHEN OLD.role='Owner' AND (SELECT COUNT(*) FROM workspace_members WHERE workspace_id=OLD.workspace_id AND role='Owner')<=1
 BEGIN SELECT RAISE(ABORT,'last workspace Owner'); END;
CREATE TRIGGER workspace_last_owner_update BEFORE UPDATE OF role ON workspace_members
 WHEN OLD.role='Owner' AND NEW.role!='Owner' AND (SELECT COUNT(*) FROM workspace_members WHERE workspace_id=OLD.workspace_id AND role='Owner')<=1
 BEGIN SELECT RAISE(ABORT,'last workspace Owner'); END;
CREATE TRIGGER workspace_member_cap BEFORE INSERT ON workspace_members
 WHEN NOT EXISTS(SELECT 1 FROM workspace_members WHERE workspace_id=NEW.workspace_id AND address=NEW.address)
 AND (SELECT COUNT(*) FROM workspace_members WHERE workspace_id=NEW.workspace_id)>=50
 BEGIN SELECT RAISE(ABORT,'workspace member limit'); END;
CREATE TRIGGER workspace_owner_cap BEFORE INSERT ON workspace_members
 WHEN NEW.role='Owner' AND (SELECT COUNT(*) FROM workspace_members m JOIN workspaces w ON w.id=m.workspace_id WHERE m.address=NEW.address AND m.role='Owner' AND w.active=1 AND w.chain_id=(SELECT chain_id FROM workspaces WHERE id=NEW.workspace_id) AND w.contract_address=(SELECT contract_address FROM workspaces WHERE id=NEW.workspace_id))>=5
 BEGIN SELECT RAISE(ABORT,'workspace Owner limit'); END;
CREATE TRIGGER workspace_owner_update_cap BEFORE UPDATE OF role ON workspace_members
 WHEN NEW.role='Owner' AND OLD.role!='Owner' AND (SELECT COUNT(*) FROM workspace_members m JOIN workspaces w ON w.id=m.workspace_id WHERE m.address=NEW.address AND m.role='Owner' AND w.active=1 AND w.chain_id=(SELECT chain_id FROM workspaces WHERE id=NEW.workspace_id) AND w.contract_address=(SELECT contract_address FROM workspaces WHERE id=NEW.workspace_id))>=5
 BEGIN SELECT RAISE(ABORT,'workspace Owner limit'); END;
CREATE TRIGGER workspace_invite_cap BEFORE INSERT ON workspace_invitations
 WHEN (SELECT COUNT(*) FROM workspace_invitations WHERE workspace_id=NEW.workspace_id AND accepted_at IS NULL AND revoked_at IS NULL)>=50
 BEGIN SELECT RAISE(ABORT,'workspace invitation limit'); END;
CREATE TRIGGER workspace_owner_deleted AFTER DELETE ON workspace_members BEGIN
 DELETE FROM workspace_grants WHERE workspace_id=OLD.workspace_id AND grantor=OLD.address;
 UPDATE developer_keys SET revoked_at=COALESCE(revoked_at,CAST(strftime('%s','now') AS INTEGER)*1000) WHERE workspace_id=OLD.workspace_id AND account_id IN(SELECT account_id FROM accounts WHERE address=OLD.address);
 UPDATE workspace_invitations SET revoked_at=COALESCE(revoked_at,CAST(strftime('%s','now') AS INTEGER)*1000) WHERE workspace_id=OLD.workspace_id AND inviter=OLD.address AND accepted_at IS NULL;
 END;
CREATE TRIGGER workspace_owner_demoted AFTER UPDATE OF role ON workspace_members WHEN OLD.role='Owner' AND NEW.role!='Owner' BEGIN
 DELETE FROM workspace_grants WHERE workspace_id=OLD.workspace_id AND grantor=OLD.address;
 UPDATE developer_keys SET revoked_at=COALESCE(revoked_at,CAST(strftime('%s','now') AS INTEGER)*1000) WHERE workspace_id=OLD.workspace_id AND account_id IN(SELECT account_id FROM accounts WHERE address=OLD.address);
 UPDATE workspace_invitations SET revoked_at=COALESCE(revoked_at,CAST(strftime('%s','now') AS INTEGER)*1000) WHERE workspace_id=OLD.workspace_id AND inviter=OLD.address AND accepted_at IS NULL;
 END;
