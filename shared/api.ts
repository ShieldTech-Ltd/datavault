export interface CitedPassage {
  id: string;
  text: string;
  version: string;
}

export interface QueryResult {
  requestId: string;
  openTxHash: string;
  settleTxHash: string | null;
  outcome: "settled" | "settlement_pending";
  receiptUrl: string;
  answer?: string;
  citedPassages?: CitedPassage[];
  citedPassageIds?: string[];
  isInsufficientEvidence?: boolean;
  responseDigest?: string;
}

export interface RecoveredAnswer {
  requestId: string;
  answer: string;
  citedPassageIds: string[];
  citedPassages: CitedPassage[];
  responseDigest: string;
  outcome: "settled";
  settleTxHash: string | null;
  recovered: true;
}

export function executionMessage(
  chainId: number,
  contractAddress: string,
  requestId: string,
  collectionId: string,
  questionDigest: string,
  openTxHash: string,
  timestamp: number
): string {
  return [
    "datavault-execute",
    chainId,
    contractAddress.toLowerCase(),
    requestId.toLowerCase(),
    collectionId.toLowerCase(),
    questionDigest,
    openTxHash.toLowerCase(),
    timestamp,
  ].join(":");
}

export function registrationMessage(
  chainId: number,
  contractAddress: string,
  ownerAddress: string,
  contentHash: string,
  priceWei: string,
  timestamp: number
): string {
  return [
    "datavault-register",
    chainId,
    contractAddress.toLowerCase(),
    ownerAddress.toLowerCase(),
    contentHash.toLowerCase(),
    priceWei,
    timestamp,
  ].join(":");
}

export function ownerSummaryMessage(
  chainId: number,
  contractAddress: string,
  ownerAddress: string,
  timestamp: number
): string {
  return [
    "datavault-owner-summary",
    chainId,
    contractAddress.toLowerCase(),
    ownerAddress.toLowerCase(),
    timestamp,
  ].join(":");
}

export function buyerHistoryMessage(
  chainId: number,
  contractAddress: string,
  buyerAddress: string,
  timestamp: number
): string {
  return [
    "datavault-buyer-history",
    chainId,
    contractAddress.toLowerCase(),
    buyerAddress.toLowerCase(),
    timestamp,
  ].join(":");
}

export function queryRecoveryMessage(
  purpose: "answer" | "reconcile",
  chainId: number,
  contractAddress: string,
  requestId: string,
  timestamp: number
): string {
  return [
    `datavault-${purpose}`,
    chainId,
    contractAddress.toLowerCase(),
    requestId.toLowerCase(),
    timestamp,
  ].join(":");
}
