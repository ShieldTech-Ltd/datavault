import type { Env } from "./types";

const MAX_JSON_REQUEST_BYTES = 8 * 1024;
const MAX_MULTIPART_REQUEST_BYTES = 512_000 + 16 * 1024;

const BASE_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

export function securedResponse(response: Response, api = false): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(BASE_HEADERS)) headers.set(name, value);
  if (api) headers.set("Cache-Control", "no-store");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function allowedOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get("Origin");
  if (!origin) return null;
  let parsed: URL;
  try { parsed = new URL(origin); } catch { return null; }
  if (parsed.origin !== origin || !["http:", "https:"].includes(parsed.protocol)) return null;

  const ownOrigin = new URL(request.url).origin;
  if (origin === ownOrigin) return origin;
  const configured = (env.ALLOWED_ORIGINS ?? "").split(",").map((value) => value.trim());
  if (configured.includes(origin)) return origin;

  // Local development may run Vite and Wrangler on different ports.
  if (["localhost", "127.0.0.1"].includes(new URL(request.url).hostname) &&
      ["localhost", "127.0.0.1"].includes(parsed.hostname)) return origin;
  return null;
}

export function corsHeaders(origin: string | null): Headers {
  const headers = new Headers({ "Vary": "Origin" });
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type, x-signature, x-timestamp");
  }
  return headers;
}

export async function boundedApiRequest(request: Request): Promise<Request | Response> {
  if (request.method !== "POST") return request;
  const path = new URL(request.url).pathname;
  // The retired upload route never parses a body and must consistently return 410.
  if (/^\/api\/collections\/[^/]+\/upload$/.test(path)) return request;
  const maxBytes = path === "/api/collections"
    ? MAX_MULTIPART_REQUEST_BYTES : MAX_JSON_REQUEST_BYTES;
  const declared = request.headers.get("Content-Length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) {
    return new Response("Request body too large", { status: 413 });
  }
  if (!request.body) return request;

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return new Response("Request body too large", { status: 413 });
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Request(request, { body });
}
