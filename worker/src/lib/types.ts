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
  DEMO_COLLECTION_ID?: string;

  // Secrets (set via wrangler secret put)
  SETTLEMENT_PRIVATE_KEY: string;
  MODEL_API_KEY: string;
  MODEL_API_BASE?: string;
  MODEL_NAME?: string;
}

export interface CollectionRow {
  collection_id: string;
  chain_id: number | null;
  contract_address: string | null;
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

// outcome state machine:
//   pending -> running -> answer_recorded -> settling -> settlement_pending -> settled
//                     \-> failed
//   pending -> refundable  (set externally when timeout observed)
export interface QueryRow {
  request_id: string;
  collection_id: string;
  buyer_address: string;
  open_tx_hash: string | null;
  settle_tx_hash: string | null;
  refund_tx_hash: string | null;
  chain_id: number | null;
  contract_address: string | null;
  content_hash: string | null;
  amount_wei: string | null;
  policy_version: number;
  question_digest: string;
  passage_ids: string;
  response_digest: string | null;
  answer_text: string | null;
  outcome: string;
  claimed_at: number | null;
  lease_expires_at: number | null;
  lease_token: string | null;
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
