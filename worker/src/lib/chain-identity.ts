import type { Env } from "./types";

export async function rpcMatchesConfiguredChain(env: Env): Promise<boolean> {
  const expected = Number(env.CHAIN_ID);
  if (!Number.isSafeInteger(expected) || expected <= 0 || !env.MONAD_RPC_URL) return false;
  try {
    const response = await fetch(env.MONAD_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return false;
    const body = await response.json<{ result?: unknown; error?: unknown }>();
    return !body.error && typeof body.result === "string" && /^0x[0-9a-f]+$/i.test(body.result) &&
      BigInt(body.result) === BigInt(expected);
  } catch {
    return false;
  }
}
