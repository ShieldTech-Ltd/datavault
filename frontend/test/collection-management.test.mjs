import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "vite";
test("price updates reject bounds and only publish successful receipt chain readback", async () => {
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "silent",
  });
  try {
    let module;
    try {
      module = await vite.ssrLoadModule("/src/production/collection-policy.ts");
    } catch {
      module = {};
    }
    assert.equal(typeof module.updateCollectionPrice, "function");
    const { updateCollectionPrice, parseCollectionPrice } = module;
    for (const value of ["0", "-1", "10.1", "wat", "0.0000000000000000001"])
      assert.throws(() => parseCollectionPrice(value));
    assert.equal(parseCollectionPrice("0.001"), 1000000000000000n);
    let reads = 0;
    const chain = {
      waitForTransactionReceipt: async () => ({ status: "reverted" }),
      readContract: async () => {
        reads++;
        return ["owner", "operator", 200n, 2, true];
      },
    };
    const wallet = { sendTransaction: async () => "0x" + "11".repeat(32) };
    await assert.rejects(() =>
      updateCollectionPrice(
        wallet,
        chain,
        "0x" + "ab".repeat(20),
        "0x" + "cd".repeat(32),
        "0.002",
        false
      )
    );
    assert.equal(reads, 0);
    chain.waitForTransactionReceipt = async () => ({ status: "success" });
    assert.deepEqual(
      await updateCollectionPrice(
        wallet,
        chain,
        "0x" + "ab".repeat(20),
        "0x" + "cd".repeat(32),
        "0.002",
        false
      ),
      { price: 200n, policyVersion: 2, active: true }
    );
    await assert.rejects(() =>
      updateCollectionPrice(
        {
          sendTransaction: async () => {
            throw Error("cancelled");
          },
        },
        chain,
        "0x" + "ab".repeat(20),
        "0x" + "cd".repeat(32),
        "0.002",
        false
      )
    );
    assert.equal(reads, 1);
  } finally {
    await vite.close();
  }
});
