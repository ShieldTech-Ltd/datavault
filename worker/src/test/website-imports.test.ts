import { beforeEach, afterEach, it, expect, vi } from "vitest";
import worker from "../index";
import { sqliteD1 } from "./sqlite-d1";
import { digest } from "../lib/account-session";
import type { Env } from "../lib/types";
let store: ReturnType<typeof sqliteD1>, env: Env;
const csrf = "c".repeat(64),
  objects = new Map<string, string>();
const input = {
  urls: ["https://approved.example/page"],
  permissionAccepted: true,
};
const request = (
  path = "",
  method = "GET",
  body?: unknown,
  owner = 1,
  provider = "website",
) =>
  worker.fetch(
    new Request(
      "https://vault.example/api/account/imports/" + provider + path,
      {
        method,
        headers: {
          Origin: "https://vault.example",
          Cookie: "dv_session=" + String(owner).repeat(64),
          "x-csrf-token": csrf,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
    ),
    env,
  );
const dns = (url: string) =>
  new Response(
    JSON.stringify({
      Status: 0,
      Answer:
        new URL(url).searchParams.get("type") === "A"
          ? [{ name: "approved.example.", type: 1, data: "93.184.216.34" }]
          : [],
    }),
    { headers: { "Content-Type": "application/dns-json" } },
  );
beforeEach(async () => {
  store = sqliteD1();
  objects.clear();
  env = {
    DB: store.db,
    WEBSITE_IMPORT_HOSTS: "approved.example",
    CHAIN_ID: "10143",
    CONTRACT_ADDRESS: "0x" + "ab".repeat(20),
    COLLECTION_STORE: {
      put: async (k: string, v: string) => objects.set(k, v),
      get: async (k: string) =>
        objects.has(k) ? { text: async () => objects.get(k) } : null,
      delete: async (k: string) => objects.delete(k),
    },
  } as unknown as Env;
  for (let n = 1; n <= 2; n++) {
    await env.DB.prepare(
      "INSERT INTO accounts(account_id,address,chain_id,contract_address,created_at,updated_at) VALUES(?,?,?,?,1,1)",
    )
      .bind("a" + n, "0x" + String(n).repeat(40), 10143, env.CONTRACT_ADDRESS)
      .run();
    await env.DB.prepare(
      "INSERT INTO account_sessions(token_hash,account_id,csrf_token,expires_at,created_at) VALUES(?,?,?,?,1)",
    )
      .bind(
        await digest(String(n).repeat(64)),
        "a" + n,
        csrf,
        Date.now() + 1000000,
      )
      .run();
  }
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url.startsWith("https://cloudflare-dns.com/dns-query?")
        ? dns(url)
        : new Response("Private selected page", {
            headers: { "Content-Type": "text/plain" },
          }),
    ),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  store.close();
});
it("advertises GitHub private selection only when the provider is configured", async () => {
  expect(
    await (await request("", "GET", undefined, 1, "github")).json(),
  ).toMatchObject({ publicOnly: true, sourceModes: ["public"] });
  Object.assign(env, {
    GITHUB_APP_ID: "123",
    GITHUB_CLIENT_ID: "Iv1.fixture",
    GITHUB_CLIENT_SECRET: "fixture",
    CONNECTOR_TOKEN_KEY: "12".repeat(32),
    CONNECTOR_ORIGIN: "https://vault.example",
  });
  expect(
    await (await request("", "GET", undefined, 1, "github")).json(),
  ).toMatchObject({
    publicOnly: false,
    sourceModes: ["public", "connected_selected"],
  });
});
it("imports approved selected pages to an owner-only recoverable draft with provenance and no publication", async () => {
  const r = await request("", "POST", input);
  expect(r.status).toBe(201);
  const j = (await r.json()) as any;
  expect(j.status).toBe("review_ready");
  expect(j.urls).toEqual(input.urls);
  expect(j.provenance[0]).toMatchObject({
    url: input.urls[0],
    contentDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
    fetchedAt: expect.any(String),
  });
  expect(await (await request("/" + j.id + "/draft")).text()).toContain(
    "Private selected page",
  );
  expect(
    (await request("/" + j.id + "/draft", "GET", undefined, 2)).status,
  ).toBe(404);
  expect(
    (await request("/" + j.id, "GET", undefined, 1, "github")).status,
  ).toBe(404);
  expect(store.sqlite.prepare("SELECT * FROM collections").all()).toHaveLength(
    0,
  );
  expect(JSON.stringify(j)).not.toContain("Private selected page");
});
it("is unavailable by default and requires explicit permission", async () => {
  expect((await request("", "POST", { urls: input.urls })).status).toBe(400);
  (env as any).WEBSITE_IMPORT_HOSTS = "";
  expect((await request("", "GET")).status).toBe(200);
  expect(((await (await request()).json()) as any).available).toBe(false);
  expect((await request("", "POST", input)).status).toBe(503);
  expect(fetch).not.toHaveBeenCalled();
});
it.each([
  "http://approved.example/a",
  "https://approved.example:444/a",
  "https://u:p@approved.example/a",
  "https://approved.example/a?x=1",
  "https://approved.example/a#x",
  "https://127.1/a",
  "https://2130706433/a",
  "https://0x7f000001/a",
  "https://[::1]/a",
  "https://localhost/a",
  "https://a.local/a",
  "https://unapproved.example/a",
  "https://approved.example./a",
  "https://approved.example\\@evil.example/a",
])("rejects unsafe URL before any fetch: %s", async (url) => {
  expect((await request("", "POST", { ...input, urls: [url] })).status).toBe(
    400,
  );
  expect(fetch).not.toHaveBeenCalled();
});
it("rejects excess or duplicate pages", async () => {
  for (const urls of [
    [],
    Array(6).fill(input.urls[0]),
    [...input.urls, ...input.urls],
  ])
    expect((await request("", "POST", { ...input, urls })).status).toBe(400);
  expect(fetch).not.toHaveBeenCalled();
});
it.each([
  "127.0.0.1",
  "10.0.0.1",
  "169.254.169.254",
  "100.64.0.1",
  "192.0.2.1",
  "224.0.0.1",
  "0.0.0.0",
  "240.0.0.1",
  "::1",
  "::ffff:127.0.0.1",
  "fc00::1",
  "fe80::1",
  "2001:db8::1",
])("fails closed on mixed DNS answers containing %s", async (data) => {
  vi.mocked(fetch).mockImplementation(
    async () =>
      new Response(
        JSON.stringify({
          Status: 0,
          Answer: [
            { name: "approved.example.", type: 1, data: "93.184.216.34" },
            {
              name: "approved.example.",
              type: data.includes(":") ? 28 : 1,
              data,
            },
          ],
        }),
      ),
  );
  const j = (await (await request("", "POST", input)).json()) as any;
  expect(j.status).toBe("failed");
  expect(objects.size).toBe(0);
});
it.each([301, 302, 303, 304, 307, 308])(
  "rejects HTTP %s without consuming redirect body",
  async (status) => {
    vi.mocked(fetch).mockImplementation(async (url: any) =>
      String(url).includes("dns-query")
        ? dns(String(url))
        : new Response(null, {
            status,
            headers: { Location: "https://approved.example/final" },
          }),
    );
    const j = (await (await request("", "POST", input)).json()) as any;
    expect(j.status).toBe("failed");
    expect(j.error).toContain("final URL");
    expect(objects.size).toBe(0);
  },
);
it("enforces global inflight admission across GitHub and website in SQLite", async () => {
  let release!: (r: Response) => void;
  vi.mocked(fetch).mockImplementationOnce(
    () =>
      new Promise((r) => {
        release = r;
      }),
  );
  const pending = request("", "POST", input);
  for (let n = 0; !release && n < 100; n++)
    await new Promise((r) => setTimeout(r, 1));
  expect(release).toBeDefined();
  expect(
    (
      await request(
        "",
        "POST",
        { repository: "a/b", ref: "main", paths: ["README.md"] },
        1,
        "github",
      )
    ).status,
  ).toBe(429);
  release(dns("https://cloudflare-dns.com/dns-query?type=A"));
  await pending;
});
it("enforces global rolling daily quota across providers", async () => {
  for (let n = 0; n < 20; n++)
    await env.DB.prepare(
      "INSERT INTO github_import_jobs(id,account_id,repository,ref,paths,status,idempotency_key,created_at,expires_at) VALUES(?,'a1','a/b','main','[]','failed',?,?,?)",
    )
      .bind(
        String(n).padStart(64, "0"),
        "key" + n,
        Date.now(),
        Date.now() + 10000,
      )
      .run();
  expect((await request("", "POST", input)).status).toBe(429);
  expect(fetch).not.toHaveBeenCalled();
});
it("cancellation fences website fetch completion and replay", async () => {
  let release!: (r: Response) => void;
  vi.mocked(fetch).mockImplementation(async (url: any) =>
    String(url).includes("dns-query")
      ? dns(String(url))
      : new Promise((r) => {
          release = r;
        }),
  );
  const pending = request("", "POST", input);
  for (let n = 0; !release && n < 100; n++)
    await new Promise((r) => setTimeout(r, 1));
  expect(release).toBeDefined();
  const row = store.sqlite
    .prepare("SELECT * FROM github_import_jobs")
    .all()[0] as any;
  expect((await request("/" + row.id + "/cancel", "POST", {})).status).toBe(
    200,
  );
  release(
    new Response("source", { headers: { "Content-Type": "text/plain" } }),
  );
  await pending;
  expect(objects.size).toBe(0);
  expect(
    ((await (await request("/" + row.id + "/run", "POST", {})).json()) as any)
      .status,
  ).toBe("cancelled");
});

it("extracts readable HTML without scripts, navigation or executable output", async () => {
  vi.mocked(fetch).mockImplementation(async (url: any) =>
    String(url).includes("dns-query")
      ? dns(String(url))
      : new Response(
          '<html><head><script>secretScript()</script><style>secretStyle</style></head><body><nav>secretNav</nav><main><h1>Title &amp; source</h1><p>Hello <b>world</b></p><img src="https://evil.example"><iframe>secretFrame</iframe><div hidden>secretHidden</div><p>&lt;script&gt;literal&lt;/script&gt;</p></main></body></html>',
          { headers: { "Content-Type": "text/html; charset=utf-8" } },
        ),
  );
  const j = (await (await request("", "POST", input)).json()) as any;
  expect(j.status).toBe("review_ready");
  const r = await request("/" + j.id + "/draft");
  expect(r.headers.get("Content-Type")).toContain("text/plain");
  const text = await r.text();
  expect(text).toContain("Title & source");
  expect(text).toContain("world");
  expect(text).not.toMatch(/secret|<img|<iframe|<html/);
  expect(text).toContain("<script>literal</script>");
});
it.each([
  "application/pdf",
  "text/html; bad=1",
  "text/plain, text/html",
  "text/plain; charset=iso-8859-1",
  "",
])("fails unsupported or malformed content type %s", async (type) => {
  vi.mocked(fetch).mockImplementation(async (url: any) =>
    String(url).includes("dns-query")
      ? dns(String(url))
      : new Response("source", { headers: { "Content-Type": type } }),
  );
  const j = (await (await request("", "POST", input)).json()) as any;
  expect(j.status).toBe("failed");
  expect(objects.size).toBe(0);
});
it("enforces declared and streamed byte budgets and extracted text limits", async () => {
  for (const [text, headers] of [
    ["source", { "Content-Type": "text/plain", "Content-Length": "2000001" }],
    ["x".repeat(2000001), { "Content-Type": "text/plain" }],
    ["x".repeat(500001), { "Content-Type": "text/plain" }],
    ["", { "Content-Type": "text/plain" }],
  ] as const) {
    vi.mocked(fetch).mockImplementation(async (url: any) =>
      String(url).includes("dns-query")
        ? dns(String(url))
        : new Response(text, { headers }),
    );
    const j = (await (await request("", "POST", input)).json()) as any;
    expect(j.status).toBe("failed");
    expect(objects.size).toBe(0);
  }
});
it("rejects DNS failures, redirects, CNAME loops and changed answers", async () => {
  for (const mode of ["failure", "redirect", "loop", "changed"]) {
    let calls = 0;
    vi.mocked(fetch).mockImplementation(async () => {
      calls++;
      if (mode === "redirect") return new Response(null, { status: 302 });
      if (mode === "failure")
        return new Response(JSON.stringify({ Status: 2 }));
      if (mode === "loop")
        return new Response(
          JSON.stringify({
            Status: 0,
            Answer: [
              { name: "approved.example.", type: 5, data: "approved.example." },
            ],
          }),
        );
      return new Response(
        JSON.stringify({
          Status: 0,
          Answer: [
            {
              name: "approved.example.",
              type: 1,
              data: calls <= 2 ? "93.184.216.34" : "93.184.216.35",
            },
          ],
        }),
      );
    });
    const j = (await (await request("", "POST", input)).json()) as any;
    expect(j.status).toBe("failed");
    expect(objects.size).toBe(0);
  }
});
it("rechecks operator approval on retry and prevents draft reuse after expiry or deployment changes", async () => {
  const j = (await (await request("", "POST", input)).json()) as any;
  env.CONTRACT_ADDRESS = "0x" + "cd".repeat(20);
  expect((await request("/" + j.id)).status).toBe(401);
  env.CONTRACT_ADDRESS = "0x" + "ab".repeat(20);
  await env.DB.prepare("UPDATE github_import_jobs SET expires_at=1 WHERE id=?")
    .bind(j.id)
    .run();
  expect((await request("/" + j.id + "/draft")).status).toBe(409);
  expect(objects.size).toBe(0);
});
it("accepts a bounded public CNAME chain and rejects a chain longer than five aliases", async () => {
  for (const length of [2, 6]) {
    vi.mocked(fetch).mockImplementation(async (raw: any) => {
      const url = new URL(String(raw));
      if (url.hostname !== "cloudflare-dns.com")
        return new Response("CNAME page", {
          headers: { "Content-Type": "text/plain" },
        });
      const name = url.searchParams.get("name")!,
        index =
          name === "approved.example" ? 0 : Number(name.split(".")[0].slice(1));
      return new Response(
        JSON.stringify({
          Status: 0,
          Answer:
            index < length
              ? [
                  {
                    name: name + ".",
                    type: 5,
                    data: "c" + (index + 1) + ".example.",
                  },
                ]
              : url.searchParams.get("type") === "A"
                ? [{ name: name + ".", type: 1, data: "93.184.216.34" }]
                : [],
        }),
      );
    });
    const j = (await (
      await request("", "POST", {
        ...input,
        urls: ["https://approved.example/chain" + length],
      })
    ).json()) as any;
    expect(j.status).toBe(length === 2 ? "review_ready" : "failed");
  }
});
it("bounds the total CNAME graph and rejects unrelated address answers", async () => {
  vi.mocked(fetch).mockImplementation(
    async () =>
      new Response(
        JSON.stringify({
          Status: 0,
          Answer: [
            { name: "unrelated.example.", type: 1, data: "93.184.216.34" },
          ],
        }),
      ),
  );
  const j = (await (await request("", "POST", input)).json()) as any;
  expect(j.status).toBe("failed");
  expect(objects.size).toBe(0);
});
it("admits only one simultaneous GitHub or website request at the global daily boundary", async () => {
  await env.DB.prepare(
    "WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<19) INSERT INTO github_import_jobs(id,account_id,repository,ref,paths,status,idempotency_key,created_at,expires_at) SELECT printf('%064d',x),'a1','a/b','main','[]','failed','prior'||x,?,? FROM n",
  )
    .bind(Date.now(), Date.now() + 100000)
    .run();
  vi.mocked(fetch).mockImplementation(async (raw: any) => {
    const url = String(raw);
    if (url.includes("dns-query")) return dns(url);
    if (url.includes("api.github.com"))
      return Response.json(
        url.includes("/commits/")
          ? { sha: "a".repeat(40) }
          : {
              type: "file",
              path: "README.md",
              encoding: "base64",
              content: btoa("text"),
              size: 4,
            },
      );
    return new Response("page", { headers: { "Content-Type": "text/plain" } });
  });
  const responses = await Promise.all([
    request("", "POST", input),
    request(
      "",
      "POST",
      { repository: "a/b", ref: "main", paths: ["README.md"] },
      1,
      "github",
    ),
  ]);
  expect(responses.map((r) => r.status).sort()).toEqual([201, 429]);
  expect(
    store.sqlite
      .prepare("SELECT COUNT(*) AS count FROM github_import_jobs")
      .all(),
  ).toEqual([{ count: 20 }]);
});
