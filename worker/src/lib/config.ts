import { privateKeyToAccount } from "viem/accounts";
import { isValidAddress } from "./validation";
import type { Env, OnChainCollection } from "./types";
import { modelApiBase } from "./model-endpoint";
import publicTestWallets from "../../../shared/public-test-wallets.json";

const SECP256K1_ORDER = BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141");
const PUBLIC_TEST_WALLETS = new Set(publicTestWallets);

export function settlementKeyConfigured(key: string | undefined): boolean {
  if (!/^0x[0-9a-fA-F]{64}$/.test(key ?? "")) return false;
  const scalar = BigInt(key as string);
  if (scalar < (1n << 128n) || scalar >= SECP256K1_ORDER) return false;
  if (/^(?:0x)([0-9a-f]{2})\1{31}$/.test((key as string).toLowerCase())) return false;
  try {
    return !PUBLIC_TEST_WALLETS.has(privateKeyToAccount(key as `0x${string}`).address.toLowerCase());
  } catch {
    return false;
  }
}

export function paidServiceConfigured(env: Env): boolean {
  if (!isValidAddress(env.CONTRACT_ADDRESS) ||
      !settlementKeyConfigured(env.SETTLEMENT_PRIVATE_KEY) ||
      typeof env.MODEL_API_KEY !== "string" || !env.MODEL_API_KEY.trim()) return false;
  if (env.MODEL_PROVIDER !== "openai" && env.MODEL_PROVIDER !== "kimi") return false;
  if (env.MODEL_PROVIDER === "kimi" &&
      (!env.MODEL_API_BASE || !env.MODEL_NAME?.trim())) return false;
  try {
    modelApiBase(env.MODEL_API_BASE);
  } catch {
    return false;
  }
  return true;
}

export function operatorMatches(env: Env, collection: OnChainCollection): boolean {
  return paidServiceConfigured(env) &&
    privateKeyToAccount(env.SETTLEMENT_PRIVATE_KEY as `0x${string}`).address.toLowerCase() ===
      collection.operator.toLowerCase();
}
