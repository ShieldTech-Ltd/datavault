import { createPublicClient, decodeEventLog, http, parseAbi } from "viem";
import type { Env } from "./types";

const EVENTS = parseAbi([
  "event QueryOpened(bytes32 indexed requestId, bytes32 indexed collectionId, address indexed buyer, uint256 amount)",
  "event CollectionRegistered(bytes32 indexed collectionId, address indexed owner, address indexed operator, uint256 price)",
]);

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
