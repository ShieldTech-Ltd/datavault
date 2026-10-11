import { it, expect, vi, afterEach } from "vitest";
import { fetchWebsitePages } from "../lib/website-source";
import * as accountSession from "../lib/account-session";
import type { Env } from "../lib/types";
const env = { WEBSITE_IMPORT_HOSTS: "approved.example" } as Env;
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it.each(["timer", "elapsed"])(
  "rejects a page when the %s deadline expires during final provenance hashing",
  async (mode) => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (raw: string) => {
        const url = new URL(raw);
        if (url.hostname === "cloudflare-dns.com")
          return Response.json({
            Status: 0,
            Answer:
              url.searchParams.get("type") === "A"
                ? [
                    {
                      name: "approved.example.",
                      type: 1,
                      data: "93.184.216.34",
                    },
                  ]
                : [],
          });
        return new Response("page", {
          headers: { "Content-Type": "text/plain" },
        });
      }),
    );
    let release!: (hash: string) => void;
    vi.spyOn(accountSession, "digest").mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          release = resolve;
        }),
    );
    const pending = fetchWebsitePages(
      env,
      ["https://approved.example/page"],
      async () => true,
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(
      release,
      "final provenance hashing reached its controlled barrier",
    ).toBeTypeOf("function");
    if (mode === "timer") await vi.advanceTimersByTimeAsync(10000);
    else vi.setSystemTime(Date.now() + 10000);
    release("a".repeat(64));
    await expect(pending).rejects.toThrow("timeout");
  },
);
it("aborts a stalled DNS request at the per-page deadline", async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () =>
            reject(Error("deadline")),
          );
        }),
    ),
  );
  const result = expect(
    fetchWebsitePages(env, ["https://approved.example/page"], async () => true),
  ).rejects.toThrow("deadline");
  await vi.advanceTimersByTimeAsync(10000);
  await result;
});
it("shares extracted text and response byte budgets across all selected pages", async () => {
  for (const html of [false, true]) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (raw: string) => {
        const url = new URL(raw);
        if (url.hostname === "cloudflare-dns.com")
          return Response.json({
            Status: 0,
            Answer:
              url.searchParams.get("type") === "A"
                ? [
                    {
                      name: "approved.example.",
                      type: 1,
                      data: "93.184.216.34",
                    },
                  ]
                : [],
          });
        return new Response(
          html
            ? "<script>" + "x".repeat(1100000) + "</script><p>Text</p>"
            : "x".repeat(260000),
          { headers: { "Content-Type": html ? "text/html" : "text/plain" } },
        );
      }),
    );
    await expect(
      fetchWebsitePages(
        env,
        ["https://approved.example/1", "https://approved.example/2"],
        async () => true,
      ),
    ).rejects.toThrow("size");
  }
});
it("does not start network work after cancellation or operator removal", async () => {
  vi.stubGlobal("fetch", vi.fn());
  await expect(
    fetchWebsitePages(
      env,
      ["https://approved.example/page"],
      async () => false,
    ),
  ).rejects.toThrow("inactive");
  await expect(
    fetchWebsitePages(
      { ...env, WEBSITE_IMPORT_HOSTS: "" },
      ["https://approved.example/page"],
      async () => true,
    ),
  ).rejects.toThrow("selection");
  expect(fetch).not.toHaveBeenCalled();
});
