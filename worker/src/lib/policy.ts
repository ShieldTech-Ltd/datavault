import { createPublicClient, http, parseAbi, type Address } from "viem";
import type { Env, OnChainCollection } from "./types";

const COLLECTION_ABI = parseAbi([
  "function getCollection(bytes32 collectionId) external view returns (tuple(address owner, uint256 price, uint32 policyVersion, bool active))",
]);

function buildChain(env: Env) {
  return {
    id: Number(env.CHAIN_ID) || 10143,
    name: "Monad Testnet",
    nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
    rpcUrls: { default: { http: [env.MONAD_RPC_URL || "https://testnet-rpc.monad.xyz"] } },
  } as const;
}

export async function getOnChainCollection(
  collectionId: `0x${string}`,
  env: Env,
): Promise<OnChainCollection | null> {
  if (!env.CONTRACT_ADDRESS) return null;

  const client = createPublicClient({
    chain: buildChain(env),
    transport: http(),
  });

  try {
    const result = await client.readContract({
      address: env.CONTRACT_ADDRESS as Address,
      abi: COLLECTION_ABI,
      functionName: "getCollection",
      args: [collectionId],
    }) as { owner: string; price: bigint; policyVersion: number; active: boolean };
    return {
      owner: result.owner,
      price: result.price,
      policyVersion: result.policyVersion,
      active: result.active,
    };
  } catch {
    return null;
  }
}

export async function buildRegisterCalldata(
  collectionId: `0x${string}`,
  priceWei: bigint,
): Promise<`0x${string}`> {
  const { encodeFunctionData } = await import("viem");
  const abi = parseAbi(["function registerCollection(bytes32 collectionId, uint256 price) external"]);
  return encodeFunctionData({ abi, functionName: "registerCollection", args: [collectionId, priceWei] });
}

export async function buildSettleCalldata(requestId: `0x${string}`): Promise<`0x${string}`> {
  const { encodeFunctionData } = await import("viem");
  const abi = parseAbi(["function settleQuery(bytes32 requestId) external"]);
  return encodeFunctionData({ abi, functionName: "settleQuery", args: [requestId] });
}
