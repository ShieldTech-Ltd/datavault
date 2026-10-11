import { build } from "esbuild";
import { Miniflare, createFetchMock } from "miniflare";
import assert from "node:assert/strict";
const network = createFetchMock();
network.disableNetConnect();
for (const type of ["A", "AAAA"])
  network
    .get("https://cloudflare-dns.com")
    .intercept({ path: "/dns-query?name=approved.example&type=" + type })
    .reply(200, {
      Status: 0,
      Answer:
        type === "A"
          ? [{ name: "approved.example.", type: 1, data: "93.184.216.34" }]
          : [],
    })
    .persist();
network
  .get("https://approved.example")
  .intercept({ path: "/ok" })
  .reply(
    200,
    "<nav>remove navigation</nav><main><h1>Page &amp; title</h1><script>removeScript()</script><p>Readable source</p></main>",
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
for (const status of [300, 301, 302, 303, 304, 305, 306, 307, 308])
  network
    .get("https://approved.example")
    .intercept({ path: "/redirect" + status })
    .reply(status, "", {
      headers: { location: "https://untrusted.example/secret" },
    });
const bundle = await build({
  stdin: {
    contents: `import {fetchWebsitePages} from './src/lib/website-source.ts';export default {async fetch(request){try{const path=new URL(request.url).pathname;return Response.json(await fetchWebsitePages({WEBSITE_IMPORT_HOSTS:'approved.example'},['https://approved.example'+path],async()=>true));}catch{return new Response('rejected',{status:400});}}}`,
    resolveDir: process.cwd(),
    sourcefile: "website-runtime.ts",
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "browser",
  write: false,
});
const mf = new Miniflare({
  modules: true,
  script: bundle.outputFiles[0].text,
  compatibilityDate: "2024-10-01",
  fetchMock: network,
});
try {
  const response = await mf.dispatchFetch("http://runtime/ok");
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.match(result.text, /Page & title/);
  assert.match(result.text, /Readable source/);
  assert.doesNotMatch(result.text, /remove/);
  assert.match(result.provenance[0].contentDigest, /^[a-f0-9]{64}$/);
  for (const status of [300, 301, 302, 303, 304, 305, 306, 307, 308])
    assert.equal(
      (await mf.dispatchFetch("http://runtime/redirect" + status)).status,
      400,
    );
  console.log(
    "Actual workerd: fixed DoH validation, parse5 extraction, private provenance and nine manual redirect rejections passed. Outbound network disabled.",
  );
} finally {
  await mf.dispose();
  await network.close();
}
