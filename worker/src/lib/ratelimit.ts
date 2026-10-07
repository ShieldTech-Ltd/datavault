import type { Env } from "./types";

// Atomic fixed-window rate limiter backed by D1.
// Each identity (IP address) gets a fixed quota per 60-second window.
// Limits are intentionally generous for a live demo but prevent abuse.
const WINDOW_SECONDS = 60;
const LIMITS: Record<string, number> = {
  execute:  10, // model calls are expensive
  register:  5,
  catalogue: 30,
  default:  30,
};

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
