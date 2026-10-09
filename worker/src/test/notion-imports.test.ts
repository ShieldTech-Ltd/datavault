import { beforeEach, afterEach, it, expect, vi } from "vitest";
import worker from "../index";
import { sqliteD1 } from "./sqlite-d1";
import { digest } from "../lib/account-session";
import { sealConnector, connectorDeployment } from "../lib/connector-security";
import type { Env } from "../lib/types";
import {notionCredentialHeader} from '../lib/notion-connector';
it('fences existing Notion credentials when provider configuration is removed',async()=>{
  env.NOTION_CLIENT_SECRET=undefined;
  await expect(notionCredentialHeader(env,'connector','a1',1)).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});
let store: ReturnType<typeof sqliteD1>, env: Env;
const objects = new Map<string, string>(),
  page = "11111111-1111-4111-8111-111111111111";
const req = (path = "", method = "GET", body?: unknown) =>
  worker.fetch(
    new Request("https://vault.example/api/account/imports/notion" + path, {
      method,
      headers: {
        Origin: "https://vault.example",
        Cookie: "dv_session=" + "1".repeat(64),
        "x-csrf-token": "c".repeat(64),
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
  );
beforeEach(async () => {
  store = sqliteD1();
  objects.clear();
  env = {
    DB: store.db,
    CHAIN_ID: "10143",
    CONTRACT_ADDRESS: "0x" + "ab".repeat(20),
    PUBLIC_ORIGIN: "https://vault.example",
    NOTION_CLIENT_ID: page,
    NOTION_CLIENT_SECRET: "fixture",
    CONNECTOR_TOKEN_KEY: "ab".repeat(32),
    COLLECTION_STORE: {
      put: async (k: string, v: string) => objects.set(k, v),
      get: async (k: string) =>
        objects.has(k) ? { text: async () => objects.get(k) } : null,
      delete: async (k: string) => objects.delete(k),
    },
  } as unknown as Env;
  await env.DB.prepare(
    "INSERT INTO accounts(account_id,address,chain_id,contract_address,created_at,updated_at) VALUES(?,?,?,?,1,1)",
  )
    .bind("a1", "0x" + "1".repeat(40), 10143, env.CONTRACT_ADDRESS)
    .run();
  await env.DB.prepare(
    "INSERT INTO account_sessions(token_hash,account_id,csrf_token,expires_at,created_at) VALUES(?,?,?,?,1)",
  )
    .bind(
      await digest("1".repeat(64)),
      "a1",
      "c".repeat(64),
      Date.now() + 1000000,
    )
    .run();
  const credential = await sealConnector(env, "a1", "notion", {
    access: "ntn_fixture",
    refresh: "ntn_refresh",
    expires: null,
    refreshExpires: null,
    workspaceName: "Fixture",
  });
  await env.DB.prepare(
    "INSERT INTO account_connectors(id,account_id,provider,deployment,status,credential,created_at,updated_at) VALUES('connector','a1','notion',?,'connected',?,1,1)",
  )
    .bind(connectorDeployment(env), credential)
    .run();
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: any) =>
        new Response(
          JSON.stringify(
            String(url).endsWith("introspect")
              ? { active: true }
              : String(url).includes("/pages/")
                ? { id: page, object: "page", properties: {} }
                : {
                    results: [
                      {
                        id: "22222222-2222-4222-8222-222222222222",
                        type: "paragraph",
                        has_children: false,
                        paragraph: {
                          rich_text: [{ plain_text: "Selected private text" }],
                        },
                      },
                    ],
                    has_more: false,
                  },
          ),
        ),
    ),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  store.close();
});
it("does not advertise import capability before current-wallet confirmation", async () => {
  await env.DB.prepare("UPDATE account_connectors SET status='pending'").run();
  expect(await (await req()).json()).toMatchObject({ available: false });
  expect((await req("", "POST", { pageIds: [page] })).status).toBe(403);
});
it("imports selected Notion text into private review with credential-free metadata", async () => {
  const r = await req("", "POST", { pageIds: [page] });
  expect(r.status).toBe(201);
  const job = (await r.json()) as any;
  expect(job).toMatchObject({
    provider: "notion",
    status: "review_ready",
    pageIds: [page],
  });
  expect(JSON.stringify(job)).not.toContain("ntn_");
  expect(await (await req("/" + job.id + "/draft")).text()).toContain(
    "Selected private text",
  );
  expect(objects.size).toBe(1);
});
it("shares global inflight admission with website and GitHub", async () => {
  await env.DB.prepare(
    "INSERT INTO github_import_jobs(id,account_id,repository,ref,paths,status,idempotency_key,created_at,expires_at,provider) VALUES('existing','a1','website','selected','[]','queued','existing',?,?,'website')",
  )
    .bind(Date.now(), Date.now() + 100000)
    .run();
  expect((await req("", "POST", { pageIds: [page] })).status).toBe(429);
  expect(objects.size).toBe(0);
});
it("fences a removed connection during R2 write and rejects its draft", async () => {
  env.COLLECTION_STORE.put = async (k: any, v: any) => {
    objects.set(k, v);
    await env.DB.prepare(
      "UPDATE account_connectors SET status='disconnected',credential=NULL,credential_version=credential_version+1",
    ).run();
    return {} as any;
  };
  const r = await req("", "POST", { pageIds: [page] });
  expect(r.status).toBe(201);
  const job = (await r.json()) as any;
  expect(job.status).not.toBe("review_ready");
  expect(objects.size).toBe(0);
  expect((await req("/" + job.id + "/draft")).status).toBe(409);
});
it("counts all providers toward the rolling 20 job quota", async () => {
  store.migrate(
    `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<20) INSERT INTO github_import_jobs(id,account_id,repository,ref,paths,status,idempotency_key,created_at,expires_at,provider) SELECT 'previous'||i,'a1','fixture','selected','[]','cancelled','key'||i,${Date.now()},${Date.now() + 100000},CASE WHEN i%2=0 THEN 'github' ELSE 'website' END FROM n;`,
  );
  expect((await req("", "POST", { pageIds: [page] })).status).toBe(429);
});
it.each([401, 403])(
  "marks provider permission failure %s as reconnect without exposing response text",
  async (status) => {
    vi.mocked(fetch).mockImplementation(async (url: any) =>
      String(url).endsWith("/introspect")
        ? new Response(JSON.stringify({ active: true }))
        : new Response("ntn_private_provider_failure", { status }),
    );
    const r = await req("", "POST", { pageIds: [page] });
    const job = (await r.json()) as any;
    expect(job.status).toBe("failed");
    expect(JSON.stringify(job)).not.toContain("ntn_");
    expect(
      store.sqlite.prepare("SELECT status FROM account_connectors").all()[0]
        .status,
    ).toBe("needs_reconnect");
    expect(objects.size).toBe(0);
  },
);
it("exports only safe connection metadata and selected source provenance", async () => {
  const r = await req("", "POST", { pageIds: [page] });
  expect(r.status).toBe(201);
  const exported = await worker.fetch(
    new Request("https://vault.example/api/account/export", {
      headers: { Cookie: "dv_session=" + "1".repeat(64) },
    }),
    env,
  );
  expect(exported.status).toBe(200);
  const value = (await exported.json()) as any;
  expect(value.notionConnection.status).toBe("connected");
  expect(value.notionImports).toHaveLength(1);
  expect(JSON.stringify(value)).not.toMatch(
    /ntn_|credential|csrf|Selected private text/,
  );
});
