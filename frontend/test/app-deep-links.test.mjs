import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToString } from "react-dom/server";
import { createServer } from "vite";

test("production deep links open the paid query and owner workspaces", async () => {
  const vite = await createServer({
    optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "silent",
  });
  try {
    const { default: App } = await vite.ssrLoadModule("/src/App.tsx");
    const { WalletProvider } = await vite.ssrLoadModule("/src/lib/wallet.tsx");
    const renderAt = (pathname) => {
      globalThis.window = { location: { pathname } };
      return renderToString(
        React.createElement(WalletProvider, null, React.createElement(App))
      );
    };
    const owner = renderAt("/manage");
    assert.match(owner, /Publish and control your knowledge/);
    assert.doesNotMatch(owner, /Ask a collection/);
    const buyer = renderAt("/query");
    assert.match(buyer, /Ask a collection/);
    assert.doesNotMatch(buyer, /Publish and control your knowledge/);
  } finally {
    delete globalThis.window;
    await vite.close();
  }
});
