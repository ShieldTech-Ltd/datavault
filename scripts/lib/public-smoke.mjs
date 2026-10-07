const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
};

function checkHeaders(response, label, api = false) {
  for (const [name, expected] of Object.entries(securityHeaders)) {
    if (response.headers.get(name) !== expected) throw new Error(`${label}: missing ${name}`);
  }
  if (!response.headers.get("Content-Security-Policy")?.includes("script-src 'self'")) {
    throw new Error(`${label}: script content policy is missing`);
  }
  if (api && response.headers.get("Cache-Control") !== "no-store") {
    throw new Error(`${label}: API response must not be cached`);
  }
}

export async function checkPublicSmoke(siteUrl, request = fetch) {
  let site;
  try { site = new URL(siteUrl); } catch { throw new Error("PUBLIC_SITE_URL must be a valid HTTPS origin"); }
  if (site.protocol !== "https:" || site.username || site.password || site.search || site.hash || site.pathname !== "/") {
    throw new Error("PUBLIC_SITE_URL must be a bare HTTPS origin without credentials");
  }
  const call = (path, init = {}) => request(new URL(path, site), {
    redirect: "error", signal: AbortSignal.timeout(8000), ...init,
  });

  const home = await call("/");
  if (home.status !== 200 || !home.headers.get("Content-Type")?.includes("text/html")) {
    throw new Error("Homepage did not serve HTML successfully");
  }
  checkHeaders(home, "Homepage");
  const html = await home.text();
  const script = /<script\b[^>]*\bsrc="([^"]+)"/i.exec(html)?.[1];
  if (!script || !script.startsWith("/assets/")) throw new Error("Homepage has no same-origin app bundle");
  const asset = await call(script);
  if (asset.status !== 200 || !asset.headers.get("Content-Type")?.includes("javascript")) {
    throw new Error("App bundle did not serve JavaScript successfully");
  }
  checkHeaders(asset, "App bundle");
  await asset.body?.cancel();

  const demo = await call("/api/demo");
  if (demo.status !== 200) throw new Error(`Demo collection is unavailable: HTTP ${demo.status}`);
  checkHeaders(demo, "Demo API", true);
  const collection = await demo.json();
  if (!/^0x[0-9a-f]{64}$/i.test(collection.collectionId) ||
      !/^0x[0-9a-f]{40}$/i.test(collection.ownerAddress) ||
      !/^[1-9][0-9]*$/.test(collection.priceWei)) {
    throw new Error("Demo API returned incomplete public collection details");
  }

  const quote = await call("/api/queries/prepare", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ collectionId: collection.collectionId, question: "What information is in this collection?" }),
  });
  if (quote.status !== 200) throw new Error(`Paid quote is unavailable: HTTP ${quote.status}`);
  checkHeaders(quote, "Paid quote", true);
  const quoted = await quote.json();
  if (quoted.collectionId !== collection.collectionId || quoted.priceWei !== collection.priceWei) {
    throw new Error("Paid quote does not match the public demo collection");
  }
  return { collectionId: collection.collectionId, priceWei: collection.priceWei };
}
