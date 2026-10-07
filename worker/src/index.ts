import type { Env } from "./lib/types";
import { handleRegisterCollection, handleConfirmCollection } from "./routes/collections";
import { handleDemoCollection, handlePrepare, handleExecute, handleReceipt, handleAnswerRecovery, handleReconcile } from "./routes/queries";
import { allowedOrigin, boundedApiRequest, corsHeaders, securedResponse } from "./lib/http-security";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // ── API routes ────────────────────────────────────────────────
    if (path.startsWith("/api/")) {
      const origin = allowedOrigin(request, env);
      const cors = corsHeaders(origin);
      if (request.headers.has("Origin") && !origin) {
        return securedResponse(new Response("Origin not allowed", { status: 403 }), true);
      }
      if (method === "OPTIONS") return securedResponse(new Response(null, { status: 204, headers: cors }), true);

      try {
        const bounded = await boundedApiRequest(request);
        if (bounded instanceof Response) return securedResponse(bounded, true);
        request = bounded;
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
        cors.forEach((value, key) => headers.set(key, value));
        return securedResponse(new Response(res.body, { status: res.status, headers }), true);
      } catch {
        return securedResponse(new Response(JSON.stringify({ error: "Internal server error. Check request status before retrying payment." }), {
          status: 500,
          headers: { "Content-Type": "application/json", "Vary": "Origin" },
        }), true);
      }
    }

    // ── Static assets (React app) ─────────────────────────────────
    return securedResponse(await env.ASSETS.fetch(request));
  },
};
