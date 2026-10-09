#!/usr/bin/env node
// Offline guard for public, non-secret deployment configuration.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkLiveChain } from "./lib/live-chain-check.mjs";

const errors = [];
const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const configPath = resolve(repoRoot, process.env.DATAVAULT_WRANGLER_CONFIG || "worker/wrangler.toml");
const manifestPath = resolve(repoRoot, process.env.DATAVAULT_FRONTEND_MANIFEST || "frontend/dist/release-manifest.json");
let workerConfig = "";
try {
  workerConfig = readFileSync(configPath, "utf8");
} catch {
  errors.push("DATAVAULT_WRANGLER_CONFIG must point to a readable Wrangler file");
}
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
if (setting("directory") !== "../frontend/dist" ||
    setting("not_found_handling") !== "single-page-application") {
  errors.push("the selected Wrangler config must serve the built frontend as a single-page application");
}
if (!isAddress(contract)) errors.push("CONTRACT_ADDRESS must be a deployed contract address");
if (process.env.CONTRACT_ADDRESS && process.env.CONTRACT_ADDRESS.toLowerCase() !== contract.toLowerCase()) {
  errors.push("CONTRACT_ADDRESS in the shell must match the selected Wrangler config");
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
  errors.push("CHAIN_ID in the shell must match the selected Wrangler config");
}

const d1Id = setting("database_id");
if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(d1Id)) {
  errors.push("the selected Wrangler config needs the real D1 database_id");
}
const modelProvider = setting("MODEL_PROVIDER");
if (!["openai", "kimi"].includes(modelProvider)) {
  errors.push("MODEL_PROVIDER must use a supported OpenAI-compatible transport");
}
const modelBase = setting("MODEL_API_BASE");
if (modelProvider === "kimi" && (!modelBase || !setting("MODEL_NAME"))) {
  errors.push("kimi requires explicit MODEL_API_BASE and MODEL_NAME settings");
}
if (modelBase) {
  requiredUrl("MODEL_API_BASE", modelBase);
  try {
    if (new URL(modelBase).search) errors.push("MODEL_API_BASE must not contain query parameters");
  } catch { /* The URL validation above reports the invalid value. */ }
}
requiredUrl("MONAD_RPC_URL", setting("MONAD_RPC_URL"));
if (process.env.MONAD_RPC_URL && process.env.MONAD_RPC_URL !== setting("MONAD_RPC_URL")) {
  errors.push("MONAD_RPC_URL in the shell must match the selected Wrangler config");
}
requiredUrl("VITE_CHAIN_RPC_URL", process.env.VITE_CHAIN_RPC_URL);
try {
  if (new URL(process.env.VITE_CHAIN_RPC_URL).search) {
    errors.push("VITE_CHAIN_RPC_URL must not include a query string that could expose a credential");
  }
} catch { /* The URL validation above reports the invalid value. */ }

try {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.schemaVersion !== 1 ||
      typeof manifest.contractAddress !== "string" ||
      manifest.contractAddress.toLowerCase() !== contract.toLowerCase() ||
      manifest.chainId !== String(chainId) ||
      manifest.rpcUrl !== process.env.VITE_CHAIN_RPC_URL) {
    errors.push("the built frontend release manifest must match the selected contract, chain, and browser RPC");
  }
} catch {
  errors.push("build the frontend and provide its release-manifest.json before the release check");
}

if (process.argv.includes("--submission")) {
  if (!isBytes32(process.env.DEMO_COLLECTION_ID)) errors.push("DEMO_COLLECTION_ID must be a confirmed bytes32 collection ID");
  if (!isBytes32(process.env.DEPLOYMENT_TX_HASH)) errors.push("DEPLOYMENT_TX_HASH is required");
  requiredUrl("PUBLIC_SITE_URL", process.env.PUBLIC_SITE_URL);
  requiredUrl("DEMO_VIDEO_URL", process.env.DEMO_VIDEO_URL);
}

if (!errors.length && process.argv.includes("--live")) {
  let expectedBytecode;
  try {
    const artifact = JSON.parse(readFileSync(new URL("../artifacts/contracts/DataVault.sol/DataVault.json", import.meta.url), "utf8"));
    expectedBytecode = artifact.deployedBytecode;
    if (!/^0x(?:[0-9a-f]{2})+$/i.test(expectedBytecode)) throw new Error("invalid artifact");
  } catch {
    errors.push("Compile DataVault before --live so deployed bytecode can be checked");
  }
  const rpcUrl = setting("MONAD_RPC_URL");
  const frontendRpcUrl = process.env.VITE_CHAIN_RPC_URL || rpcUrl;
  for (const [name, url] of expectedBytecode ? [["MONAD_RPC_URL", rpcUrl], ["VITE_CHAIN_RPC_URL", frontendRpcUrl]] : []) {
    try {
      await checkLiveChain({ rpcUrl: url, chainId, contractAddress: contract, expectedBytecode });
    } catch (error) {
      errors.push(`${name} live verification failed: ${error instanceof Error ? error.message : "unknown error"}`);
    }
    if (frontendRpcUrl === rpcUrl) break;
  }
}

if (errors.length) {
  console.error(`Release configuration failed:\n${errors.map((error) => `- ${error}`).join("\n")}`);
  process.exitCode = 1;
} else {
  console.log(process.argv.includes("--live")
    ? "Public release configuration and live RPC contract checks passed. Verify Worker secrets separately."
    : "Public release configuration passed. Run with --live to verify RPC chain ID and contract code.");
}
