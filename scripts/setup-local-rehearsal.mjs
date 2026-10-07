#!/usr/bin/env node
// Creates throwaway local-chain credentials and a contract for the integration rehearsal.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ethers } from "ethers";

const workerVars = new URL("../worker/.dev.vars", import.meta.url);
const frontendVars = new URL("../frontend/.env.local", import.meta.url);
assert(
  !existsSync(workerVars) && !existsSync(frontendVars),
  "Remove or back up existing local env files before setup."
);
const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
assert.equal(
  (await provider.getNetwork()).chainId,
  31337n,
  "Start the local Hardhat chain first."
);
const artifact = JSON.parse(
  readFileSync(
    new URL(
      "../artifacts/contracts/DataVault.sol/DataVault.json",
      import.meta.url
    ),
    "utf8"
  )
);
const signer = await provider.getSigner(0);
const contract = await new ethers.ContractFactory(
  artifact.abi,
  artifact.bytecode,
  signer
).deploy();
await contract.waitForDeployment();
const contractAddress = await contract.getAddress();
const operator = ethers.Wallet.createRandom();
await (
  await signer.sendTransaction({
    to: operator.address,
    value: ethers.parseEther("1"),
  })
).wait();

const certDir = mkdtempSync(join(tmpdir(), "datavault-local-"));
const cert = join(certDir, "model.crt");
const key = join(certDir, "model.key");
execFileSync(
  "openssl",
  [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-subj",
    "/CN=localhost",
    "-addext",
    "subjectAltName=DNS:localhost,IP:127.0.0.1",
    "-keyout",
    key,
    "-out",
    cert,
    "-days",
    "1",
  ],
  { stdio: "ignore" }
);
writeFileSync(
  workerVars,
  [
    `CONTRACT_ADDRESS=${contractAddress}`,
    "MONAD_RPC_URL=http://127.0.0.1:8545",
    "CHAIN_ID=31337",
    `SETTLEMENT_PRIVATE_KEY=${operator.privateKey}`,
    "MODEL_PROVIDER=openai",
    "MODEL_API_KEY=local-e2e-only",
    "MODEL_API_BASE=https://127.0.0.1:9443/v1",
    "MODEL_NAME=local-e2e-stub",
  ].join("\n") + "\n",
  { mode: 0o600 }
);
writeFileSync(
  frontendVars,
  [
    `VITE_CONTRACT_ADDRESS=${contractAddress}`,
    "VITE_CHAIN_ID=31337",
    "VITE_CHAIN_RPC_URL=http://127.0.0.1:8545",
  ].join("\n") + "\n",
  { mode: 0o600 }
);
console.log(
  JSON.stringify(
    { contractAddress, cert, key, workerPort: 8790, modelPort: 9443 },
    null,
    2
  )
);
