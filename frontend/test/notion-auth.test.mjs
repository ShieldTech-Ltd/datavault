import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "vite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
test("connector confirmation and redirect are fenced by the current wallet lifecycle", async () => {
  const cacheDir = mkdtempSync(join(tmpdir(), "dv-notion-auth-"));
  const vite = await createServer({
    cacheDir,
    configFile: false,
    optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "silent",
  });
  try {
    const { AccountClient } = await vite.ssrLoadModule(
      "/src/production/account-client.ts",
    );
    const address = "0x" + "11".repeat(20),
      session = {
        account: {
          address,
          displayName: "",
          locale: "en-GB",
          notificationPreferences: { inApp: true, email: false },
          createdAt: 1,
          updatedAt: 1,
        },
        csrfToken: "ab".repeat(32),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      };
    let release, record;
    const client = new AccountClient(
      31337,
      "0x" + "ab".repeat(20),
      async (path, init = {}) => {
        if (path === "/api/account")
          return new Response(JSON.stringify(session));
        if (path.includes("/connectors/")) {
          record = init;
          return new Promise((r) => {
            release = () =>
              r(
                new Response(
                  JSON.stringify({
                    authorizeUrl:
                      "https://api.notion.com/v1/oauth/authorize?client_id=fixture",
                  }),
                ),
              );
          });
        }
        return new Response(null, { status: 204 });
      },
    );
    await client.setWallet({ address }, true);
    const pending = client.notionConnector("/connect", "POST");
    await new Promise((r) => setImmediate(r));
    assert.equal(record.headers["x-csrf-token"], session.csrfToken);
    await client.setWallet(null, false);
    release();
    assert.equal(await pending, null);
  } finally {
    await vite.close();
    rmSync(cacheDir, { recursive: true, force: true });
  }
});
import React from "react";
import { act, create } from "react-test-renderer";
test("disabled private Notion UI shows scope and does not request consent", async () => {
  let calls = 0;
  globalThis.__notionFixture = {
    state: {
      session: { account: { address: "0x" + "11".repeat(20) } },
      loading: false,
    },
    client: {
      notionConnector: async () => {
        calls++;
        return {
          providerConfigured: false,
          id: null,
          status: "disconnected",
          repositories: [],
          revocationPending: false,
        };
      },
    },
  };
  const cacheDir = mkdtempSync(join(tmpdir(), "dv-notion-auth-"));
  const vite = await createServer({
    cacheDir,
    configFile: false,
    optimizeDeps: { noDiscovery: true },
    plugins: [
      {
        name: "auth-fixture",
        enforce: "pre",
        transform(code, id) {
          if (id.replaceAll("\\", "/").endsWith("/production/account.tsx"))
            return "export const useAccount=()=>globalThis.__notionFixture;";
        },
      },
    ],
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "silent",
  });
  let renderer;
  try {
    const { default: NotionConnection } = await vite.ssrLoadModule(
      "/src/production/NotionConnection.tsx",
    );
    await act(async () => {
      renderer = create(React.createElement(NotionConnection));
    });
    assert.match(JSON.stringify(renderer.toJSON()), /Select only the pages/);
    assert.equal(
      renderer.root
        .findAllByType("button")
        .find((b) => b.children.join("") === "Connect Notion").props.disabled,
      true,
    );
    assert.equal(calls, 1);
  } finally {
    if (renderer) await act(async () => renderer.unmount());
    delete globalThis.__notionFixture;
    await vite.close();
    rmSync(cacheDir, { recursive: true, force: true });
  }
});
