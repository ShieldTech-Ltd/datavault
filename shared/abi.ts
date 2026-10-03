// Shared ABI for DataVault contract.
// Keep in sync with contracts/DataVault.sol.
// Import this in both the Worker and the frontend test utilities.

export const DATAVAULT_ABI = [
  {
    "inputs": [{ "name": "collectionId", "type": "bytes32" }, { "name": "price", "type": "uint256" }],
    "name": "registerCollection",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "name": "collectionId", "type": "bytes32" }, { "name": "price", "type": "uint256" }, { "name": "active", "type": "bool" }],
    "name": "updatePolicy",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "name": "requestId", "type": "bytes32" }, { "name": "collectionId", "type": "bytes32" }],
    "name": "openQuery",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [{ "name": "requestId", "type": "bytes32" }],
    "name": "settleQuery",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "name": "requestId", "type": "bytes32" }],
    "name": "refundExpired",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "name": "collectionId", "type": "bytes32" }],
    "name": "getCollection",
    "outputs": [{ "components": [{ "name": "owner", "type": "address" }, { "name": "price", "type": "uint256" }, { "name": "policyVersion", "type": "uint32" }, { "name": "active", "type": "bool" }], "type": "tuple" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "name": "requestId", "type": "bytes32" }],
    "name": "getQuery",
    "outputs": [{ "components": [{ "name": "collectionId", "type": "bytes32" }, { "name": "buyer", "type": "address" }, { "name": "amount", "type": "uint256" }, { "name": "policyVersion", "type": "uint32" }, { "name": "openedAt", "type": "uint64" }, { "name": "state", "type": "uint8" }], "type": "tuple" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "REFUND_TIMEOUT",
    "outputs": [{ "type": "uint64" }],
    "stateMutability": "view",
    "type": "function"
  }
] as const;
