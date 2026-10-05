import type { Env } from "./lib/types";
import { handleRegisterCollection, handleConfirmCollection } from "./routes/collections";
import { handleDemoCollection, handlePrepare, handleExecute, handleReceipt, handleAnswerRecovery, handleReconcile } from "./routes/queries";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // ── API routes ────────────────────────────────────────────────
    if (path.startsWith("/api/")) {
      const origin = request.headers.get("Origin") ?? "";
      const allowedOrigin = resolveAllowedOrigin(origin, env);
      const cors: Record<string, string> = {
        "Access-Control-Allow-Origin": allowedOrigin,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, x-signature, x-timestamp",
        "Vary": "Origin",
      };

      if (method === "OPTIONS") return new Response(null, { headers: cors });

      try {
        let res: Response;

        if (method === "POST" && path === "/api/collections") {
          res = await handleRegisterCollection(request, env);
        } else if (method === "POST" && path.match(/^\/api\/collections\/[^/]+\/confirm$/)) {
          const id = path.split("/")[3];
          res = await handleConfirmCollection(request, env, id);
        } else if (method === "POST" && path.match(/^\/api\/collections\/[^/]+\/upload$/)) {
          res = new Response(JSON.stringify({ error: "Content replacement is unavailable until it can advance on-chain policy." }), {
            status: 410, headers: { "Content-Type": "application/json" },
          });
        } else if (method === "GET" && path === "/api/demo") {
          res = await handleDemoCollection(env);
        } else if (method === "POST" && path === "/api/queries/prepare") {
          res = await handlePrepare(request, env);
        } else if (method === "POST" && path === "/api/queries/execute") {
          res = await handleExecute(request, env);
        } else if (method === "GET" && path.match(/^\/api\/queries\/[^/]+\/receipt$/)) {
          const id = path.split("/")[3];
          res = await handleReceipt(env, id);
        } else if (method === "GET" && path.match(/^\/api\/queries\/[^/]+\/answer$/)) {
          const id = path.split("/")[3];
          res = await handleAnswerRecovery(request, env, id);
        } else if (method === "POST" && path.match(/^\/api\/queries\/[^/]+\/reconcile$/)) {
          const id = path.split("/")[3];
          res = await handleReconcile(request, env, id);
        } else {
          res = new Response("Not found", { status: 404 });
        }

        // Attach CORS headers to all API responses
        const headers = new Headers(res.headers);
        for (const [k, v] of Object.entries(cors)) headers.set(k, v);
        return new Response(res.body, { status: res.status, headers });
      } catch {
        return new Response(JSON.stringify({ error: "Internal server error. Check request status before retrying payment." }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // ── Static assets (React app) ─────────────────────────────────
    return env.ASSETS.fetch(request);
  },
};

// Returns the request's Origin if it is in the allowlist, otherwise falls back
// to the Worker's own origin. This prevents credentialed cross-origin abuse
// while still supporting localhost dev and the deployed frontend.
function resolveAllowedOrigin(requestOrigin: string, env: Env): string {
  // ALLOWED_ORIGINS is an optional comma-separated list set in wrangler.toml vars.
  // If absent, only same-origin (empty Origin header) and localhost are permitted.
  const raw = env.ALLOWED_ORIGINS ?? "";
  const allowed = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Always allow localhost origins in development
  const isLocalhost = /^https?:\/\/localhost(:\d+)?$/.test(requestOrigin);
  if (isLocalhost || allowed.includes(requestOrigin)) return requestOrigin;

  // Fall back to a null origin so browsers reject credentialed requests from
  // unknown origins rather than reflecting an arbitrary origin.
  return "null";
}
