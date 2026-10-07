import { privateKeyToAccount } from "viem/accounts";
import { isValidAddress } from "./validation";
import type { Env, OnChainCollection } from "./types";

export function paidServiceConfigured(env: Env): boolean {
  return isValidAddress(env.CONTRACT_ADDRESS) &&
    /^0x[0-9a-fA-F]{64}$/.test(env.SETTLEMENT_PRIVATE_KEY ?? "") &&
    typeof env.MODEL_API_KEY === "string" && env.MODEL_API_KEY.trim().length > 0;
}

export function operatorMatches(env: Env, collection: OnChainCollection): boolean {
  return paidServiceConfigured(env) &&
    privateKeyToAccount(env.SETTLEMENT_PRIVATE_KEY as `0x${string}`).address.toLowerCase() ===
      collection.operator.toLowerCase();
}
