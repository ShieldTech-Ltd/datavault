import { useState } from "react";
import { useWallet } from "./lib/wallet";
import ConnectButton from "./components/ConnectButton";
import OwnerDashboard from "./components/OwnerDashboard";
import BuyerDashboard from "./components/BuyerDashboard";

type Tab = "owner" | "buyer";

export default function App() {
  const { primaryWallet } = useWallet();
  const [tab, setTab] = useState<Tab>("buyer");
  const connected = Boolean(primaryWallet);

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <span style={styles.logo}>DataVault</span>
          <span style={styles.tagline}>Paid, controlled AI access to private knowledge collections</span>
          <ConnectButton />
        </div>
      </header>

      <main style={styles.main}>
        {!connected && (
          <div style={styles.hero}>
            <h1>Connect your wallet to get started</h1>
            <p>
              Owners register a knowledge collection and set a per-query price.
              Buyers sign a Monad transaction and receive a cited AI answer.
            </p>
            <p>
              This app is a reference client for the paid-query API. Other AI services can use
              the same escrow, policy checks, and receipt flow for their own collections.
            </p>
            <p style={styles.notice}>
              Sign-in proves wallet ownership only. It does not prove content ownership or legal rights.
            </p>
          </div>
        )}

        {connected && (
          <>
            <div style={styles.tabs}>
              <button style={tab === "buyer" ? styles.tabActive : styles.tab} onClick={() => setTab("buyer")}>
                Ask a Question
              </button>
              <button style={tab === "owner" ? styles.tabActive : styles.tab} onClick={() => setTab("owner")}>
                Manage Collection
              </button>
            </div>
            {tab === "buyer" ? <BuyerDashboard /> : <OwnerDashboard />}
          </>
        )}
      </main>
      <footer style={{ padding: "1rem 0", borderTop: "1px solid #e5e7eb", fontSize: "0.8rem", color: "#6b7280" }}>
        Monad testnet demo. <a href="https://github.com/ShieldTech-Ltd/datavault" target="_blank" rel="noreferrer">Source and API details</a>.
      </footer>
    </div>
  );
}

const styles = {
  page: { fontFamily: "system-ui, sans-serif", maxWidth: 900, margin: "0 auto", padding: "0 1rem" },
  header: { borderBottom: "1px solid #e5e7eb", padding: "1rem 0", marginBottom: "2rem" },
  headerInner: { display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" as const },
  logo: { fontWeight: 700, fontSize: "1.25rem", letterSpacing: "-0.02em" },
  tagline: { color: "#6b7280", fontSize: "0.875rem", flex: 1 },
  main: { paddingBottom: "3rem" },
  hero: { textAlign: "center" as const, padding: "3rem 1rem" },
  notice: { color: "#9ca3af", fontSize: "0.8rem", marginTop: "1rem" },
  tabs: { display: "flex", gap: "0.5rem", marginBottom: "1.5rem" },
  tab: { padding: "0.5rem 1.25rem", border: "1px solid #d1d5db", borderRadius: 6, background: "white", cursor: "pointer" },
  tabActive: { padding: "0.5rem 1.25rem", border: "1px solid #6366f1", borderRadius: 6, background: "#6366f1", color: "white", cursor: "pointer", fontWeight: 600 },
} as const;
