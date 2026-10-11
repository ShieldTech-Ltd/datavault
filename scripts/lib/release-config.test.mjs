import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const guard = fileURLToPath(new URL("../check-release-config.mjs", import.meta.url));
const template = readFileSync(join(repoRoot, "worker/wrangler.toml"), "utf8");

test("release guard reads the same private config selected for deployment", () => {
  const directory = mkdtempSync(join(tmpdir(), "datavault-release-"));
  try {
    const config = join(directory, "wrangler.deploy.toml");
    const manifest = join(directory, "release-manifest.json");
    writeFileSync(config, template
      .replace("PLACEHOLDER_REPLACE_AFTER_D1_CREATE", "12345678-1234-1234-1234-123456789abc")
      .replace('CONTRACT_ADDRESS = ""', 'CONTRACT_ADDRESS = "0x1111111111111111111111111111111111111111"'));
    const release = {
      schemaVersion: 1,
      contractAddress: "0x1111111111111111111111111111111111111111",
      chainId: "10143",
      rpcUrl: "https://testnet-rpc.monad.xyz",
    };
    writeFileSync(manifest, JSON.stringify(release));
    const run = () => spawnSync(process.execPath, [guard], {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        DATAVAULT_WRANGLER_CONFIG: config,
        DATAVAULT_FRONTEND_MANIFEST: manifest,
        VITE_CONTRACT_ADDRESS: "0x1111111111111111111111111111111111111111",
        VITE_CHAIN_ID: "10143",
        VITE_CHAIN_RPC_URL: "https://testnet-rpc.monad.xyz",
      },
    });
    const result = run();
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Public release configuration passed/);
    writeFileSync(manifest, JSON.stringify({ ...release, contractAddress: "0x2222222222222222222222222222222222222222" }));
    const stale = run();
    assert.equal(stale.status, 1);
    assert.match(stale.stderr, /built frontend release manifest must match/);
    rmSync(manifest);
    const missing = run();
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /build the frontend and provide its release-manifest/);
    writeFileSync(manifest, JSON.stringify(release));
    writeFileSync(config, readFileSync(config, "utf8").replace('MODEL_PROVIDER = "openai"', 'MODEL_PROVIDER = "kimi"'));
    const incompleteModel = run();
    assert.equal(incompleteModel.status, 1);
    assert.match(incompleteModel.stderr, /kimi requires explicit MODEL_API_BASE and MODEL_NAME/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
