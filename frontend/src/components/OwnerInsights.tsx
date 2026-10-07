import { useState } from "react";
import { formatEther } from "viem";
import { useWallet } from "@/lib/wallet";
import { CONTRACT_ADDRESS } from "@/lib/contract";
import { ownerSummaryMessage } from "../../../shared/api";

interface Insights {
  confirmedCollections: number;
  paidQueries: number;
  recordedRevenueWei: string | null;
  revenueCoverage: { knownAmounts: number; settledQueries: number };
  recentActivity: Array<{
    requestId: string;
    collectionName: string;
    amountWei: string | null;
    settledAt: number | null;
  }>;
}

interface OwnedCollection {
  collectionId: string;
  name: string;
  active: boolean;
  priceWei: string;
  paidQueries: number;
}

export default function OwnerInsights({
  onManage,
}: {
  onManage: (id: string) => void;
}) {
  const { primaryWallet } = useWallet();
  const [data, setData] = useState<Insights | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");
  const [collections, setCollections] = useState<OwnedCollection[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [listStatus, setListStatus] = useState<"idle" | "loading" | "error">(
    "idle"
  );

  async function signedOwnerHeaders() {
    if (!primaryWallet || !CONTRACT_ADDRESS)
      throw new Error("Connect an owner wallet first.");
    const client = await primaryWallet.getWalletClient();
    const chainId = Number(import.meta.env.VITE_CHAIN_ID) || 10143;
    if ((await client.getChainId()) !== chainId)
      throw new Error("Switch your wallet to Monad testnet first.");
    const timestamp = Date.now();
    const address = primaryWallet.address.toLowerCase();
    const signature = await client.signMessage({
      message: ownerSummaryMessage(
        chainId,
        CONTRACT_ADDRESS,
        address,
        timestamp
      ),
    });
    return {
      address,
      headers: { "x-signature": signature, "x-timestamp": String(timestamp) },
    };
  }

  async function loadCollections(offset = 0) {
    setListStatus("loading");
    try {
      const { address, headers } = await signedOwnerHeaders();
      const response = await fetch(
        `/api/owner/collections?address=${encodeURIComponent(
          address
        )}&limit=24&offset=${offset}`,
        { headers }
      );
      if (!response.ok)
        throw new Error("Your collection list is unavailable. Try again.");
      const result = (await response.json()) as {
        collections: OwnedCollection[];
        hasMore: boolean;
      };
      setCollections((current) =>
        offset === 0 ? result.collections : [...current, ...result.collections]
      );
      setHasMore(result.hasMore);
      setListStatus("idle");
    } catch (cause) {
      setListStatus("error");
      setMessage(
        cause instanceof Error ? cause.message : "Could not load collections."
      );
    }
  }

  async function load() {
    if (!primaryWallet || !CONTRACT_ADDRESS) return;
    setStatus("loading");
    setMessage("");
    try {
      const { address, headers } = await signedOwnerHeaders();
      const response = await fetch(
        `/api/owner/analytics?address=${encodeURIComponent(address)}`,
        { headers }
      );
      if (!response.ok)
        throw new Error(
          "Owner analytics are unavailable. Check the network and try again."
        );
      setData((await response.json()) as Insights);
      setStatus("idle");
      void loadCollections();
    } catch (cause) {
      setStatus("error");
      setMessage(
        cause instanceof Error
          ? cause.message
          : "Could not load owner analytics."
      );
    }
  }

  return (
    <section
      className="owner-insights"
      aria-labelledby="owner-insights-heading"
    >
      <div className="owner-insights-head">
        <div>
          <h2 id="owner-insights-heading">Your collection activity</h2>
          <p>Last 30 days of recorded DataVault settlements.</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={status === "loading" || !CONTRACT_ADDRESS}
        >
          {status === "loading" ? "Loading..." : "Load my workspace"}
        </button>
      </div>
      {!CONTRACT_ADDRESS && (
        <p className="workspace-muted">
          Owner analytics become available after the contract is configured.
        </p>
      )}
      {message && (
        <p className="workspace-error" role="status">
          {message}
        </p>
      )}
      {collections.length > 0 && (
        <div className="app-data-card">
          <h3>Your collections</h3>
          <ol>
            {collections.map((collection) => (
              <li key={collection.collectionId}>
                <span>
                  {collection.name}
                  <small>
                    {collection.active ? "Active" : "Paused"} on Monad,{" "}
                    {collection.paidQueries} settled queries
                  </small>
                </span>
                <button
                  type="button"
                  onClick={() => onManage(collection.collectionId)}
                >
                  Manage
                </button>
              </li>
            ))}
          </ol>
          {hasMore && (
            <button
              type="button"
              onClick={() => void loadCollections(collections.length)}
              disabled={listStatus === "loading"}
            >
              Load more collections
            </button>
          )}
        </div>
      )}
      {data && (
        <>
          <div className="app-metrics">
            <div>
              <span>Confirmed collections</span>
              <strong>{data.confirmedCollections}</strong>
            </div>
            <div>
              <span>Settled queries</span>
              <strong>{data.paidQueries}</strong>
            </div>
            <div>
              <span>Recorded revenue</span>
              <strong>
                {data.recordedRevenueWei === null
                  ? "Unavailable"
                  : `${
                      data.revenueCoverage.knownAmounts <
                      data.revenueCoverage.settledQueries
                        ? "At least "
                        : ""
                    }${Number(
                      formatEther(BigInt(data.recordedRevenueWei))
                    ).toLocaleString(undefined, {
                      maximumFractionDigits: 4,
                    })} MON`}
              </strong>
              <small>
                {data.revenueCoverage.knownAmounts <
                data.revenueCoverage.settledQueries
                  ? "Older amounts are missing"
                  : "Exact for recorded payments"}
              </small>
            </div>
          </div>
          <div className="app-data-card">
            <h3>Recent paid queries</h3>
            {data.recentActivity.length ? (
              <ol>
                {data.recentActivity.map((item) => (
                  <li key={item.requestId}>
                    <span>
                      {item.collectionName}
                      <small>
                        {item.settledAt
                          ? new Date(item.settledAt).toLocaleString()
                          : "Time unavailable"}
                      </small>
                    </span>
                    <strong>
                      {item.amountWei
                        ? `${Number(
                            formatEther(BigInt(item.amountWei))
                          ).toLocaleString(undefined, {
                            maximumFractionDigits: 4,
                          })} MON`
                        : "Amount unavailable"}
                    </strong>
                  </li>
                ))}
              </ol>
            ) : (
              <p>No settled queries in this period.</p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
