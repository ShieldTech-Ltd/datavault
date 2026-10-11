import { useEffect, useState } from "react";
import { useWallet } from "./lib/wallet";
import ConnectButton from "./components/ConnectButton";
import OwnerDashboard from "./components/OwnerDashboard";
import BuyerDashboard from "./components/BuyerDashboard";
import MarketplaceOverview from "./components/MarketplaceOverview";
import OwnerInsights from "./components/OwnerInsights";
import "./app.css";

type View = "marketplace" | "collection";
function viewForPath(path: string): View {
  return path === "/manage" ? "collection" : "marketplace";
}
const NETWORK_LABEL =
  Number(import.meta.env.VITE_CHAIN_ID) === 31337
    ? "Local test chain"
    : "Monad Testnet";

export default function App() {
  const { primaryWallet } = useWallet();
  const [view, setView] = useState<View>(() => viewForPath(window.location.pathname));
  const [selectedCollection, setSelectedCollection] = useState<string | null>(
    null
  );
  const [searchInput, setSearchInput] = useState("");
  const [collectionSearch, setCollectionSearch] = useState("");
  const [managedCollection, setManagedCollection] = useState<string | null>(
    null
  );

  useEffect(() => {
    setManagedCollection(null);
  }, [primaryWallet?.address]);

  useEffect(() => {
    function onPopState() {
      setView(viewForPath(window.location.pathname));
      if (window.location.pathname === "/query") {
        window.setTimeout(() => document.getElementById("workspace")?.scrollIntoView(), 0);
      }
    }
    window.addEventListener("popstate", onPopState);
    onPopState();
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function navigate(path: "/" | "/query" | "/manage") {
    if (window.location.pathname !== path) window.history.pushState(null, "", path);
    setView(viewForPath(path));
  }

  function showCollection() {
    navigate("/manage");
    window.setTimeout(
      () =>
        document
          .getElementById("main-content")
          ?.scrollIntoView({ behavior: "smooth" }),
      0
    );
  }

  function showMarketplaceSection(id: string) {
    navigate(id === "workspace" ? "/query" : "/");
    window.setTimeout(
      () => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }),
      0
    );
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <a className="app-brand" href="/" aria-label="DataVault home">
            <span className="app-brand-mark">D</span>
            <span>DataVault</span>
          </a>
          <nav className="app-nav" aria-label="Primary navigation">
            <button
              type="button"
              className={view === "marketplace" ? "active" : ""}
              onClick={() => navigate("/")}
            >
              Marketplace
            </button>
            <a
              href="#collections-heading"
              onClick={() => showMarketplaceSection("collections-heading")}
            >
              Collections
            </a>
            <a
              href="#workspace"
              onClick={() => showMarketplaceSection("workspace")}
            >
              Query workspace
            </a>
            <a
              href="#marketplace-analytics"
              onClick={() => showMarketplaceSection("marketplace-analytics")}
            >
              Analytics
            </a>
            <button
              type="button"
              className={view === "collection" ? "active" : ""}
              onClick={showCollection}
            >
              My collection
            </button>
          </nav>
          <form
            className="app-search"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              setCollectionSearch(searchInput.trim());
              navigate("/");
              window.setTimeout(
                () =>
                  document
                    .getElementById("collections-heading")
                    ?.scrollIntoView({ behavior: "smooth" }),
                0
              );
            }}
          >
            <label className="sr-only" htmlFor="collection-search">
              Search collections
            </label>
            <input
              id="collection-search"
              value={searchInput}
              maxLength={64}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search collections"
            />
            <button type="submit">Search</button>
          </form>
          <div className="app-header-actions">
            <span className="app-network">
              <span aria-hidden="true" /> {NETWORK_LABEL}
            </span>
            <ConnectButton />
          </div>
        </div>
      </header>

      <main className="app-main" id="main-content">
        {view === "marketplace" ? (
          <>
            <div className="app-top-grid">
              <section className="app-hero" aria-labelledby="hero-heading">
                <div className="app-hero-copy">
                  <div className="app-welcome">
                    <strong>Welcome to DataVault</strong>
                    <span>
                      Explore knowledge collections and review each paid answer's receipt.
                    </span>
                  </div>
                  <p className="app-eyebrow">Knowledge marketplace on Monad</p>
                  <h1 id="hero-heading">
                    Private knowledge,
                    <br />
                    <span>paid queries on Monad.</span>
                  </h1>
                  <p>
                    Owners set the price and access policy. Buyers pay for one
                    question and receive an answer tied to private source
                    passages.
                  </p>
                  <div className="app-hero-actions">
                    <a className="app-primary-link" href="#workspace" onClick={() => showMarketplaceSection("workspace")}>
                      Ask a paid query <span aria-hidden="true">&#8594;</span>
                    </a>
                    <button
                      type="button"
                      className="app-secondary-button"
                      onClick={showCollection}
                    >
                      Publish a collection
                    </button>
                  </div>
                  <div className="app-hero-points">
                    <span>Source citations</span>
                    <span>Escrow on Monad</span>
                    <span>Owner-controlled access</span>
                  </div>
                </div>
                <div className="app-hero-art" aria-hidden="true">
                  <div className="art-orbit">
                    <div className="art-sheet art-sheet-back" />
                    <div className="art-sheet art-sheet-mid" />
                    <div className="art-sheet art-sheet-front">
                      <span />
                      <span />
                      <span />
                    </div>
                    <div className="art-check" />
                  </div>
                  <p>
                    Private knowledge
                    <br />
                    Clear terms
                  </p>
                </div>
              </section>

              <section className="app-section" id="workspace">
                <div className="app-section-heading">
                  <div>
                    <p className="app-eyebrow">Query workspace</p>
                    <h2>Ask a collection</h2>
                    <p>
                      Review the current price and policy before your wallet
                      opens escrow.
                    </p>
                  </div>
                  <span className="app-section-badge">Live data only</span>
                </div>
                <BuyerDashboard
                  key={primaryWallet?.address.toLowerCase() ?? "disconnected"}
                  selectedCollection={selectedCollection}
                />
              </section>
            </div>
            <MarketplaceOverview
              search={collectionSearch}
              onSelect={(id) => {
                setSelectedCollection(id);
                navigate("/query");
                document
                  .getElementById("workspace")
                  ?.scrollIntoView({ behavior: "smooth" });
              }}
            />
            <section className="app-process" aria-label="How DataVault works">
              <div>
                <span>01</span>
                <h3>Owner sets the terms</h3>
                <p>
                  A collection owner registers a price and can pause new access
                  on Monad.
                </p>
              </div>
              <div>
                <span>02</span>
                <h3>Buyer opens escrow</h3>
                <p>
                  The buyer signs a transaction for the displayed price. The
                  service verifies it before retrieval.
                </p>
              </div>
              <div>
                <span>03</span>
                <h3>Answer has a receipt</h3>
                <p>
                  After a cited answer is generated, settlement pays the owner.
                  Failed open escrow can be refunded after timeout.
                </p>
              </div>
            </section>
          </>
        ) : (
          <section className="app-section app-owner-section">
            <div className="app-section-heading">
              <div>
                <p className="app-eyebrow">Owner workspace</p>
                <h1>Publish and control your knowledge</h1>
                <p>
                  Register a Markdown collection, set a query price, and pause
                  or resume new access.
                </p>
              </div>
            </div>
            {primaryWallet ? (
              <div className="app-owner-stack">
                <OwnerInsights
                  key={primaryWallet.address.toLowerCase()}
                  onManage={setManagedCollection}
                />
                <div className="app-owner-card">
                  <OwnerDashboard
                    key={primaryWallet.address.toLowerCase()}
                    selectedCollection={managedCollection}
                    onForget={() => setManagedCollection(null)}
                  />
                </div>
              </div>
            ) : (
              <div className="app-owner-card app-connect-state">
                <h2>Connect an owner wallet</h2>
                <p>
                  A wallet signature is required to register a collection and
                  change its on-chain policy.
                </p>
                <ConnectButton />
              </div>
            )}
          </section>
        )}
      </main>

      <footer className="app-footer">
        <span>DataVault on {NETWORK_LABEL}</span>
        <a
          href="https://github.com/ShieldTech-Ltd/datavault"
          target="_blank"
          rel="noreferrer"
        >
          Source code and API
        </a>
        <span>Content hashes record integrity, not ownership.</span>
      </footer>
    </div>
  );
}
