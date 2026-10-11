CREATE TABLE billing_accounts (
 account_id TEXT PRIMARY KEY REFERENCES accounts(account_id),
 customer_id TEXT UNIQUE,
 mode TEXT NOT NULL DEFAULT 'test' CHECK(mode='test'),
 subscription_id TEXT,
 price_id TEXT,
 status TEXT NOT NULL DEFAULT 'none',
 period_end INTEGER NOT NULL DEFAULT 0,
 cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
 verified_at INTEGER NOT NULL DEFAULT 0,
 limits_json TEXT NOT NULL DEFAULT '{}',
 lease_token TEXT,
 lease_until INTEGER NOT NULL DEFAULT 0,
 checkout_id TEXT,
 checkout_key TEXT,
 checkout_url TEXT,
 checkout_expires INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE billing_events (
 event_id TEXT NOT NULL,
 mode TEXT NOT NULL CHECK(mode='test'),
 customer_id TEXT,
 state TEXT NOT NULL CHECK(state IN ('pending','done','ignored')),
 attempts INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL,
 completed_at INTEGER,
 PRIMARY KEY(event_id,mode)
);
CREATE INDEX billing_events_customer ON billing_events(customer_id,state);
ALTER TABLE workspaces ADD COLUMN billing_account_id TEXT REFERENCES accounts(account_id);
UPDATE workspaces SET billing_account_id=(SELECT a.account_id FROM workspace_audit audit JOIN accounts a ON a.address=audit.actor AND a.chain_id=workspaces.chain_id AND a.contract_address=workspaces.contract_address WHERE audit.workspace_id=workspaces.id AND audit.action='created' ORDER BY audit.id LIMIT 1);

-- Database triggers remain a second atomic guard. Route statements additionally require
-- the currently configured price and caps, so disabling or changing configuration fails closed.
CREATE VIEW billing_current_limits AS SELECT account_id,
 json_extract(limits_json,'$.ownedWorkspaces') AS owned_workspaces,
 json_extract(limits_json,'$.workspaceMembers') AS workspace_members
 FROM billing_accounts WHERE mode='test' AND status IN ('active','trialing')
 AND period_end>CAST(ROUND((julianday('now')-2440587.5)*86400000) AS INTEGER)
 AND verified_at>CAST(ROUND((julianday('now')-2440587.5)*86400000) AS INTEGER)-900000
 AND verified_at<=CAST(ROUND((julianday('now')-2440587.5)*86400000) AS INTEGER)+1000
 AND json_valid(limits_json)
 AND json_extract(limits_json,'$.ownedWorkspaces') BETWEEN 5 AND 100
 AND json_extract(limits_json,'$.workspaceMembers') BETWEEN 50 AND 500;
DROP TRIGGER workspace_member_cap;
CREATE TRIGGER workspace_member_cap BEFORE INSERT ON workspace_members
 WHEN NOT EXISTS(SELECT 1 FROM workspace_members WHERE workspace_id=NEW.workspace_id AND address=NEW.address)
 AND (SELECT COUNT(*) FROM workspace_members WHERE workspace_id=NEW.workspace_id)>=COALESCE((SELECT l.workspace_members FROM billing_current_limits l JOIN workspaces w ON w.billing_account_id=l.account_id WHERE w.id=NEW.workspace_id),50)
 BEGIN SELECT RAISE(ABORT,'workspace member limit'); END;
DROP TRIGGER workspace_owner_cap;
CREATE TRIGGER workspace_owner_cap BEFORE INSERT ON workspace_members
 WHEN NEW.role='Owner' AND (SELECT COUNT(*) FROM workspace_members m JOIN workspaces w ON w.id=m.workspace_id WHERE m.address=NEW.address AND m.role='Owner' AND w.active=1 AND w.chain_id=(SELECT chain_id FROM workspaces WHERE id=NEW.workspace_id) AND w.contract_address=(SELECT contract_address FROM workspaces WHERE id=NEW.workspace_id))>=COALESCE((SELECT l.owned_workspaces FROM billing_current_limits l JOIN accounts a ON a.account_id=l.account_id JOIN workspaces w ON w.chain_id=a.chain_id AND w.contract_address=a.contract_address WHERE a.address=NEW.address AND w.id=NEW.workspace_id),5)
 BEGIN SELECT RAISE(ABORT,'workspace Owner limit'); END;
CREATE TRIGGER workspace_billing_owner_immutable BEFORE UPDATE OF billing_account_id ON workspaces
 WHEN NEW.billing_account_id IS NOT OLD.billing_account_id
 BEGIN SELECT RAISE(ABORT,'workspace billing creator is immutable'); END;
DROP TRIGGER workspace_owner_update_cap;
CREATE TRIGGER workspace_owner_update_cap BEFORE UPDATE OF role ON workspace_members
 WHEN NEW.role='Owner' AND OLD.role!='Owner' AND (SELECT COUNT(*) FROM workspace_members m JOIN workspaces w ON w.id=m.workspace_id WHERE m.address=NEW.address AND m.role='Owner' AND w.active=1 AND w.chain_id=(SELECT chain_id FROM workspaces WHERE id=NEW.workspace_id) AND w.contract_address=(SELECT contract_address FROM workspaces WHERE id=NEW.workspace_id))>=COALESCE((SELECT l.owned_workspaces FROM billing_current_limits l JOIN accounts a ON a.account_id=l.account_id JOIN workspaces w ON w.chain_id=a.chain_id AND w.contract_address=a.contract_address WHERE a.address=NEW.address AND w.id=NEW.workspace_id),5)
 BEGIN SELECT RAISE(ABORT,'workspace Owner limit'); END;
