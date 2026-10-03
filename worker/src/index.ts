import type { Env } from "./lib/types";
import { handleRegisterCollection, handleUploadCollection } from "./routes/collections";
import { handlePrepare, handleExecute, handleReceipt } from "./routes/queries";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // ── API routes ────────────────────────────────────────────────
    if (path.startsWith("/api/")) {
      const cors = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, x-owner-address",
      };

      if (method === "OPTIONS") return new Response(null, { headers: cors });

      try {
        let res: Response;

        if (method === "POST" && path === "/api/collections") {
          res = await handleRegisterCollection(request, env);
        } else if (method === "POST" && path.match(/^\/api\/collections\/[^/]+\/upload$/)) {
          const id = path.split("/")[3];
          res = await handleUploadCollection(request, env, id);
        } else if (method === "POST" && path === "/api/queries/prepare") {
          res = await handlePrepare(request, env);
        } else if (method === "POST" && path === "/api/queries/execute") {
          res = await handleExecute(request, env);
        } else if (method === "GET" && path.match(/^\/api\/queries\/[^/]+\/receipt$/)) {
          const id = path.split("/")[3];
          res = await handleReceipt(env, id);
        } else {
          res = new Response("Not found", { status: 404 });
        }

        // Attach CORS headers to all API responses
        const headers = new Headers(res.headers);
        for (const [k, v] of Object.entries(cors)) headers.set(k, v);
        return new Response(res.body, { status: res.status, headers });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Internal server error";
        return new Response(JSON.stringify({ error: msg }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // ── Static assets (React app) ─────────────────────────────────
    return env.ASSETS.fetch(request);
  },
};
