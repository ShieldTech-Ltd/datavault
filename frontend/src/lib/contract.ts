import { createPublicClient, http, parseAbi } from "viem";
import { monadTestnet } from "./dynamic";

export const DATAVAULT_ABI = parseAbi([
  "function registerCollection(bytes32 collectionId, uint256 price, address operator) external",
  "function updateOperator(bytes32 collectionId, address newOperator) external",
  "function updatePolicy(bytes32 collectionId, uint256 price, bool active) external",
  "function openQuery(bytes32 requestId, bytes32 collectionId) external payable",
  "function settleQuery(bytes32 requestId) external",
  "function refundExpired(bytes32 requestId) external",
  "function getCollection(bytes32 collectionId) external view returns (address,address,uint256,uint32,bool)",
  "function getQuery(bytes32 requestId) external view returns (bytes32,address,uint256,uint32,uint64,uint8)",
  "function REFUND_TIMEOUT() external view returns (uint64)",
  "event CollectionRegistered(bytes32 indexed collectionId, address indexed owner, address indexed operator, uint256 price)",
  "event OperatorUpdated(bytes32 indexed collectionId, address indexed newOperator)",
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
