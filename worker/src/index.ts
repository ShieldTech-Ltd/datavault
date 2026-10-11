import {handleNotionCallback} from './lib/notion-connector';
import {handleGithubCallback} from './lib/github-connector';
import { handleDeveloperCollections } from './lib/developer-keys';
import { queueNotifications, scheduledNotifications } from './lib/notification-adapters';
import { handleUnsubscribe } from './lib/email-unsubscribe';
import { handleStatus } from './routes/status';
import { handleCollectionRevisions } from "./routes/collection-revisions";
import { handleCollectionMetadata } from './routes/collection-metadata';
import { handleAccountRoute } from "./routes/account";
import type { Env, NotificationWork } from "./lib/types";
import {
  handleRegisterCollection,
  handleConfirmCollection,
} from "./routes/collections";
import {
  handleDemoCollection,
  handlePrepare,
  handleExecute,
  handleReceipt,
  handleAnswerRecovery,
  handleReconcile,
} from "./routes/queries";
import {
  allowedOrigin,
  boundedApiRequest,
  corsHeaders,
  securedResponse,
} from "./lib/http-security";
import {
  handleListCollections,
  handleCollectionDetail,
  handleOwnerCollections,
} from "./routes/marketplace";
import {
  handleMarketplaceAnalytics,
  handleOwnerAnalytics,
} from "./routes/analytics";
import { handleBuyerHistory } from "./routes/buyer-history";
import { checkRateLimit, callerIdentity, routeRateBucket } from "./lib/ratelimit";

export default {
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    await scheduledNotifications(env);
  },
  async queue(batch: MessageBatch<NotificationWork>, env: Env): Promise<void> {
    await queueNotifications(batch, env);
  },
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // ── API routes ────────────────────────────────────────────────
    if (path.startsWith("/api/")) {
      const origin = allowedOrigin(request, env);
      const cors = corsHeaders(origin);
      if (request.headers.has("Origin") && !origin) {
        return securedResponse(
          new Response("Origin not allowed", { status: 403 }),
          true
        );
      }
      if (method === "OPTIONS")
        return securedResponse(
          new Response(null, { status: 204, headers: cors }),
          true
        );

      try {
        const bounded = await boundedApiRequest(request);
        if (bounded instanceof Response) return securedResponse(bounded, true);
        request = bounded;
        const bucket = routeRateBucket(method, path);
        if (bucket) {
          const quota = await checkRateLimit(
            callerIdentity(request),
            bucket,
            env
          );
          if (!quota.allowed)
            return securedResponse(
              new Response(
                JSON.stringify({ error: "Too many requests for this API operation." }),
                {
                  status: 429,
                  headers: {
                    "Content-Type": "application/json",
                    "Retry-After": String(quota.retryAfter),
                  },
                }
              ),
              true
            );
        }
        let res: Response;

        if(method==='GET'&&path==='/api/connectors/notion/callback'){
          res=await handleNotionCallback(request,env);
        } else if(method==='GET'&&path==='/api/connectors/github/callback'){
          res=await handleGithubCallback(request,env);
        } else if(method==='GET'&&path==='/api/developer/collections'){
          res=await handleDeveloperCollections(request,env);
        } else if(path==='/api/email/unsubscribe'){
          res=await handleUnsubscribe(request,env);
        } else if ((method === "GET" && ["/api/status","/api/health"].includes(path)) || (method === "POST" && path === "/api/status/observations")) {
          res = await handleStatus(request, env);
        } else if (path === "/api/account" || path.startsWith("/api/account/") || path.startsWith("/api/auth/") || path.startsWith('/api/workspaces/')) {
          res = await handleAccountRoute(request, env);
        } else if (method === "GET" && path === "/api/marketplace/analytics") {
          res = await handleMarketplaceAnalytics(env, request);
        } else if (method === "GET" && ["/api/owner/analytics", "/api/owner/analytics/export"].includes(path)) {
          res = await handleOwnerAnalytics(request, env);
        } else if (method === "GET" && path === "/api/owner/collections") {
          res = await handleOwnerCollections(request, env);
        } else if (method === "GET" && path === "/api/buyer/queries") {
          res = await handleBuyerHistory(request, env);
        } else if (method === "GET" && path === "/api/collections") {
          res = await handleListCollections(request, env);
        } else if (
          method === "GET" &&
          /^\/api\/collections\/[^/]+$/.test(path)
        ) {
          res = await handleCollectionDetail(env, path.split("/")[3]);
        } else if ((method === "GET" || method === "POST") && /^\/api\/collections\/[^/]+\/revisions$/.test(path)) {
          res = await handleCollectionRevisions(request, env, path.split("/")[3]);
        } else if (method === "PATCH" && /^\/api\/collections\/[^/]+\/metadata$/.test(path)) {
          res = await handleCollectionMetadata(request, env, path.split("/")[3]);
        } else if (method === "POST" && path === "/api/collections") {
          res = await handleRegisterCollection(request, env);
        } else if (
          method === "POST" &&
          path.match(/^\/api\/collections\/[^/]+\/confirm$/)
        ) {
          const id = path.split("/")[3];
          res = await handleConfirmCollection(request, env, id);
        } else if (
          method === "POST" &&
          path.match(/^\/api\/collections\/[^/]+\/upload$/)
        ) {
          res = new Response(
            JSON.stringify({
              error:
                "Collection content is immutable. Publish a new collection and link it as a revision.",
            }),
            {
              status: 410,
              headers: { "Content-Type": "application/json" },
            }
          );
        } else if (method === "GET" && path === "/api/demo") {
          res = await handleDemoCollection(env);
        } else if (method === "POST" && path === "/api/queries/prepare") {
          res = await handlePrepare(request, env);
        } else if (method === "POST" && path === "/api/queries/execute") {
          res = await handleExecute(request, env);
        } else if (
          method === "GET" &&
          path.match(/^\/api\/queries\/[^/]+\/receipt$/)
        ) {
          const id = path.split("/")[3];
          res = await handleReceipt(env, id);
        } else if (
          method === "GET" &&
          path.match(/^\/api\/queries\/[^/]+\/answer$/)
        ) {
          const id = path.split("/")[3];
          res = await handleAnswerRecovery(request, env, id);
        } else if (
          method === "POST" &&
          path.match(/^\/api\/queries\/[^/]+\/reconcile$/)
        ) {
          const id = path.split("/")[3];
          res = await handleReconcile(request, env, id);
        } else {
          res = new Response("Not found", { status: 404 });
        }

        // Attach CORS headers to all API responses
        const headers = new Headers(res.headers);
        cors.forEach((value, key) => headers.set(key, value));
        return securedResponse(
          new Response(res.body, { status: res.status, headers }),
          true
        );
      } catch {
        return securedResponse(
          new Response(
            JSON.stringify({
              error:
                "Internal server error. Check request status before retrying payment.",
            }),
            {
              status: 500,
              headers: { "Content-Type": "application/json", Vary: "Origin" },
            }
          ),
          true
        );
      }
    }

    // ── Static assets (React app) ─────────────────────────────────
    return securedResponse(await env.ASSETS.fetch(request));
  },
};
