import { it, expect, vi, afterEach } from "vitest";
import { fetchNotionPages, notionSelection } from "../lib/notion-source";
const page = "11111111-1111-4111-8111-111111111111",
  child = "22222222-2222-4222-8222-222222222222";
afterEach(() => {
  vi.unstubAllGlobals();
});
const authorize = async () => ({ Authorization: "Bearer fixture" }),
  active = async () => true,
  rejected = vi.fn(async () => {});
it("accepts only 1 to 5 distinct selected UUIDs", () => {
  expect(notionSelection({ pageIds: [page] })).toEqual([page]);
  for (const value of [
    { pageIds: [] },
    { pageIds: [page, page] },
    { pageIds: ["https://evil.test"] },
    { pageIds: [page], url: "https://evil.test" },
  ])
    expect(notionSelection(value)).toBeNull();
});
it("extracts selected text with unknown coverage without fetching embeds or unselected pages", async () => {
  const fetcher = vi.fn(
    async (url: any) =>
      new Response(
        JSON.stringify(
          String(url).includes("/pages/")
            ? {
                id: page,
                object: "page",
                properties: {
                  title: { type: "title", title: [{ plain_text: "My page" }] },
                },
              }
            : {
                results: [
                  {
                    id: child,
                    type: "paragraph",
                    has_children: false,
                    paragraph: { rich_text: [{ plain_text: "Safe text" }] },
                  },
                  {
                    id: child,
                    type: "embed",
                    has_children: true,
                    embed: { url: "http://127.0.0.1/private" },
                  },
                  {
                    id: child,
                    type: "child_page",
                    has_children: true,
                    child_page: { title: "Unselected" },
                  },
                ],
                has_more: false,
                next_cursor: null,
              },
        ),
      ),
  );
  vi.stubGlobal("fetch", fetcher);
  const result = await fetchNotionPages([page], authorize, active, rejected);
  expect(result.text).toContain("Safe text");
  expect(result.provenance[0].unsupported).toEqual({ embed: 1, child_page: 1 });
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(
    fetcher.mock.calls.every(
      ([url]) => new URL(url).hostname === "api.notion.com",
    ),
  ).toBe(true);
});
it.each([301, 302, 303, 307, 308, 401, 403])(
  "rejects provider status %s without following or accepting body",
  async (status) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("secret", {
            status,
            headers: { Location: "https://evil.test" },
          }),
      ),
    );
    await expect(
      fetchNotionPages([page], authorize, active, rejected),
    ).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  },
);
it("stops repeated pagination cursors", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: any) =>
        new Response(
          JSON.stringify(
            String(url).includes("/pages/")
              ? { id: page, object: "page", properties: {} }
              : { results: [], has_more: true, next_cursor: "again" },
          ),
        ),
    ),
  );
  await expect(
    fetchNotionPages([page], authorize, active, rejected),
  ).rejects.toThrow();
  expect(fetch).toHaveBeenCalledTimes(3);
});
it.each(["depth", "blocks", "response", "text"])(
  "bounds %s before accepting a draft",
  async (kind) => {
    let n = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: any) => {
        if (String(url).includes("/pages/"))
          return new Response(
            JSON.stringify({ id: page, object: "page", properties: {} }),
          );
        const block = {
          id:
            (++n).toString(16).padStart(8, "0") +
            "-0000-4000-8000-000000000000",
          type: "paragraph",
          has_children: kind === "depth",
          paragraph: {
            rich_text: [
              { plain_text: kind === "text" ? "x".repeat(500001) : "ok" },
            ],
          },
        };
        return new Response(
          kind === "response"
            ? "x".repeat(2000001)
            : JSON.stringify({
                results:
                  kind === "blocks"
                    ? Array.from({ length: 100 }, () => block)
                    : [block],
                has_more: kind === "blocks",
                next_cursor: kind === "blocks" ? String(n) : null,
              }),
        );
      }),
    );
    await expect(
      fetchNotionPages([page], authorize, active, rejected),
    ).rejects.toThrow();
  },
);
it("checks current capability before every provider request", async () => {
  const stillActive = vi.fn(async () => false);
  vi.stubGlobal("fetch", vi.fn());
  await expect(
    fetchNotionPages([page], authorize, stillActive, rejected),
  ).rejects.toThrow("inactive");
  expect(fetch).not.toHaveBeenCalled();
});
it("keeps unsupported prototype-like names as numeric coverage", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: any) =>
        new Response(
          JSON.stringify(
            String(url).includes("/pages/")
              ? { id: page, object: "page", properties: {} }
              : {
                  results: [
                    { id: child, type: "constructor", has_children: false },
                  ],
                  has_more: false,
                },
          ),
        ),
    ),
  );
  const result = await fetchNotionPages([page], authorize, active, rejected);
  expect(result.provenance[0].unsupported.constructor).toBe(1);
});
