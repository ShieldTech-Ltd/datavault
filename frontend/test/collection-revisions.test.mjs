import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "vite";
test("revision links fence wallet changes, preserve published IDs on failure and allow retry", async () => {
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "silent",
  });
  try {
    let module;
    try {
      module = await vite.ssrLoadModule(
        "/src/production/collection-revisions.ts"
      );
    } catch {
      module = {};
    }
    assert.equal(typeof module.linkConfirmedRevision, "function");
    const owner = "0x" + "11".repeat(20),
      old = "0x" + "aa".repeat(32),
      next = "0x" + "bb".repeat(32);
    let active = true,
      addresses = [owner],
      requests = 0;
    const wallet = {
      getAddresses: async () => addresses,
      getChainId: async () => 10143,
    };
    const fetcher = async () => {
      requests++;
      return new Response(JSON.stringify({ currentCollectionId: next }), {
        status: 409,
      });
    };
    const invoke = (fetch = fetcher) =>
      module.linkConfirmedRevision({
        wallet,
        chainId: 10143,
        owner,
        parentId: old,
        newId: next,
        csrfToken: "csrf",
        isCurrent: () => active,
        fetcher: fetch,
      });
    await assert.rejects(() => invoke(), /published.*not linked/i);
    assert.equal(requests, 1);
    addresses = ["0x" + "22".repeat(20)];
    await assert.rejects(() => invoke(), /wallet/i);
    assert.equal(requests, 1);
    addresses = [owner];
    active = false;
    await assert.rejects(() => invoke(), /wallet/i);
    assert.equal(requests, 1);
    active = true;
    assert.deepEqual(
      await invoke(
        async () => new Response(JSON.stringify({ currentCollectionId: next }))
      ),
      { currentCollectionId: next }
    );
    await assert.rejects(
      () =>
        invoke(async () => {
          addresses = [];
          return new Response("{}");
        }),
      /wallet/i
    );
    assert.equal(typeof module.assertRevisionWallet, "function");
    await assert.rejects(
      () =>
        module.assertRevisionWallet(
          {
            ...wallet,
            getAddresses: async () => {
              throw Error("cancelled");
            },
          },
          owner,
          10143
        ),
      /cancelled/
    );
  } finally {
    await vite.close();
  }
});
