import type { Env } from "./types";

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
