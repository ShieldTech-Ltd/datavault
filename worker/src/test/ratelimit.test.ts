import { describe, it, expect, beforeEach } from "vitest";
import { MockD1Database, makeEnv } from "./helpers";
import { checkRateLimit, callerIdentity } from "../lib/ratelimit";

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
