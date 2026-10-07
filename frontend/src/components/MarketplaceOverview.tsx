import { useEffect, useState } from "react";
import { formatEther } from "viem";

interface Collection {
  collectionId: string;
  name: string;
  ownerAddress: string;
  paidQueries: number;
  priceWei: string;
  active: boolean;
  queryAvailable: boolean;
}
interface Analytics {
  periodDays: number;
  confirmedCollections: number;
  paidQueries: number;
  recordedRevenueWei: string | null;
  revenueCoverage: { knownAmounts: number; settledQueries: number };
  topCollections: Array<{
    collectionId: string;
    name: string;
    paidQueries: number;
    recordedRevenueWei: string;
  }>;
  rankingAvailable: boolean;
  recentActivity: Array<{
    requestId: string;
    collectionName: string;
    amountWei: string | null;
    settledAt: number | null;
    settleTxHash: string | null;
  }>;
}

function mon(value: string | null): string {
  if (!value) return "Unavailable";
  try {
    return `${Number(formatEther(BigInt(value))).toLocaleString(undefined, {
      maximumFractionDigits: 4,
    })} MON`;
  } catch {
    return "Unavailable";
  }
}
function short(value: string): string {
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export default function MarketplaceOverview({
  onSelect,
  search,
}: {
  onSelect: (id: string) => void;
  search: string;
}) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [catalogueState, setCatalogueState] = useState<
    "loading" | "ready" | "unavailable"
  >("loading");
  const [analyticsState, setAnalyticsState] = useState<
    "loading" | "ready" | "unavailable"
  >("loading");

  useEffect(() => {
    let active = true;
    setCatalogueState("loading");
    setCollections([]);
    fetch(`/api/collections?limit=12&search=${encodeURIComponent(search)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Catalogue unavailable");
        return response.json() as Promise<{ collections: Collection[] }>;
      })
      .then((result) => {
        if (active) {
          setCollections(result.collections);
          setCatalogueState("ready");
        }
      })
      .catch(() => {
        if (active) {
          setCollections([]);
          setCatalogueState("unavailable");
        }
      });
    return () => {
      active = false;
    };
  }, [search]);

  useEffect(() => {
    let active = true;
    fetch("/api/marketplace/analytics")
      .then(async (response) => {
        if (!response.ok) throw new Error("Analytics unavailable");
        return response.json() as Promise<Analytics>;
      })
      .then((result) => {
        if (active) {
          setAnalytics(result);
          setAnalyticsState("ready");
        }
      })
      .catch(() => {
        if (active) setAnalyticsState("unavailable");
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <>
      <section className="app-section" aria-labelledby="collections-heading">
        <div className="app-section-heading">
          <div>
            <p className="app-eyebrow">Marketplace</p>
            <h2 id="collections-heading">
              {search
                ? `Results for “${search}”`
                : "Collections available today"}
            </h2>
            <p>Confirmed collections with policy checked against Monad.</p>
          </div>
        </div>
        {catalogueState === "loading" && (
          <p className="app-state">Checking collections on Monad...</p>
        )}
        {catalogueState === "unavailable" && (
          <p className="app-state" role="status">
            Verified collections are temporarily unavailable. Check the contract
            configuration and Monad connection.
          </p>
        )}
        {catalogueState === "ready" && collections.length === 0 && (
          <p className="app-state">
            {search
              ? "No collections match this search."
              : "No verified collections are available yet. An owner can publish the first one."}
          </p>
        )}
        {collections.length > 0 && (
          <div className="app-collection-grid">
            {collections.map((collection) => (
              <article
                className="app-collection-card"
                key={collection.collectionId}
              >
                <div className="app-card-top">
                  <span className="app-collection-icon">D</span>
                  <span
                    className={`app-status ${
                      collection.active ? "active" : ""
                    }`}
                  >
                    {collection.active ? "Active on Monad" : "Paused"}
                  </span>
                </div>
                <h3>{collection.name}</h3>
                <p>Owned by {short(collection.ownerAddress)}</p>
                <div className="app-card-meta">
                  <span>{collection.paidQueries} settled queries</span>
                  <span>{mon(collection.priceWei)} per query</span>
                </div>
                <button
                  type="button"
                  onClick={() => onSelect(collection.collectionId)}
                  disabled={!collection.queryAvailable}
                >
                  {collection.queryAvailable
                    ? "Ask this collection"
                    : "Queries unavailable"}
                  <span aria-hidden="true">&#8594;</span>
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
      <section
        className="app-section app-analytics"
        aria-labelledby="activity-heading"
      >
        <div className="app-section-heading">
          <div>
            <p className="app-eyebrow">Recorded activity</p>
            <h2 id="activity-heading">What the service has settled</h2>
            <p>Last 30 days, from confirmed DataVault settlement records.</p>
          </div>
        </div>
        {analyticsState === "loading" && (
          <p className="app-state">Loading recorded activity...</p>
        )}
        {analyticsState === "unavailable" && (
          <p className="app-state">
            Recorded activity is currently unavailable.
          </p>
        )}
        {analytics && (
          <>
            <div className="app-metrics">
              <div>
                <span>Confirmed collections</span>
                <strong>{analytics.confirmedCollections}</strong>
              </div>
              <div>
                <span>Settled queries</span>
                <strong>{analytics.paidQueries}</strong>
              </div>
              <div>
                <span>Recorded creator revenue</span>
                <strong>
                  {analytics.recordedRevenueWei === null
                    ? "Unavailable"
                    : `${
                        analytics.revenueCoverage.knownAmounts <
                        analytics.revenueCoverage.settledQueries
                          ? "At least "
                          : ""
                      }${mon(analytics.recordedRevenueWei)}`}
                </strong>
                <small>
                  {analytics.revenueCoverage.knownAmounts <
                  analytics.revenueCoverage.settledQueries
                    ? "Older payments lack amount records"
                    : "Exact for recorded payments"}
                </small>
              </div>
            </div>
            <div className="app-analytics-grid">
              <div className="app-data-card">
                <h3>Top earning collections</h3>
                {!analytics.rankingAvailable ? (
                  <p>
                    Ranking is unavailable while older settlement amounts are
                    missing.
                  </p>
                ) : analytics.topCollections.length ? (
                  <ol>
                    {analytics.topCollections.map((item) => (
                      <li key={item.collectionId}>
                        <span>{item.name}</span>
                        <strong>{mon(item.recordedRevenueWei)}</strong>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p>No settled queries in this period.</p>
                )}
              </div>
              <div className="app-data-card">
                <h3>Recent settlements</h3>
                {analytics.recentActivity.length ? (
                  <ol>
                    {analytics.recentActivity.map((item) => (
                      <li key={item.requestId}>
                        <span>
                          {item.collectionName}
                          <small>
                            {item.settledAt
                              ? new Date(item.settledAt).toLocaleString()
                              : "Time unavailable"}
                          </small>
                        </span>
                        <strong>{mon(item.amountWei)}</strong>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p>No settlements recorded in this period.</p>
                )}
              </div>
            </div>
          </>
        )}
      </section>
    </>
  );
}
