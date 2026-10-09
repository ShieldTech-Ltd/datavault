import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// Execute real SQLite SQL through Python, supported by Node 20 CI and local Node.
export function sqliteD1() {
  const directory = mkdtempSync(join(tmpdir(), 'datavault-account-'));
  const path = join(directory, 'db.sqlite');
  const python = process.platform === 'win32' ? 'python' : 'python3';
  function execute(sql: string, args: unknown[] = [], script = false) {
    const code = `import sqlite3,json,sys\np=json.load(sys.stdin)\nc=sqlite3.connect(p['path'])\nc.row_factory=sqlite3.Row\nif p['script']:\n c.executescript(p['sql']); result={'rows':[],'changes':0}\nelse:\n cursor=c.execute(p['sql'],p['args']); result={'rows':[dict(r) for r in cursor.fetchall()],'changes':max(cursor.rowcount,0)}\nc.commit()\nprint(json.dumps(result))\nc.close()`;
    const result = spawnSync(python, ['-c', code], { input: JSON.stringify({ path, sql, args, script }), encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.stderr || result.error?.message);
    return JSON.parse(result.stdout);
  }
  execute(readdirSync('migrations').filter(f => f.endsWith('.sql')).sort().map(file => readFileSync(`migrations/${file}`, 'utf8')).join('\n'), [], true);
  const db = { prepare(sql: string) {
    let args: unknown[] = [];
    const statement = { bind(...values: unknown[]) { args = values; return statement; },
      async first() { return execute(sql, args).rows[0] ?? null; },
      async all() { return { results: execute(sql, args).rows, success: true }; },
      async run() { return { success: true, meta: { changes: execute(sql, args).changes } }; },
    }; return statement;
  }} as unknown as D1Database;
  return { db, sqlite: { prepare(sql: string) { return { all: (...args: unknown[]) => execute(sql, args).rows }; } }, close: () => rmSync(directory, { recursive: true, force: true }) };
}
