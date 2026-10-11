import { createPublicClient, decodeEventLog, http, parseAbi, type TransactionReceipt } from "viem";
import type { Env } from "./types";

const EVENTS = parseAbi([
  "event QueryOpened(bytes32 indexed requestId, bytes32 indexed collectionId, address indexed buyer, uint256 amount)",
  "event CollectionRegistered(bytes32 indexed collectionId, address indexed owner, address indexed operator, uint256 price)",
  "event QuerySettled(bytes32 indexed requestId, address indexed owner, bytes32 answerDigest)",
]);
const SETTLED_EVENT = EVENTS[2];

function client(env: Env) {
  const rpc = env.MONAD_RPC_URL || "https://testnet-rpc.monad.xyz";
  return createPublicClient({
    chain: {
      id: Number(env.CHAIN_ID) || 10143,
      name: "Monad Testnet",
      nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
      rpcUrls: { default: { http: [rpc] } },
    },
    transport: http(rpc),
  });
}

export function settlementReceiptMatches(
  receipt: TransactionReceipt,
  contractAddress: string,
  requestId: string,
  answerDigest: `0x${string}`,
): boolean {
  if (receipt.status !== "success" || receipt.to?.toLowerCase() !== contractAddress.toLowerCase()) return false;
  return receipt.logs.some((log) => {
    if (log.address.toLowerCase() !== contractAddress.toLowerCase()) return false;
    try {
      const decoded = decodeEventLog({ abi: EVENTS, data: log.data, topics: log.topics });
      return decoded.eventName === "QuerySettled" &&
        decoded.args.requestId.toLowerCase() === requestId.toLowerCase() &&
        decoded.args.answerDigest.toLowerCase() === answerDigest.toLowerCase();
    } catch { return false; }
  });
}

export async function verifiedSettlementHash(
  env: Env,
  requestId: `0x${string}`,
  answerDigest: `0x${string}`,
  knownHash: string | null,
  openHash: string | null,
): Promise<`0x${string}` | null> {
  const rpc = client(env);
  if (knownHash) {
    const receipt = await rpc.getTransactionReceipt({ hash: knownHash as `0x${string}` });
    return settlementReceiptMatches(receipt, env.CONTRACT_ADDRESS, requestId, answerDigest)
      ? receipt.transactionHash : null;
  }
  if (!openHash) return null;
  const opening = await rpc.getTransactionReceipt({ hash: openHash as `0x${string}` });
  if (opening.status !== "success" || opening.to?.toLowerCase() !== env.CONTRACT_ADDRESS.toLowerCase()) return null;
  const logs = await rpc.getLogs({
    address: env.CONTRACT_ADDRESS as `0x${string}`,
    event: SETTLED_EVENT,
    args: { requestId },
    fromBlock: opening.blockNumber,
  });
  for (const log of logs) {
    if (log.args.answerDigest?.toLowerCase() !== answerDigest.toLowerCase()) continue;
    const receipt = await rpc.getTransactionReceipt({ hash: log.transactionHash });
    if (settlementReceiptMatches(receipt, env.CONTRACT_ADDRESS, requestId, answerDigest))
      return receipt.transactionHash;
  }
  return null;
}

export async function verifyOpenReceipt(
  env: Env, hash: `0x${string}`, requestId: string, collectionId: string,
  buyer: string, amount: bigint,
): Promise<boolean> {
  try {
    const receipt = await client(env).getTransactionReceipt({ hash });
    if (receipt.status !== "success" || receipt.to?.toLowerCase() !== env.CONTRACT_ADDRESS.toLowerCase()) return false;
    return receipt.logs.some((log) => {
      if (log.address.toLowerCase() !== env.CONTRACT_ADDRESS.toLowerCase()) return false;
      try {
        const decoded = decodeEventLog({ abi: EVENTS, data: log.data, topics: log.topics });
        return decoded.eventName === "QueryOpened" &&
          decoded.args.requestId.toLowerCase() === requestId.toLowerCase() &&
          decoded.args.collectionId.toLowerCase() === collectionId.toLowerCase() &&
          decoded.args.buyer.toLowerCase() === buyer.toLowerCase() && decoded.args.amount === amount;
      } catch { return false; }
    });
  } catch { return false; }
}

export async function verifyRegistrationReceipt(
  env: Env, hash: `0x${string}`, collectionId: string, owner: string,
): Promise<boolean> {
  try {
    const receipt = await client(env).getTransactionReceipt({ hash });
    if (receipt.status !== "success" || receipt.to?.toLowerCase() !== env.CONTRACT_ADDRESS.toLowerCase()) return false;
    if (receipt.from.toLowerCase() !== owner.toLowerCase()) return false;
    return receipt.logs.some((log) => {
      if (log.address.toLowerCase() !== env.CONTRACT_ADDRESS.toLowerCase()) return false;
      try {
        const decoded = decodeEventLog({ abi: EVENTS, data: log.data, topics: log.topics });
        return decoded.eventName === "CollectionRegistered" &&
          decoded.args.collectionId.toLowerCase() === collectionId.toLowerCase() &&
          decoded.args.owner.toLowerCase() === owner.toLowerCase();
      } catch { return false; }
    });
  } catch { return false; }
}
