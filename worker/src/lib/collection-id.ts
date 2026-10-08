import { keccak256, toBytes } from "viem";

// Scope a source identity to one deployment so the same owner can republish
// unchanged content after a contract or chain migration.
export function collectionIdFor(
  chainId: number,
  contractAddress: string,
  ownerAddress: string,
  contentHash: string,
): `0x${string}` {
  return keccak256(toBytes([
    "datavault-collection-v2",
    chainId,
    contractAddress.toLowerCase(),
    ownerAddress.toLowerCase(),
    contentHash.toLowerCase(),
  ].join(":")));
}
