// Public Monad network configuration shared by the read and wallet clients.
interface EvmNetwork {
  blockExplorerUrls: string[];
  chainId: number;
  chainName: string;
  iconUrls: string[];
  name: string;
  nativeCurrency: { decimals: number; name: string; symbol: string };
  networkId: number;
  rpcUrls: string[];
  vanityName: string;
}

export const monadTestnet: EvmNetwork = {
  blockExplorerUrls: ["https://testnet.monadexplorer.com"],
  chainId: Number(import.meta.env.VITE_CHAIN_ID) || 10143,
  chainName: "Monad Testnet",
  iconUrls: [],
  name: "Monad Testnet",
  nativeCurrency: { decimals: 18, name: "MON", symbol: "MON" },
  networkId: Number(import.meta.env.VITE_CHAIN_ID) || 10143,
  rpcUrls: [import.meta.env.VITE_CHAIN_RPC_URL || "https://testnet-rpc.monad.xyz"],
  vanityName: "Monad Testnet",
};

export function transactionExplorerUrl(hash: string | null): string | null {
  if (
    monadTestnet.chainId !== 10143 ||
    !hash ||
    !/^0x[0-9a-fA-F]{64}$/.test(hash)
  )
    return null;
  return `${monadTestnet.blockExplorerUrls[0]}/tx/${hash}`;
}
