import { describe, it, expect, beforeEach } from "vitest";
import { MockD1Database, makeEnv } from "./helpers";
import { checkRateLimit, callerIdentity, routeRateBucket } from "../lib/ratelimit";
import worker from "../index";

describe("checkRateLimit", () => {
  let db: MockD1Database;
  let env: ReturnType<typeof makeEnv>;

  beforeEach(() => {
    db = new MockD1Database();
    env = makeEnv({ DB: db }) as ReturnType<typeof makeEnv>;
  });

  it("allows the first request", async () => {
    const result = await checkRateLimit("1.2.3.4", "default", env as never);
    expect(result.allowed).toBe(true);
    expect(result.retryAfter).toBe(0);
  });

  it("blocks after exceeding execute limit (10)", async () => {
    for (let i = 0; i < 10; i++) {
      await checkRateLimit("1.2.3.4", "execute", env as never);
    }
    const result = await checkRateLimit("1.2.3.4", "execute", env as never);
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBe(60);
  });

  it("blocks after exceeding register limit (5)", async () => {
    for (let i = 0; i < 5; i++) {
      await checkRateLimit("10.0.0.1", "register", env as never);
    }
    const result = await checkRateLimit("10.0.0.1", "register", env as never);
    expect(result.allowed).toBe(false);
    expect(db.getTable("rate_limits")[0].count).toBe(5);
  });

  it("resets the quota after the fixed window expires", async () => {
    db.seed("rate_limits", [{ key: "register:10.0.0.1", window_start: Math.floor(Date.now() / 1000) - 61, count: 5 }]);
    const result = await checkRateLimit("10.0.0.1", "register", env as never);
    expect(result.allowed).toBe(true);
    expect(db.getTable("rate_limits")[0].count).toBe(1);
  });

  it("different IPs have independent limits", async () => {
    for (let i = 0; i < 10; i++) {
      await checkRateLimit("1.1.1.1", "execute", env as never);
    }
    const result = await checkRateLimit("2.2.2.2", "execute", env as never);
    expect(result.allowed).toBe(true);
  });

  it("limits RPC-heavy quote and registration-confirmation calls", () => {
    expect(routeRateBucket("POST", "/api/queries/prepare")).toBe("quote");
    expect(routeRateBucket("POST", `/api/collections/${"a".repeat(64)}/confirm`)).toBe("confirm");
    expect(routeRateBucket("POST", `/api/queries/${"a".repeat(64)}/reconcile`)).toBe("reconcile");
    expect(routeRateBucket("GET", "/api/demo")).toBe("catalogue");
    expect(routeRateBucket("GET", `/api/queries/${"a".repeat(64)}/answer`)).toBe("catalogue");
    expect(routeRateBucket("GET", `/api/queries/${"a".repeat(64)}/receipt`)).toBe("catalogue");
    expect(routeRateBucket("POST", "/api/queries/execute")).toBeNull();
    expect(routeRateBucket("POST", "/api/collections")).toBeNull();
  });

  it("rejects excess quote requests independently of paid execution", async () => {
    for (let i = 0; i < 30; i++) {
      expect((await checkRateLimit("1.2.3.4", "quote", env as never)).allowed).toBe(true);
    }
    expect((await checkRateLimit("1.2.3.4", "quote", env as never)).allowed).toBe(false);
    expect((await checkRateLimit("1.2.3.4", "execute", env as never)).allowed).toBe(true);
  });

  it("returns 429 before handling an excess public quote", async () => {
    for (let i = 0; i < 30; i++) {
      const response = await worker.fetch(new Request("https://demo.example/api/queries/prepare", {
        method: "POST", body: "{}", headers: { "CF-Connecting-IP": "203.0.113.8" },
      }), env as never);
      expect(response.status).toBe(503);
    }
    const response = await worker.fetch(new Request("https://demo.example/api/queries/prepare", {
      method: "POST", body: "{}", headers: { "CF-Connecting-IP": "203.0.113.8" },
    }), env as never);
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
  });
});

describe("callerIdentity", () => {
  it("reads CF-Connecting-IP header", () => {
    const req = new Request("http://localhost", {
      headers: { "CF-Connecting-IP": "203.0.113.5" },
    });
    expect(callerIdentity(req)).toBe("203.0.113.5");
  });

  it("falls back to 'local' when header absent", () => {
    const req = new Request("http://localhost");
    expect(callerIdentity(req)).toBe("local");
  });
});
