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
    writeFileSync(config, template
      .replace("PLACEHOLDER_REPLACE_AFTER_D1_CREATE", "12345678-1234-1234-1234-123456789abc")
      .replace('CONTRACT_ADDRESS = ""', 'CONTRACT_ADDRESS = "0x1111111111111111111111111111111111111111"'));
    const result = spawnSync(process.execPath, [guard], {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        DATAVAULT_WRANGLER_CONFIG: config,
        VITE_CONTRACT_ADDRESS: "0x1111111111111111111111111111111111111111",
        VITE_CHAIN_ID: "10143",
      },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Public release configuration passed/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
