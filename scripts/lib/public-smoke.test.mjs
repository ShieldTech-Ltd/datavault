import assert from "node:assert/strict";
import { test } from "node:test";
import { checkPublicSmoke } from "./public-smoke.mjs";

const collectionId = `0x${"a".repeat(64)}`;
const ownerAddress = `0x${"b".repeat(40)}`;
const policy = "default-src 'none'; script-src 'self'";
const headers = (contentType, api = false) => ({
  "Content-Type": contentType,
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": policy,
  ...(api ? { "Cache-Control": "no-store" } : {}),
});

function fixture({ demoStatus = 200, quoteStatus = 200 } = {}) {
  const paths = [];
  const request = async (url, init) => {
    paths.push([url.pathname, init.method ?? "GET"]);
    if (url.pathname === "/") return new Response('<script type="module" src="/assets/app.js"></script>', {
      status: 200, headers: headers("text/html"),
    });
    if (url.pathname === "/assets/app.js") return new Response("export {}", {
      status: 200, headers: headers("text/javascript"),
    });
    if (url.pathname === "/api/demo") return new Response(JSON.stringify({ collectionId, ownerAddress, priceWei: "100" }), {
      status: demoStatus, headers: headers("application/json", true),
    });
    if (url.pathname === "/api/queries/prepare") return new Response(JSON.stringify({ collectionId, priceWei: "100" }), {
      status: quoteStatus, headers: headers("application/json", true),
    });
    throw new Error("Unexpected request");
  };
  return { paths, request };
}

test("checks static assets and a live paid quote without opening escrow", async () => {
  const { paths, request } = fixture();
  assert.deepEqual(await checkPublicSmoke("https://demo.example.org/", request), { collectionId, priceWei: "100" });
  assert.deepEqual(paths, [["/", "GET"], ["/assets/app.js", "GET"], ["/api/demo", "GET"], ["/api/queries/prepare", "POST"]]);
});

test("rejects an unavailable public demo or paid quote", async () => {
  await assert.rejects(checkPublicSmoke("https://demo.example.org/", fixture({ demoStatus: 404 }).request), /Demo collection is unavailable/);
  await assert.rejects(checkPublicSmoke("https://demo.example.org/", fixture({ quoteStatus: 503 }).request), /Paid quote is unavailable/);
});

test("rejects an insecure site before making requests", async () => {
  let called = false;
  await assert.rejects(checkPublicSmoke("http://demo.example.org/", async () => {
    called = true;
    throw new Error("must not call");
  }), /HTTPS/);
  assert.equal(called, false);
});
