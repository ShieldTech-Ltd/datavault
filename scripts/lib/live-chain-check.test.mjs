import assert from "node:assert/strict";
import { test } from "node:test";
import { checkLiveChain } from "./live-chain-check.mjs";

const contractAddress = `0x${"1".repeat(40)}`;
const expectedBytecode = "0x60016000";
const run = (results) => checkLiveChain({
  rpcUrl: "https://rpc.example.org",
  chainId: 10143,
  contractAddress,
  expectedBytecode,
  request: async (_url, options) => {
    const method = JSON.parse(options.body).method;
    return { ok: true, json: async () => ({ result: results[method] }) };
  },
});

test("accepts the expected chain with deployed contract bytecode", async () => {
  await run({ eth_chainId: "0x279f", eth_getCode: "0x60016000" });
});

test("rejects an RPC connected to another chain", async () => {
  await assert.rejects(run({ eth_chainId: "0x1", eth_getCode: "0x60016000" }), /chain ID/);
});

test("rejects an address without deployed code", async () => {
  await assert.rejects(run({ eth_chainId: "0x279f", eth_getCode: "0x" }), /no deployed code/);
});

test("rejects a different deployed contract", async () => {
  await assert.rejects(run({ eth_chainId: "0x279f", eth_getCode: "0x60026000" }), /bytecode does not match/);
});
