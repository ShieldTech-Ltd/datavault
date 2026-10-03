import { DynamicWidget, useDynamicContext } from "@dynamic-labs/sdk-react-core";

export default function ConnectButton() {
  const { primaryWallet } = useDynamicContext();

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
      {primaryWallet && (
        <span style={{ fontSize: "0.8rem", color: "#6b7280", fontFamily: "monospace" }}>
          {primaryWallet.address.slice(0, 6)}...{primaryWallet.address.slice(-4)}
        </span>
      )}
      <DynamicWidget />
    </div>
  );
}
