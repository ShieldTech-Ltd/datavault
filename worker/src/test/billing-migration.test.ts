import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {sqliteD1} from './sqlite-d1';
it('upgrades populated 0022 with creator ownership and preserves existing private records',()=>{
 const store=sqliteD1('0022_notion_imports.sql');
 try{
  // The exact last migration is resolved from the directory so renamed files do not silently omit schema.
  const address='0x'+'11'.repeat(20),contract='0x'+'ab'.repeat(20),id='0x'+'cd'.repeat(32),w='a'.repeat(64);
  store.sqlite.prepare('INSERT INTO accounts(account_id,address,chain_id,contract_address,created_at,updated_at) VALUES(?,?,?,?,1,1)').all('a',address,10143,contract);
  store.sqlite.prepare('INSERT INTO workspaces(id,chain_id,contract_address,name,created_at) VALUES(?,?,?, ?,1)').all(w,10143,contract,'Existing team');
  store.sqlite.prepare("INSERT INTO workspace_members(workspace_id,address,role,joined_at) VALUES(?,?,'Owner',1)").all(w,address);
  store.sqlite.prepare("INSERT INTO workspace_audit(workspace_id,actor,action,target,created_at) VALUES(?,?,'created',?,1)").all(w,address,address);
  store.sqlite.prepare("INSERT INTO collections(collection_id,owner_address,collection_name,content_hash,created_at,status,chain_id,contract_address) VALUES(?,?,?,?,1,'confirmed',?,?)").all(id,address,'Existing guide',id,10143,contract);
  store.sqlite.prepare('INSERT INTO account_saved_questions(account_id,collection_id,question,created_at,expires_at) VALUES(?,?,?,1,?)').all('a',id,'Retained private question',Date.now()+86400000);
  store.migrate(readFileSync('migrations/0023_billing.sql','utf8'));
  expect(store.sqlite.prepare('SELECT billing_account_id,name FROM workspaces').all()).toEqual([{billing_account_id:'a',name:'Existing team'}]);
  expect(store.sqlite.prepare('SELECT question FROM account_saved_questions').all()).toEqual([{question:'Retained private question'}]);
  expect(store.sqlite.prepare('SELECT status FROM collections').all()).toEqual([{status:'confirmed'}]);
  expect(()=>store.sqlite.prepare('UPDATE workspaces SET billing_account_id=NULL').all()).toThrow('workspace billing creator is immutable');
  expect(store.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
 }finally{store.close();}
});

it('enforces millisecond freshness and period boundaries in migrated workspace triggers',()=>{
 const store=sqliteD1('0022_notion_imports.sql');
 try{
  store.migrate(readFileSync('migrations/0023_billing.sql','utf8').replaceAll("julianday('now')",'(2440587.5+1000000.5/86400)'));
  store.sqlite.prepare("INSERT INTO accounts(account_id,address,chain_id,contract_address,created_at,updated_at) VALUES('a','owner',10143,'contract',1,1)").all();
  store.sqlite.prepare("INSERT INTO billing_accounts(account_id,status,period_end,verified_at,limits_json) VALUES('a','active',1000000501,999100501,?)").all(JSON.stringify({ownedWorkspaces:8,workspaceMembers:60}));
  store.sqlite.prepare("INSERT INTO workspaces(id,chain_id,contract_address,name,created_at,billing_account_id) VALUES('w',10143,'contract','Team',1,'a')").all();
  store.sqlite.prepare("WITH RECURSIVE n(x) AS (VALUES(0) UNION ALL SELECT x+1 FROM n WHERE x<49) INSERT INTO workspace_members(workspace_id,address,role,joined_at) SELECT 'w','member'||x,'Viewer',1 FROM n").all();
  const insert=()=>store.sqlite.prepare("INSERT INTO workspace_members(workspace_id,address,role,joined_at) VALUES('w','extra','Viewer',1)").all();
  for(const [age,period,allowed] of [[899999,1000000501,true],[900000,1000000501,false],[900499,1000000501,false],[-1000,1000000501,true],[-1001,1000000501,false],[0,1000000500,false]] as const){
   store.sqlite.prepare("UPDATE billing_accounts SET verified_at=?,period_end=?").all(1000000500-age,period);
   if(allowed){expect(insert).not.toThrow();store.sqlite.prepare("DELETE FROM workspace_members WHERE address='extra'").all();}
   else expect(insert).toThrow('workspace member limit');
  }
  expect(store.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
 }finally{store.close();}
});
