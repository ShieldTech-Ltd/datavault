import type { Env } from "./types";

// Atomic fixed-window rate limiter backed by D1.
// Each identity (IP address) gets a fixed quota per 60-second window.
// Limits are intentionally generous for a live demo but prevent abuse.
const WINDOW_SECONDS = 60;
const LIMITS: Record<string, number> = {
  auth: 10,
  account: 20,
  execute:  10, // model calls are expensive
  register:  5,
  catalogue: 30,
  quote: 30,
  confirm: 10,
  reconcile: 10,
  default:  30,
};

export function routeRateBucket(method: string, path: string): string | null {
  if (method === "POST" && /^\/api\/collections\/[^/]+\/revisions$/.test(path)) return "account";
  if (method === "PATCH" && /^\/api\/collections\/[^/]+\/metadata$/.test(path)) return "account";
  if (method === "POST" && path.startsWith("/api/auth/")) return "auth";
  if ((method === "POST" || method === "PATCH") && (path === "/api/account" || path.startsWith("/api/account/"))) return "account";
  if (method === "GET" && (
    path === "/api/status" || path === "/api/health" || path === "/api/account/notifications" ||
    path === "/api/demo" ||
    path === "/api/marketplace/analytics" ||
    path === "/api/owner/analytics" ||
    path === "/api/owner/collections" ||
    path === "/api/buyer/queries" ||
    path === "/api/collections" ||
    /^\/api\/collections\/[^/]+\/revisions$/.test(path) ||
    /^\/api\/collections\/[^/]+$/.test(path) ||
    /^\/api\/queries\/[^/]+\/(?:receipt|answer)$/.test(path)
  )) return "catalogue";
  if (method === "POST" && path === "/api/queries/prepare") return "quote";
  if (method === "POST" && /^\/api\/collections\/[^/]+\/confirm$/.test(path)) return "confirm";
  if (method === "POST" && /^\/api\/queries\/[^/]+\/reconcile$/.test(path)) return "reconcile";
  return null;
}

export async function checkRateLimit(
  identity: string,
  bucket: keyof typeof LIMITS | "default",
  env: Env,
): Promise<{ allowed: boolean; retryAfter: number }> {
  const limit = LIMITS[bucket] ?? LIMITS.default;
  const now = Math.floor(Date.now() / 1000);
  const key = `${bucket}:${identity}`;

  // SQLite executes the conflict check and increment as one write. A rejected
  // request changes zero rows, even when many Workers arrive concurrently.
  const result = await env.DB.prepare(`
    INSERT INTO rate_limits (key, window_start, count)
    VALUES (?, ?, 1)
    ON CONFLICT(key) DO UPDATE SET
      count = CASE WHEN window_start <= ? THEN 1 ELSE count + 1 END,
      window_start = CASE WHEN window_start <= ? THEN ? ELSE window_start END
    WHERE window_start <= ? OR count < ?
  `).bind(key, now, now - WINDOW_SECONDS, now - WINDOW_SECONDS, now,
    now - WINDOW_SECONDS, limit).run();

  return result.meta.changes === 1
    ? { allowed: true, retryAfter: 0 }
    : { allowed: false, retryAfter: WINDOW_SECONDS };
}

export function callerIdentity(req: Request): string {
  // Cloudflare sets CF-Connecting-IP on real requests; fall back to a placeholder in local dev
  return req.headers.get("CF-Connecting-IP") ?? "local";
}
