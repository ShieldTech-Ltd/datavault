import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "vite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import React from "react";
import { act, create } from "react-test-renderer";
import { createRequire } from "node:module";
const { MemoryRouter } = createRequire(import.meta.url)(
  "../node_modules/react-router/dist/development/index.js",
);
test("website UI requires permission, keeps HTML as textarea text, and requires reviewed handoff", async () => {
  const cacheDir = mkdtempSync(join(tmpdir(), "dv-website-ui-")),
    job = {
      id: "aa".repeat(32),
      provider: "website",
      repository: "website",
      ref: "selected",
      paths: ["https://approved.example/page"],
      urls: ["https://approved.example/page"],
      provenance: [],
      commitSha: null,
      status: "review_ready",
      attempts: 1,
      contentDigest: "bb".repeat(32),
      createdAt: 1,
      expiresAt: Date.now() + 86400000,
    };
  let payload, reviewed;
  globalThis.__websiteFixture = {
    state: {
      session: { account: { address: "0x" + "11".repeat(20) } },
      loading: false,
      error: "",
    },
    client: {
      websiteImport: async (path, method, body) => {
        if (method === "POST") {
          payload = body;
          return job;
        }
        return {
          jobs: [],
          available: true,
          approvedHosts: ["approved.example"],
        };
      },
      websiteDraft: async () => "<script>alert(1)</script> readable source",
    },
  };
  const vite = await createServer({
    cacheDir,
    configFile: false,
    optimizeDeps: { noDiscovery: true },
    plugins: [
      {
        name: "website-fixture",
        enforce: "pre",
        transform(code, id) {
          if (id.replaceAll("\\", "/").endsWith("/production/account.tsx"))
            return "export const useAccount=()=>globalThis.__websiteFixture;";
        },
      },
    ],
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "silent",
  });
  let renderer;
  try {
    const { default: WebsiteImport } = await vite.ssrLoadModule(
      "/src/production/WebsiteImport.tsx",
    );
    await act(async () => {
      renderer = create(
        React.createElement(
          MemoryRouter,
          null,
          React.createElement(WebsiteImport, {
            onReviewed: (...v) => {
              reviewed = v;
            },
            onInvalidated: () => {},
          }),
        ),
      );
    });
    const button = (text) =>
      renderer.root
        .findAllByType("button")
        .find((b) => b.children.join("").includes(text));
    await act(async () =>
      renderer.root
        .findByType("textarea")
        .props.onChange({ target: { value: "https://approved.example/page" } }),
    );
    assert.equal(button("Import selected pages").props.disabled, true);
    await act(async () =>
      renderer.root
        .findByProps({ type: "checkbox" })
        .props.onChange({ target: { checked: true } }),
    );
    await act(async () => button("Import selected pages").props.onClick());
    assert.equal(payload.permissionAccepted, true);
    assert.equal(reviewed, undefined);
    await act(async () => button("Preview private draft").props.onClick());
    assert.equal(renderer.root.findAllByType("script").length, 0);
    assert.ok(
      renderer.root
        .findAllByType("textarea")
        .some((t) => t.props.value.includes("<script>")),
    );
    await act(async () => button("Use reviewed draft").props.onClick());
    assert.equal(reviewed[1], "<script>alert(1)</script> readable source");
  } finally {
    if (renderer) await act(async () => renderer.unmount());
    delete globalThis.__websiteFixture;
    await vite.close();
    rmSync(cacheDir, { recursive: true, force: true });
  }
});
test("website client validates capabilities and fences private source after wallet changes", async () => {
  const cacheDir = mkdtempSync(join(tmpdir(), "dv-website-test-"));
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
    let release;
    const client = new AccountClient(
      31337,
      "0x" + "ab".repeat(20),
      async (path, init = {}) => {
        if (path === "/api/account")
          return new Response(JSON.stringify(session));
        if (path.endsWith("/draft"))
          return new Promise((r) => {
            release = () => r(new Response("private page"));
          });
        return new Response(
          JSON.stringify({ jobs: [], available: false, approvedHosts: [] }),
        );
      },
    );
    await client.setWallet({ address }, true);
    assert.equal((await client.websiteImport()).available, false);
    const pending = client.websiteDraft("aa".repeat(32));
    await new Promise((r) => setImmediate(r));
    await client.setWallet(null, false);
    release();
    assert.equal(await pending, null);
  } finally {
    await vite.close();
    rmSync(cacheDir, { recursive: true, force: true });
  }
});
test("website client accepts bounded long URLs and safe failed-job guidance", async () => {
  const cacheDir = mkdtempSync(join(tmpdir(), "dv-website-failed-")),
    vite = await createServer({
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
      ),
      address = "0x" + "11".repeat(20),
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
      },
      url = "https://approved.example/" + "a".repeat(300),
      job = {
        id: "aa".repeat(32),
        provider: "website",
        repository: "website",
        ref: "selected",
        paths: [url],
        urls: [url],
        provenance: [],
        commitSha: null,
        status: "failed",
        attempts: 1,
        contentDigest: null,
        error:
          "Website import failed. Check approved hosts, public DNS, page size and content type. Use the final URL when a page redirects.",
        createdAt: 1,
        expiresAt: Date.now() + 86400000,
      };
    const client = new AccountClient(
      31337,
      "0x" + "ab".repeat(20),
      async (path) => Response.json(path === "/api/account" ? session : job),
    );
    await client.setWallet({ address }, true);
    assert.equal((await client.websiteImport(job.id))?.status, "failed");
  } finally {
    await vite.close();
    rmSync(cacheDir, { recursive: true, force: true });
  }
});
