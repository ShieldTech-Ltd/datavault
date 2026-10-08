/**
 * In-memory D1 and R2 mocks for Worker unit tests.
 * These satisfy the subset of the Cloudflare bindings API used by our code.
 */

// ── Minimal D1 mock ────────────────────────────────────────────────

interface Row {
  [col: string]: unknown;
}

export class MockD1Database {
  private tables: Map<string, Row[]> = new Map();

  seed(table: string, rows: Row[]) {
    this.tables.set(table, [...rows]);
  }

  getTable(table: string): Row[] {
    return this.tables.get(table) ?? [];
  }

  prepare(sql: string): MockD1Statement {
    return new MockD1Statement(sql, this.tables);
  }
}

class MockD1Statement {
  private boundArgs: unknown[] = [];

  constructor(private sql: string, private tables: Map<string, Row[]>) {}

  bind(...args: unknown[]): this {
    this.boundArgs = args;
    return this;
  }

  async run(): Promise<{ meta: { changes: number } }> {
    const s = this.sql.trim();
    const su = s.toUpperCase();

    // INSERT OR IGNORE INTO queries
    // Bound args: request_id(0), collection_id(1), buyer_address(2), policy_version(3),
    //   question_digest(4), open_tx_hash(5), chain_id(6), contract_address(7),
    //   content_hash(8), amount_wei(9), claimed_at(10), lease_expires_at(11), lease_token(12), created_at(13)
    // Note: passage_ids='[]' and outcome='pending' are SQL literals, not bound args
    if (su.startsWith("INSERT OR IGNORE INTO QUERIES")) {
      const queries = this.tables.get("queries") ?? [];
      const requestId = this.boundArgs[0] as string;
      if (queries.some((r) => r.request_id === requestId)) {
        return { meta: { changes: 0 } };
      }
      queries.push({
        request_id: this.boundArgs[0],
        collection_id: this.boundArgs[1],
        buyer_address: this.boundArgs[2],
        policy_version: this.boundArgs[3],
        question_digest: this.boundArgs[4],
        open_tx_hash: this.boundArgs[5],
        chain_id: this.boundArgs[6],
        contract_address: this.boundArgs[7],
        content_hash: this.boundArgs[8],
        amount_wei: this.boundArgs[9],
        passage_ids: "[]",
        outcome: "pending",
        claimed_at: this.boundArgs[10],
        lease_expires_at: this.boundArgs[11],
        lease_token: this.boundArgs[12],
        created_at: this.boundArgs[13],
        settle_tx_hash: null,
        refund_tx_hash: null,
        response_digest: null,
        answer_text: null,
        settled_at: null,
      });
      this.tables.set("queries", queries);
      return { meta: { changes: 1 } };
    }

    // An expired pending/running claim may be resumed by one Worker.
    if (su.startsWith("UPDATE QUERIES SET OUTCOME = 'PENDING', CLAIMED_AT")) {
      const rows = this.tables.get("queries") ?? [];
      const row = rows.find((item) => item.request_id === this.boundArgs[3]);
      if (!row || !["pending", "running"].includes(row.outcome as string) ||
          row.answer_text !== null || (row.lease_expires_at as number) > (this.boundArgs[4] as number) ||
          row.collection_id !== this.boundArgs[5] || row.buyer_address !== this.boundArgs[6] ||
          row.policy_version !== this.boundArgs[7] || row.question_digest !== this.boundArgs[8] ||
          row.open_tx_hash !== this.boundArgs[9] || row.chain_id !== this.boundArgs[10] ||
          row.contract_address !== this.boundArgs[11] || row.amount_wei !== this.boundArgs[12] ||
          row.content_hash !== this.boundArgs[13])
        return { meta: { changes: 0 } };
      row.outcome = "pending";
      row.claimed_at = this.boundArgs[0];
      row.lease_expires_at = this.boundArgs[1];
      row.lease_token = this.boundArgs[2];
      return { meta: { changes: 1 } };
    }

    // UPDATE queries SET outcome = 'running' with a fencing token.
    if (su.startsWith("UPDATE QUERIES SET OUTCOME = 'RUNNING'")) {
      const rows = this.tables.get("queries") ?? [];
      const reqId = this.boundArgs[0];
      for (const r of rows) {
        if (r.request_id === reqId && r.lease_token === this.boundArgs[1] && r.outcome === "pending") {
          r.outcome = "running";
          return { meta: { changes: 1 } };
        }
      }
      return { meta: { changes: 0 } };
    }

    // UPDATE queries SET outcome = 'answer_recorded', answer_text = ?, passage_ids = ?, response_digest = ? WHERE request_id = ?
    if (su.includes("OUTCOME = 'ANSWER_RECORDED'")) {
      const rows = this.tables.get("queries") ?? [];
      const reqId = this.boundArgs[3];
      for (const r of rows) {
        if (r.request_id === reqId && r.lease_token === this.boundArgs[4] && r.outcome === "running") {
          r.outcome = "answer_recorded";
          r.answer_text = this.boundArgs[0];
          r.passage_ids = this.boundArgs[1];
          r.response_digest = this.boundArgs[2];
          return { meta: { changes: 1 } };
        }
      }
      return { meta: { changes: 0 } };
    }

    // UPDATE queries SET outcome = 'settlement_pending', settle_tx_hash = ? WHERE request_id = ?
    if (su.includes("OUTCOME = 'SETTLEMENT_PENDING'")) {
      const rows = this.tables.get("queries") ?? [];
      const reqId = this.boundArgs[1];
      for (const r of rows) {
        if (r.request_id === reqId) {
          r.outcome = "settlement_pending";
          r.settle_tx_hash = this.boundArgs[0];
        }
      }
      return { meta: { changes: 1 } };
    }

    // UPDATE queries SET outcome = 'settled', settle_tx_hash = ?, passage_ids = ?, response_digest = ?, settled_at = ? WHERE request_id = ?
    if (su.includes("OUTCOME = 'SETTLED'")) {
      const rows = this.tables.get("queries") ?? [];
      const reqId = this.boundArgs[4];
      for (const r of rows) {
        if (r.request_id === reqId) {
          r.outcome = "settled";
          r.settle_tx_hash = this.boundArgs[0];
          r.passage_ids = this.boundArgs[1];
          r.response_digest = this.boundArgs[2];
          r.settled_at = this.boundArgs[3];
        }
      }
      return { meta: { changes: 1 } };
    }

    // Generic UPDATE queries SET outcome = ? WHERE request_id = ?
    if (su.startsWith("UPDATE QUERIES SET OUTCOME = ?")) {
      const rows = this.tables.get("queries") ?? [];
      const newOutcome = this.boundArgs[0];
      const reqId = this.boundArgs[1];
      for (const r of rows) {
        if (r.request_id === reqId && (this.boundArgs.length < 3 || r.lease_token === this.boundArgs[2])) {
          r.outcome = newOutcome;
          return { meta: { changes: 1 } };
        }
      }
      return { meta: { changes: 0 } };
    }

    // INSERT INTO collections
    if (su.startsWith("INSERT INTO COLLECTIONS")) {
      const collections = this.tables.get("collections") ?? [];
      collections.push({
        collection_id: this.boundArgs[0],
        owner_address: this.boundArgs[1],
        collection_name: this.boundArgs[2],
        content_hash: this.boundArgs[3],
        chain_id: this.boundArgs[4],
        contract_address: this.boundArgs[5],
        policy_version: 1,
        active: 1,
        status: "staging",
        staged_at: this.boundArgs[6],
        confirmed_tx: null,
        created_at: this.boundArgs[7],
      });
      this.tables.set("collections", collections);
      return { meta: { changes: 1 } };
    }

    // UPDATE collections SET status = 'confirmed'
    if (su.startsWith("UPDATE COLLECTIONS SET STATUS = 'CONFIRMED'")) {
      const rows = this.tables.get("collections") ?? [];
      for (const r of rows) {
        if (r.collection_id === this.boundArgs[1]) {
          r.status = "confirmed";
          r.confirmed_tx = this.boundArgs[0];
        }
      }
      return { meta: { changes: 1 } };
    }

    // UPDATE collections SET status = 'orphaned'
    if (su.startsWith("UPDATE COLLECTIONS SET STATUS = 'ORPHANED'")) {
      const rows = this.tables.get("collections") ?? [];
      for (const r of rows) {
        if (r.collection_id === this.boundArgs[0] && r.status === "staging") {
          r.status = "orphaned";
        }
      }
      return { meta: { changes: 1 } };
    }

    // Rate limit upsert
    if (su.includes("INSERT INTO RATE_LIMITS")) {
      const rl = this.tables.get("rate_limits") ?? [];
      const key = this.boundArgs[0];
      const now = this.boundArgs[1] as number;
      const windowStart = this.boundArgs[2] as number;
      const limit = this.boundArgs[6] as number;
      const existing = rl.find((r) => r.key === key);
      if (!existing) {
        rl.push({ key, window_start: now, count: 1 });
      } else {
        if ((existing.window_start as number) <= windowStart) {
          existing.count = 1;
          existing.window_start = now;
        } else if ((existing.count as number) >= limit) {
          return { meta: { changes: 0 } };
        } else {
          existing.count = (existing.count as number) + 1;
        }
      }
      this.tables.set("rate_limits", rl);
      return { meta: { changes: 1 } };
    }

    return { meta: { changes: 0 } };
  }

