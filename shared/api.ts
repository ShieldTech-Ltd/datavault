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
  timestamp: number,
): string {
  return [
    "datavault-execute", chainId, contractAddress.toLowerCase(),
    requestId.toLowerCase(), collectionId.toLowerCase(), questionDigest,
    openTxHash.toLowerCase(), timestamp,
  ].join(":");
}

export function registrationMessage(
  chainId: number,
  contractAddress: string,
  ownerAddress: string,
  contentHash: string,
  priceWei: string,
  timestamp: number,
): string {
  return ["datavault-register", chainId, contractAddress.toLowerCase(),
    ownerAddress.toLowerCase(), contentHash.toLowerCase(), priceWei, timestamp].join(":");
}
