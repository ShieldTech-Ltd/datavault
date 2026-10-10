import { useWallet } from "../lib/wallet";

export default function ConnectButton() {
  const { primaryWallet, connect, error, hasProvider, correctNetwork, switchNetwork } = useWallet();

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
      {primaryWallet && (
        <div style={chip}>
          <span style={chipDot} aria-hidden="true" />
          <span style={{ fontFamily: "monospace", fontSize: "0.75rem", color: "var(--accent)", letterSpacing: "0.01em" }}>
            {primaryWallet.address.slice(0, 6)}…{primaryWallet.address.slice(-4)}
          </span>
        </div>
      )}
      {primaryWallet && !correctNetwork && (
        <button type="button" onClick={() => void switchNetwork()} style={warningBtn}>
          Switch Network
        </button>
      )}
      {!primaryWallet && (
        <button type="button" onClick={() => void connect()} style={hasProvider ? connectBtn : unavailableBtn} disabled={!hasProvider}>
          {hasProvider ? (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }} aria-hidden="true">
                <rect x="2" y="7" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="2"/>
                <path d="M16 14a1 1 0 100-2 1 1 0 000 2z" fill="currentColor"/>
                <path d="M2 10h20" stroke="currentColor" strokeWidth="2"/>
              </svg>
              Connect Wallet
            </>
          ) : "No Wallet Detected"}
        </button>
      )}
      {!hasProvider && !error && (
        <span style={{ fontSize: "0.72rem", color: "var(--text-3)", maxWidth: 160, lineHeight: 1.4 }}>
          Install an EVM browser wallet to continue.
        </span>
      )}
      {error && (
        <span role="alert" style={{ color: "var(--red)", fontSize: "0.75rem", maxWidth: 200 }}>{error}</span>
      )}
    </div>
  );
}

const chip: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: "0.4rem",
  padding: "0.35rem 0.7rem",
  background: "var(--accent-bg)", border: "1px solid var(--accent-bdr)",
  borderRadius: 20, cursor: "default", userSelect: "none",
};
const chipDot: React.CSSProperties = {
  width: 6, height: 6, borderRadius: "50%",
  background: "var(--accent)", boxShadow: "0 0 0 2px var(--accent-bdr)",
  flexShrink: 0,
};
const connectBtn: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: "0.4rem",
  padding: "0.38rem 0.875rem",
  background: "linear-gradient(135deg,#7c3aed,#6366f1)",
  border: "none", borderRadius: 20, color: "white",
  fontSize: "0.78rem", fontWeight: 600, cursor: "pointer",
  whiteSpace: "nowrap",
  boxShadow: "0 2px 8px rgba(124,58,237,0.3)",
};
const warningBtn: React.CSSProperties = {
  padding: "0.35rem 0.75rem",
  background: "var(--yellow-bg)", border: "1px solid rgba(217,119,6,0.3)",
  borderRadius: 20, color: "var(--yellow)",
  fontSize: "0.75rem", fontWeight: 600, cursor: "pointer",
  whiteSpace: "nowrap",
};
const unavailableBtn: React.CSSProperties = {
  padding: "0.35rem 0.75rem",
  background: "var(--surface-2)", border: "1px solid var(--border)",
  borderRadius: 20, color: "var(--text-3)",
  fontSize: "0.75rem", fontWeight: 500, cursor: "not-allowed",
  whiteSpace: "nowrap",
};
