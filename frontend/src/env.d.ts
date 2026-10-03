/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DYNAMIC_ENVIRONMENT_ID: string;
  readonly VITE_CONTRACT_ADDRESS: string;
  readonly VITE_CHAIN_ID: string;
  readonly VITE_CHAIN_RPC_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
