import type { Env } from "./types";

// Sliding-window rate limiter backed by D1.
// Each identity (IP address) gets a fixed quota per 60-second window.
// Limits are intentionally generous for a live demo but prevent abuse.
const WINDOW_SECONDS = 60;
const LIMITS: Record<string, number> = {
  execute:  10, // model calls are expensive
  register:  5,
  default:  30,
};

export async function checkRateLimit(
  identity: string,
  bucket: keyof typeof LIMITS | "default",
  env: Env,
): Promise<{ allowed: boolean; retryAfter: number }> {
  const limit = LIMITS[bucket] ?? LIMITS.default;
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - WINDOW_SECONDS;
  const key = `${bucket}:${identity}`;

  // Count requests in the current window
  const row = await env.DB.prepare(
    "SELECT count FROM rate_limits WHERE key = ? AND window_start >= ?",
  ).bind(key, windowStart).first<{ count: number }>();

  const count = row?.count ?? 0;

  if (count >= limit) {
    return { allowed: false, retryAfter: WINDOW_SECONDS };
  }

  // Upsert: increment counter, reset window_start if it expired
  await env.DB.prepare(`
    INSERT INTO rate_limits (key, window_start, count)
    VALUES (?, ?, 1)
    ON CONFLICT(key) DO UPDATE SET
      count = CASE WHEN window_start < ? THEN 1 ELSE count + 1 END,
      window_start = CASE WHEN window_start < ? THEN ? ELSE window_start END
  `).bind(key, now, windowStart, windowStart, now).run();

  return { allowed: true, retryAfter: 0 };
}

export function callerIdentity(req: Request): string {
  // Cloudflare sets CF-Connecting-IP on real requests; fall back to a placeholder in local dev
  return req.headers.get("CF-Connecting-IP") ?? "local";
}
