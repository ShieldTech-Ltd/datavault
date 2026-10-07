import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createWalletClient, custom, isAddress, type Address, type EIP1193Provider } from "viem";
import { monadTestnet } from "./network";

type InjectedProvider = EIP1193Provider;

function injected(): InjectedProvider | undefined {
  return (window as Window & { ethereum?: InjectedProvider }).ethereum;
}

function firstAddress(value: unknown): Address | null {
  return Array.isArray(value) && typeof value[0] === "string" && isAddress(value[0])
    ? value[0] as Address : null;
}

const monadChain = {
  id: monadTestnet.chainId,
  name: monadTestnet.name,
  nativeCurrency: monadTestnet.nativeCurrency,
  rpcUrls: { default: { http: monadTestnet.rpcUrls } },
  blockExplorers: { default: { name: "Monad Explorer", url: monadTestnet.blockExplorerUrls[0] } },
};

function walletFor(provider: InjectedProvider, address: Address) {
  return createWalletClient({ account: address, chain: monadChain, transport: custom(provider) });
}

type Wallet = { address: Address; getWalletClient: () => Promise<ReturnType<typeof walletFor>> };
type WalletContextValue = {
  primaryWallet: Wallet | null;
  connect: () => Promise<void>;
  error: string | null;
  hasProvider: boolean;
  correctNetwork: boolean;
  switchNetwork: () => Promise<void>;
};

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [provider, setProvider] = useState<InjectedProvider | null>(null);
  const [address, setAddress] = useState<Address | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);

  useEffect(() => {
    const walletProvider = injected();
    if (!walletProvider) return;
    setProvider(walletProvider);
    let active = true;
    walletProvider.request({ method: "eth_accounts" })
      .then((accounts) => { if (active) setAddress(firstAddress(accounts)); })
      .catch(() => { if (active) setAddress(null); });
    walletProvider.request({ method: "eth_chainId" })
      .then((value) => { if (active && typeof value === "string") setChainId(Number(value)); })
      .catch(() => { if (active) setChainId(null); });
    const onAccounts = (accounts: string[]) => setAddress(firstAddress(accounts));
    const onChain = (value: string) => setChainId(Number(value));
    const onDisconnect = () => setAddress(null);
    walletProvider.on("accountsChanged", onAccounts);
    walletProvider.on("chainChanged", onChain);
    walletProvider.on("disconnect", onDisconnect);
    return () => {
      active = false;
      walletProvider.removeListener("accountsChanged", onAccounts);
      walletProvider.removeListener("chainChanged", onChain);
      walletProvider.removeListener("disconnect", onDisconnect);
    };
  }, []);

  async function connect() {
    const walletProvider = provider ?? injected();
    if (!walletProvider) { setError("Install an EVM wallet or open this site in a wallet browser."); return; }
    setError(null);
    try {
      const next = firstAddress(await walletProvider.request({ method: "eth_requestAccounts" }));
      if (!next) throw new Error("The wallet did not provide an account.");
      setProvider(walletProvider);
      setAddress(next);
      const currentChain = await walletProvider.request({ method: "eth_chainId" });
      setChainId(typeof currentChain === "string" ? Number(currentChain) : null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Wallet connection failed.");
    }
  }

  async function switchNetwork() {
    const walletProvider = provider ?? injected();
    if (!walletProvider) { setError("Connect an EVM wallet first."); return; }
    setError(null);
    const chainIdHex = `0x${monadTestnet.chainId.toString(16)}`;
    try {
      try {
        await walletProvider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chainIdHex }] });
      } catch (cause) {
        if (!(cause && typeof cause === "object" && "code" in cause && cause.code === 4902)) throw cause;
        await walletProvider.request({ method: "wallet_addEthereumChain", params: [{
          chainId: chainIdHex, chainName: monadTestnet.name,
          nativeCurrency: monadTestnet.nativeCurrency,
          rpcUrls: monadTestnet.rpcUrls,
          blockExplorerUrls: monadTestnet.blockExplorerUrls,
        }] });
        await walletProvider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chainIdHex }] });
      }
      const current = await walletProvider.request({ method: "eth_chainId" });
      const selected = typeof current === "string" ? Number(current) : null;
      setChainId(selected);
      if (selected !== monadTestnet.chainId) throw new Error("Wallet did not switch to Monad testnet.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Network switch failed.");
    }
  }

  const primaryWallet = useMemo<Wallet | null>(() => provider && address ? ({
    address,
    getWalletClient: async () => {
      const current = firstAddress(await provider.request({ method: "eth_accounts" }));
      if (!current || current.toLowerCase() !== address.toLowerCase()) {
        throw new Error("Wallet account changed. Review the connected account and try again.");
      }
      return walletFor(provider, current);
    },
  }) : null, [provider, address]);

  return <WalletContext.Provider value={{ primaryWallet, connect, error, hasProvider: Boolean(provider),
    correctNetwork: chainId === monadTestnet.chainId, switchNetwork }}>
    {children}
  </WalletContext.Provider>;
}

export function useWallet() {
  const value = useContext(WalletContext);
  if (!value) throw new Error("WalletProvider is missing.");
  return value;
}
