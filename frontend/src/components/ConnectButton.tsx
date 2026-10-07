import { useWallet } from "../lib/wallet";

export default function ConnectButton() {
  const {
    primaryWallet,
    connect,
    error,
    hasProvider,
    correctNetwork,
    switchNetwork,
  } = useWallet();

  return (
    <div className="app-wallet">
      {primaryWallet && (
        <span className="app-wallet-address">
          {primaryWallet.address.slice(0, 6)}...
          {primaryWallet.address.slice(-4)}
        </span>
      )}
      {!primaryWallet && (
        <button type="button" onClick={() => void connect()}>
          {hasProvider ? "Connect wallet" : "Wallet unavailable"}
        </button>
      )}
      {primaryWallet && !correctNetwork && (
        <button type="button" onClick={() => void switchNetwork()}>
          Switch to Monad testnet
        </button>
      )}
      {!hasProvider && !error && (
        <span className="app-wallet-help">
          Open this site in a wallet browser or install an EVM browser wallet.
        </span>
      )}
      {error && (
        <span role="alert" className="app-wallet-error">
          {error}
        </span>
      )}
    </div>
  );
}
