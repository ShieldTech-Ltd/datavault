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

const QUERY_ABI = parseAbi([
  "function getQuery(bytes32 requestId) external view returns (tuple(bytes32 collectionId, address buyer, uint256 amount, uint32 policyVersion, uint64 openedAt, uint8 state))",
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
    }) as { collectionId: `0x${string}`; buyer: Address; amount: bigint; policyVersion: number; openedAt: bigint; state: number };

    // A zero buyer address means the requestId has never been recorded on-chain
    if (result.buyer === "0x0000000000000000000000000000000000000000") return null;

    return {
      collectionId: result.collectionId,
      buyer: result.buyer,
      amount: result.amount,
      policyVersion: result.policyVersion,
      openedAt: result.openedAt,
      state: result.state,
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
