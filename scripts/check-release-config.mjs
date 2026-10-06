#!/usr/bin/env node
// Offline guard for public, non-secret deployment configuration.
import { readFileSync } from "node:fs";

const errors = [];
const workerConfig = readFileSync(new URL("../worker/wrangler.toml", import.meta.url), "utf8");
const setting = (name) => {
  const match = workerConfig.match(new RegExp(`^${name}\\s*=\\s*"([^"]*)"`, "m"));
  return match?.[1] ?? "";
};
const isAddress = (value) => /^0x[0-9a-fA-F]{40}$/.test(value);
const isBytes32 = (value) => /^0x[0-9a-fA-F]{64}$/.test(value);
const requiredUrl = (name, value) => {
  try {
    const parsed = new URL(value);
    if (parsed.protocol === "https:" && !parsed.username && !parsed.password && !parsed.hash) return;
  } catch { /* Report only the setting name. */ }
  errors.push(`${name} must be a public HTTPS URL without embedded credentials`);
};

const contract = setting("CONTRACT_ADDRESS");
if (!isAddress(contract)) errors.push("CONTRACT_ADDRESS must be a deployed contract address");
if (process.env.CONTRACT_ADDRESS && process.env.CONTRACT_ADDRESS.toLowerCase() !== contract.toLowerCase()) {
  errors.push("CONTRACT_ADDRESS in the shell must match worker/wrangler.toml");
}
if (!isAddress(process.env.VITE_CONTRACT_ADDRESS) ||
    process.env.VITE_CONTRACT_ADDRESS?.toLowerCase() !== contract.toLowerCase()) {
  errors.push("VITE_CONTRACT_ADDRESS must match CONTRACT_ADDRESS");
}

const chainId = Number(setting("CHAIN_ID"));
if (!Number.isSafeInteger(chainId) || chainId <= 0 || Number(process.env.VITE_CHAIN_ID) !== chainId) {
  errors.push("CHAIN_ID and VITE_CHAIN_ID must be the same positive integer");
}
if (process.env.CHAIN_ID && Number(process.env.CHAIN_ID) !== chainId) {
  errors.push("CHAIN_ID in the shell must match worker/wrangler.toml");
}

const d1Id = setting("database_id");
if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(d1Id)) {
  errors.push("worker/wrangler.toml needs the real D1 database_id");
}
if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(process.env.VITE_DYNAMIC_ENVIRONMENT_ID ?? "")) {
  errors.push("VITE_DYNAMIC_ENVIRONMENT_ID must be a Dynamic environment UUID");
}
requiredUrl("MONAD_RPC_URL", setting("MONAD_RPC_URL"));
if (process.env.MONAD_RPC_URL && process.env.MONAD_RPC_URL !== setting("MONAD_RPC_URL")) {
  errors.push("MONAD_RPC_URL in the shell must match worker/wrangler.toml");
}
requiredUrl("VITE_CHAIN_RPC_URL", process.env.VITE_CHAIN_RPC_URL || setting("MONAD_RPC_URL"));

if (process.argv.includes("--submission")) {
  if (!isBytes32(process.env.DEMO_COLLECTION_ID)) errors.push("DEMO_COLLECTION_ID must be a confirmed bytes32 collection ID");
  if (!isBytes32(process.env.DEPLOYMENT_TX_HASH)) errors.push("DEPLOYMENT_TX_HASH is required");
  requiredUrl("PUBLIC_SITE_URL", process.env.PUBLIC_SITE_URL);
  requiredUrl("DEMO_VIDEO_URL", process.env.DEMO_VIDEO_URL);
}

if (errors.length) {
  console.error(`Release configuration failed:\n${errors.map((error) => `- ${error}`).join("\n")}`);
  process.exitCode = 1;
} else {
  console.log("Public release configuration passed. Verify Worker secrets and live chain state separately.");
}
