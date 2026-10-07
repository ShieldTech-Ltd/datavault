import { createPublicClient, createWalletClient, encodeFunctionData, http, parseAbi, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Env } from "./types";

export type SettlementResult = {
  hash: `0x${string}`;
  status: "confirmed" | "pending" | "reverted";
};

// A broadcast hash alone does not prove settlement. The escrow state remains
// authoritative if the receipt is delayed, the RPC fails, or the Worker exits.
export async function settleOnChainWithConfirmation(
  requestId: `0x${string}`,
  env: Env,
): Promise<SettlementResult> {
  const account = privateKeyToAccount(env.SETTLEMENT_PRIVATE_KEY as `0x${string}`);
  const chainId = Number(env.CHAIN_ID) || 10143;
  const chain = {
    id: chainId,
    name: "Monad Testnet",
    nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
    rpcUrls: { default: { http: [env.MONAD_RPC_URL || "https://testnet-rpc.monad.xyz"] } },
  } as const;

  const walletClient = createWalletClient({ account, chain, transport: http() });
  const publicClient = createPublicClient({ chain, transport: http() });
  const settleAbi = parseAbi(["function settleQuery(bytes32 requestId) external"]);
  const data = encodeFunctionData({ abi: settleAbi, functionName: "settleQuery", args: [requestId] });

  const hash = await walletClient.sendTransaction({
    to: env.CONTRACT_ADDRESS as Address,
    data,
    chain,
    account,
  });

  try {
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 20_000, confirmations: 1 });
    return { hash, status: receipt.status === "success" ? "confirmed" : "reverted" };
  } catch {
    return { hash, status: "pending" };
  }
}