  async first<T>(): Promise<T | null> {
    const su = this.sql.trim().toUpperCase();

    if (su.includes("FROM QUERIES WHERE REQUEST_ID")) {
      const rows = this.tables.get("queries") ?? [];
      return (
        (rows.find((r) => r.request_id === this.boundArgs[0]) as
          | T
          | undefined) ?? null
      );
    }

    if (su.includes("FROM COLLECTIONS WHERE COLLECTION_ID")) {
      const rows = this.tables.get("collections") ?? [];
      return (
        (rows.find(
          (r) =>
            r.collection_id === this.boundArgs[0] &&
            r.chain_id === this.boundArgs[1] &&
            r.contract_address === this.boundArgs[2]
        ) as T | undefined) ?? null
      );
    }

    if (su.includes("FROM RATE_LIMITS WHERE KEY")) {
      const rows = this.tables.get("rate_limits") ?? [];
      const key = this.boundArgs[0];
      const windowStart = this.boundArgs[1] as number;
      const row = rows.find(
        (r) => r.key === key && (r.window_start as number) >= windowStart
      );
      return (row ? { count: row.count } : null) as T | null;
    }

    if (su.startsWith("SELECT 1 FROM QUERIES")) {
      const rows = this.tables.get("queries") ?? [];
      const found = rows.find((r) => r.request_id === this.boundArgs[0]);
      return (found ? { "1": 1 } : null) as T | null;
    }

    return null;
  }
}

