export interface Env {
  COLLECTION_STORE: R2Bucket;
  DB: D1Database;
  ASSETS: Fetcher;

  // Vars (non-secret, set in wrangler.toml or .dev.vars)
  CONTRACT_ADDRESS: string;
  MONAD_RPC_URL: string;
  MODEL_PROVIDER: string;
  CHAIN_ID: string;
  ALLOWED_ORIGINS?: string; // comma-separated list of allowed request origins

  // Secrets (set via wrangler secret put)
  SETTLEMENT_PRIVATE_KEY: string;
  MODEL_API_KEY: string;
  MODEL_API_BASE?: string;
  MODEL_NAME?: string;
}

export interface CollectionRow {
  collection_id: string;
  owner_address: string;
  collection_name: string;
  content_hash: string;
  policy_version: number;
  active: number;
  status: "staging" | "confirmed" | "orphaned";
  staged_at: number | null;
  confirmed_tx: string | null;
  created_at: number;
}

export interface QueryRow {
  request_id: string;
  collection_id: string;
  buyer_address: string;
  tx_hash: string | null;
  policy_version: number;
  passage_ids: string;
  response_digest: string | null;
  outcome: string;
  created_at: number;
  settled_at: number | null;
}

export interface OnChainCollection {
  owner: string;
  operator: string;
  price: bigint;
  policyVersion: number;
  active: boolean;
}
