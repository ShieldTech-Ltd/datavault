import { describe, expect, it } from "vitest";
import { allowedOrigin, boundedApiRequest, corsHeaders, securedResponse } from "../lib/http-security";
import type { Env } from "../lib/types";

const env = { ALLOWED_ORIGINS: "https://preview.example.org" } as Env;

describe("HTTP security boundary", () => {
  it("accepts the deployment origin and an exact configured origin", () => {
    expect(allowedOrigin(new Request("https://demo.example.org/api/demo", {
      headers: { Origin: "https://demo.example.org" },
    }), env)).toBe("https://demo.example.org");
    expect(allowedOrigin(new Request("https://demo.example.org/api/demo", {
      headers: { Origin: "https://preview.example.org" },
    }), env)).toBe("https://preview.example.org");
  });

  it("rejects localhost and lookalike origins on public deployments", () => {
    for (const origin of ["http://localhost:5173", "https://demo.example.org.attacker.test", "null"]) {
      expect(allowedOrigin(new Request("https://demo.example.org/api/demo", {
        headers: { Origin: origin },
      }), env)).toBeNull();
    }
    expect(corsHeaders(null).has("Access-Control-Allow-Origin")).toBe(false);
  });

  it("allows a local Vite origin only when the Worker is local", () => {
    expect(allowedOrigin(new Request("http://localhost:8787/api/demo", {
      headers: { Origin: "http://localhost:5173" },
    }), env)).toBe("http://localhost:5173");
  });

  it("sets no-store and browser hardening headers on API responses", () => {
    const response = securedResponse(new Response("ok"), true);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
  });

  it("rejects an oversized JSON body even without a declared length", async () => {
    const request = new Request("https://demo.example.org/api/queries/prepare", {
      method: "POST", body: "x".repeat(9 * 1024),
    });
    request.headers.delete("Content-Length");
    const result = await boundedApiRequest(request);
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(413);
  });

  it("preserves a bounded request body for route parsing", async () => {
    const request = new Request("https://demo.example.org/api/queries/prepare", {
      method: "POST", body: JSON.stringify({ question: "What is in the guide?" }),
    });
    const result = await boundedApiRequest(request);
    expect(result).toBeInstanceOf(Request);
    expect(await (result as Request).json()).toEqual({ question: "What is in the guide?" });
  });
});