// ── Minimal R2 mock ────────────────────────────────────────────────

export class MockR2Bucket {
  private objects: Map<string, string> = new Map();

  async put(
    key: string,
    value: string | ReadableStream | ArrayBuffer
  ): Promise<void> {
    if (typeof value === "string") this.objects.set(key, value);
  }

  async get(key: string): Promise<{ text(): Promise<string> } | null> {
    const val = this.objects.get(key);
    if (val === undefined) return null;
    return { text: async () => val };
  }

  has(key: string): boolean {
    return this.objects.has(key);
  }
}

// ── Env builder ────────────────────────────────────────────────────

export function makeEnv(
  overrides: Partial<{
    CONTRACT_ADDRESS: string;
    SETTLEMENT_PRIVATE_KEY: string;
    MONAD_RPC_URL: string;
    MODEL_PROVIDER: string;
    CHAIN_ID: string;
    MODEL_API_KEY: string;
    DB: MockD1Database;
    COLLECTION_STORE: MockR2Bucket;
  }> = {}
) {
  return {
    CONTRACT_ADDRESS: overrides.CONTRACT_ADDRESS ?? "",
    SETTLEMENT_PRIVATE_KEY:
      overrides.SETTLEMENT_PRIVATE_KEY ??
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    MONAD_RPC_URL: overrides.MONAD_RPC_URL ?? "https://testnet-rpc.monad.xyz",
    MODEL_PROVIDER: overrides.MODEL_PROVIDER ?? "openai",
    CHAIN_ID: overrides.CHAIN_ID ?? "10143",
    MODEL_API_KEY: overrides.MODEL_API_KEY ?? "test-key",
    ALLOWED_ORIGINS: "",
    DB: overrides.DB ?? new MockD1Database(),
    COLLECTION_STORE: overrides.COLLECTION_STORE ?? new MockR2Bucket(),
    ASSETS: { fetch: async () => new Response("ok") } as unknown as Fetcher,
  };
}
