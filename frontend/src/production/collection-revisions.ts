interface RevisionWallet {
  getAddresses(): Promise<readonly string[]>;
  getChainId(): Promise<number>;
}
export async function assertRevisionWallet(
  wallet: RevisionWallet,
  owner: string,
  chainId: number,
  isCurrent = () => true
) {
  const [addresses, chain] = await Promise.all([
    wallet.getAddresses(),
    wallet.getChainId(),
  ]);
  if (
    !isCurrent() ||
    addresses[0]?.toLowerCase() !== owner.toLowerCase() ||
    chain !== chainId
  )
    throw Error("Wallet changed. Reconnect the publishing owner and retry.");
}
export async function linkConfirmedRevision({
  wallet,
  chainId,
  owner,
  parentId,
  newId,
  csrfToken,
  isCurrent,
  fetcher = fetch,
}: {
  wallet: RevisionWallet;
  chainId: number;
  owner: string;
  parentId: string;
  newId: string;
  csrfToken: string;
  isCurrent: () => boolean;
  fetcher?: typeof fetch;
}) {
  await assertRevisionWallet(wallet, owner, chainId, isCurrent);
  let response: Response;
  try {
    response = await fetcher(`/api/collections/${parentId}/revisions`, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken,
      },
      body: JSON.stringify({ collectionId: newId }),
    });
  } catch {
    throw Error(
      "The new collection was published but not linked. Keep both collection IDs and retry the link."
    );
  }
  await assertRevisionWallet(wallet, owner, chainId, isCurrent);
  if (!response.ok)
    throw Error(
      "The new collection was published but not linked. Keep both collection IDs, refresh the current version and retry the link."
    );
  return response.json();
}
