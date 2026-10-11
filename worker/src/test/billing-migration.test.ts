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
