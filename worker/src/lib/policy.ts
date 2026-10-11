import { createPublicClient, http, parseAbi, verifyMessage, type Address } from "viem";
import type { Env, OnChainCollection } from "./types";

export interface OnChainQuery {
  collectionId: `0x${string}`;
  buyer: Address;
  amount: bigint;
  policyVersion: number;
  openedAt: bigint;
  state: number; // 0 = Open, 1 = Settled, 2 = Refunded
}

const COLLECTION_ABI = parseAbi([
  "function getCollection(bytes32 collectionId) external view returns (address,address,uint256,uint32,bool)",
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
    }) as [string, string, bigint, number, boolean];
    return {
      owner: result[0],
      operator: result[1],
      price: result[2],
      policyVersion: result[3],
      active: result[4],
    };
  } catch {
    return null;
  }
}

const QUERY_ABI = parseAbi([
  "function getQuery(bytes32 requestId) external view returns (bytes32,address,uint256,uint32,uint64,uint8)",
]);

export async function getOnChainQuery(
  requestId: `0x${string}`,
  env: Env,
): Promise<OnChainQuery | null> {
  if (!env.CONTRACT_ADDRESS) return null;

  const client = createPublicClient({
    chain: buildChain(env),
    transport: http(),
  });

  try {
    const result = await client.readContract({
      address: env.CONTRACT_ADDRESS as Address,
      abi: QUERY_ABI,
      functionName: "getQuery",
      args: [requestId],
    }) as [`0x${string}`, Address, bigint, number, bigint, number];

    // A zero buyer address means the requestId has never been recorded on-chain
    if (result[1] === "0x0000000000000000000000000000000000000000") return null;

    return {
      collectionId: result[0],
      buyer: result[1],
      amount: result[2],
      policyVersion: result[3],
      openedAt: result[4],
      state: result[5],
    };
  } catch {
    return null;
  }
}

export async function verifyUploadSignature(
  ownerAddress: string,
  collectionId: string,
  contentHash: string,
  timestamp: number,
  signature: string,
): Promise<boolean> {
  const FIVE_MINUTES = 5 * 60 * 1000;
  if (Date.now() - timestamp > FIVE_MINUTES) return false;

  const message = `datavault-upload:${collectionId}:${contentHash}:${timestamp}`;

  try {
    return await verifyMessage({
      address: ownerAddress as Address,
      message,
      signature: signature as `0x${string}`,
    });
  } catch {
    return false;
  }
}

export async function buildRegisterCalldata(
  collectionId: `0x${string}`,
  priceWei: bigint,
  operator: `0x${string}`,
): Promise<`0x${string}`> {
  const { encodeFunctionData } = await import("viem");
  const abi = parseAbi(["function registerCollection(bytes32 collectionId, uint256 price, address operator) external"]);
  return encodeFunctionData({ abi, functionName: "registerCollection", args: [collectionId, priceWei, operator] });
}

export async function buildSettleCalldata(requestId: `0x${string}`, answerDigest: `0x${string}`): Promise<`0x${string}`> {
  const { encodeFunctionData } = await import("viem");
  const abi = parseAbi(["function settleQuery(bytes32 requestId, bytes32 answerDigest) external"]);
  return encodeFunctionData({ abi, functionName: "settleQuery", args: [requestId, answerDigest] });
}
