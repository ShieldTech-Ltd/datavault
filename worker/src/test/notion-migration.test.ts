import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { sqliteD1 } from "./sqlite-d1";
it("0022 preserves populated job IDs, private object keys, connector state and global uniqueness", async () => {
  const s = sqliteD1("0021_shared_import_jobs.sql");
  try {
    s.migrate(
      "INSERT INTO accounts(account_id,address,chain_id,contract_address,created_at,updated_at) VALUES('a','0x1',1,'0x2',1,1); INSERT INTO account_connectors(id,account_id,provider,deployment,status,credential,created_at,updated_at) VALUES('c','a','github','1:0x2','connected','ciphertext',1,1); INSERT INTO github_import_jobs(id,account_id,repository,ref,paths,status,idempotency_key,created_at,expires_at,draft_key,connection_id,credential_version,provider) VALUES('j','a','owner/repo','main','[\"a.md\"]','queued','key',1,100,'private-import-drafts/a/j/lease.md','c',1,'github');",
    );
    s.migrate(
      "INSERT INTO connector_oauth_states(state_hash,account_id,provider,deployment,session_hash,browser_hash,verifier,expires_at) VALUES('state','a','github','1:0x2','session','browser','ciphertext',100); INSERT INTO connector_cleanup_obligations(id,account_id,provider,deployment,created_at) VALUES('cleanup','a','github','1:0x2',1);",
    );
    const jobs = s.sqlite.prepare("SELECT * FROM github_import_jobs").all(),
      connectors = s.sqlite.prepare("SELECT * FROM account_connectors").all(),
      states = s.sqlite.prepare("SELECT * FROM connector_oauth_states").all(),
      obligations = s.sqlite
        .prepare("SELECT * FROM connector_cleanup_obligations")
        .all();
    s.migrate(readFileSync("migrations/0022_notion_imports.sql", "utf8"));
    expect(s.sqlite.prepare("SELECT * FROM github_import_jobs").all()).toEqual(
      jobs,
    );
    expect(s.sqlite.prepare("SELECT * FROM account_connectors").all()).toEqual(
      connectors,
    );
    expect(
      s.sqlite.prepare("SELECT * FROM connector_oauth_states").all(),
    ).toEqual(states);
    expect(
      s.sqlite.prepare("SELECT * FROM connector_cleanup_obligations").all(),
    ).toEqual(obligations);
    s.migrate(
      "INSERT INTO account_connectors(id,account_id,provider,deployment,status,created_at,updated_at) VALUES('notion-c','a','notion','1:0x2','pending',1,1); INSERT INTO connector_oauth_states(state_hash,account_id,provider,deployment,session_hash,browser_hash,verifier,expires_at) VALUES('notion-s','a','notion','1:0x2','session','browser','ciphertext',100); INSERT INTO connector_cleanup_obligations(id,account_id,provider,deployment,created_at) VALUES('notion-cleanup','a','notion','1:0x2',1);",
    );
    expect(s.sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(() =>
      s.migrate(
        "INSERT INTO github_import_jobs(id,account_id,repository,ref,paths,status,idempotency_key,created_at,expires_at,provider) VALUES('n','a','notion','selected','[]','queued','notion-key',1,100,'notion');",
      ),
    ).toThrow(/UNIQUE/);
    s.migrate(
      "UPDATE github_import_jobs SET status='cancelled'; INSERT INTO github_import_jobs(id,account_id,repository,ref,paths,status,idempotency_key,created_at,expires_at,provider) VALUES('n','a','notion','selected','[]','queued','notion-key',1,100,'notion');",
    );
    expect(
      s.sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='github_import_jobs'",
        )
        .all()
        .map((r: any) => r.name),
    ).toEqual(
      expect.arrayContaining([
        "github_import_inflight",
        "github_import_idempotent",
        "github_import_owner",
        "github_import_expiry",
        "import_jobs_provider_owner",
      ]),
    );
  } finally {
    s.close();
  }
});
