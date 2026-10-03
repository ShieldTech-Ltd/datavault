import { createPublicClient, http, parseAbi } from "viem";
import { monadTestnet } from "./dynamic";

export const DATAVAULT_ABI = parseAbi([
  "function registerCollection(bytes32 collectionId, uint256 price) external",
  "function updatePolicy(bytes32 collectionId, uint256 price, bool active) external",
  "function openQuery(bytes32 requestId, bytes32 collectionId) external payable",
  "function settleQuery(bytes32 requestId) external",
  "function refundExpired(bytes32 requestId) external",
  "function getCollection(bytes32 collectionId) external view returns (tuple(address owner, uint256 price, uint32 policyVersion, bool active))",
  "function getQuery(bytes32 requestId) external view returns (tuple(bytes32 collectionId, address buyer, uint256 amount, uint32 policyVersion, uint64 openedAt, uint8 state))",
  "function REFUND_TIMEOUT() external view returns (uint64)",
  "event CollectionRegistered(bytes32 indexed collectionId, address indexed owner, uint256 price)",
  "event PolicyUpdated(bytes32 indexed collectionId, uint256 price, bool active, uint32 policyVersion)",
  "event QueryOpened(bytes32 indexed requestId, bytes32 indexed collectionId, address indexed buyer, uint256 amount)",
  "event QuerySettled(bytes32 indexed requestId, address indexed owner)",
  "event QueryRefunded(bytes32 indexed requestId, address indexed buyer)",
]);

export const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS as `0x${string}` | undefined;

export const viemClient = createPublicClient({
  chain: {
    id: monadTestnet.chainId,
    name: monadTestnet.name,
    nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
    rpcUrls: { default: { http: [monadTestnet.rpcUrls[0]] } },
  },
  transport: http(),
});
