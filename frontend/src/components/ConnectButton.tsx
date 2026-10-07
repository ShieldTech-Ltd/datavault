import { useWallet } from "../lib/wallet";

export default function ConnectButton() {
  const { primaryWallet, connect, error, hasProvider } = useWallet();

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
      {primaryWallet && (
        <span style={{ fontSize: "0.8rem", color: "#6b7280", fontFamily: "monospace" }}>
          {primaryWallet.address.slice(0, 6)}...{primaryWallet.address.slice(-4)}
        </span>
      )}
      {!primaryWallet && <button type="button" onClick={() => void connect()}>
        {hasProvider ? "Connect wallet" : "Wallet unavailable"}
      </button>}
      {!hasProvider && !error && <span style={{ fontSize: "0.8rem", color: "#6b7280" }}>
        Open this site in a wallet browser or install an EVM browser wallet.
      </span>}
      {error && <span role="alert" style={{ color: "#b91c1c", fontSize: "0.8rem" }}>{error}</span>}
    </div>
  );
}
