import assert from "node:assert/strict";
import { createServer as createHttpServer } from "node:http";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { createServer, loadConfigFromFile } from "vite";

test("API Access deep link serves the app while API calls reach the Worker", async () => {
  const upstream = createHttpServer((request, response) => {
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ path: request.url }));
  });
  upstream.listen(0, "127.0.0.1");
  await once(upstream, "listening");
  let vite;
  try {
    const root = fileURLToPath(new URL("../", import.meta.url));
    const loaded = await loadConfigFromFile({ command: "serve", mode: "test" }, undefined, root);
    const config = loaded.config;
    for (const proxy of Object.values(config.server.proxy)) {
      proxy.target = `http://127.0.0.1:${upstream.address().port}`;
    }
    vite = await createServer({ ...config, configFile: false, root,
      logLevel: "silent", optimizeDeps: { noDiscovery: true, include: [] },
      server: { ...config.server, host: "127.0.0.1", port: 0, preTransformRequests: false } });
    await vite.listen();
    const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
    const page = await fetch(`${origin}/api-access`, { headers: { Accept: "text/html" } });
    assert.equal(page.status, 200);
    assert.match(page.headers.get("Content-Type"), /text\/html/);
    assert.match(await page.text(), /id="root"/);
    const api = await fetch(`${origin}/api/demo`);
    assert.deepEqual(await api.json(), { path: "/api/demo" });
  } finally {
    await vite?.close();
    upstream.closeAllConnections();
    await new Promise(resolve => upstream.close(resolve));
  }
});
