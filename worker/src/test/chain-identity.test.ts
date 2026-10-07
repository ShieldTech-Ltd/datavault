import { afterEach, describe, expect, it, vi } from "vitest";
import { rpcMatchesConfiguredChain } from "../lib/chain-identity";
import type { Env } from "../lib/types";

const originalFetch = globalThis.fetch;
const env = { CHAIN_ID: "10143", MONAD_RPC_URL: "https://rpc.example.org" } as Env;

afterEach(() => { globalThis.fetch = originalFetch; });

describe("runtime RPC chain identity", () => {
  it("accepts the configured chain", async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ result: "0x279f" }))) as typeof fetch;
    expect(await rpcMatchesConfiguredChain(env)).toBe(true);
  });

  it("fails closed when the RPC serves a different chain", async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ result: "0x1" }))) as typeof fetch;
    expect(await rpcMatchesConfiguredChain(env)).toBe(false);
  });

  it("fails closed on malformed responses and transport errors", async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ result: "invalid" }))) as typeof fetch;
    expect(await rpcMatchesConfiguredChain(env)).toBe(false);
    globalThis.fetch = vi.fn(async () => { throw new Error("RPC unavailable"); }) as typeof fetch;
    expect(await rpcMatchesConfiguredChain(env)).toBe(false);
  });
});
