import { beforeEach, afterEach, expect, it, vi } from "vitest";
import worker from "../index";
import { sqliteD1 } from "./sqlite-d1";
import type { Env } from "../lib/types";
import { digest } from "../lib/account-session";
vi.mock("../lib/chain-identity", () => ({
  rpcMatchesConfiguredChain: vi.fn(async () => true),
}));
vi.mock("../lib/policy", () => ({
  getOnChainCollection: vi.fn(async () => ({
    owner: "0x" + "11".repeat(20),
    price: 100n,
    policyVersion: 1,
    active: true,
  })),
}));
import { rpcMatchesConfiguredChain } from "../lib/chain-identity";
import { getOnChainCollection } from "../lib/policy";
let store: ReturnType<typeof sqliteD1>, env: Env;
const id = "0x" + "aa".repeat(32),
  address = "0x" + "11".repeat(20),
  token = "12".repeat(32),
  csrf = "34".repeat(32);
const call = (
  path: string,
  method = "GET",
  body?: unknown,
  auth = true,
  csrfValue = csrf
) =>
  worker.fetch(
    new Request("https://vault.example/api/" + path, {
      method,
      headers: {
        Origin: "https://vault.example",
        "Content-Type": "application/json",
        Cookie: auth ? `dv_session=${token}` : "",
        "x-csrf-token": csrfValue,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    env
  );
beforeEach(async () => {
  store = sqliteD1();
  env = {
    DB: store.db,
    CHAIN_ID: "10143",
    CONTRACT_ADDRESS: "0x" + "ab".repeat(20),
  } as Env;
  vi.mocked(rpcMatchesConfiguredChain).mockResolvedValue(true);
  vi.mocked(getOnChainCollection).mockResolvedValue({
    owner: address,
    price: 100n,
    policyVersion: 1,
    active: true,
  } as any);
  await env.DB.prepare(
    `INSERT INTO collections(collection_id,owner_address,collection_name,content_hash,created_at,status,chain_id,contract_address) VALUES(?,?,?,?,?,'confirmed',?,?)`
  )
    .bind(
      id,
      address,
      "Secret research",
      id,
      Date.now(),
      10143,
      env.CONTRACT_ADDRESS
    )
    .run();
  await env.DB.prepare(
    `INSERT INTO accounts(account_id,address,chain_id,contract_address,created_at,updated_at) VALUES('alice',?,?,?,?,?)`
  )
    .bind(address, 10143, env.CONTRACT_ADDRESS, Date.now(), Date.now())
    .run();
  await env.DB.prepare(
    `INSERT INTO account_sessions(token_hash,account_id,csrf_token,expires_at,created_at) VALUES(?,'alice',?,?,?)`
  )
    .bind(await digest(token), csrf, Date.now() + 100000, Date.now())
    .run();
});
afterEach(() => store.close());
it("defaults old records public and hides unlisted search and public analytics while keeping ID detail", async () => {
  expect(await (await call("collections/" + id)).json()).toMatchObject({
    description: "",
    category: "General",
    visibility: "public",
  });
  expect(
    (
      await call(`collections/${id}/metadata`, "PATCH", {
        description: "Study",
        category: "Research",
        visibility: "unlisted",
      })
    ).status
  ).toBe(200);
  expect(await (await call("collections?search=Secret")).json()).toMatchObject({
    collections: [],
  });
  expect(await (await call("marketplace/analytics")).json()).toMatchObject({
    confirmedCollections: 0,
    paidQueries: 0,
    scope: "public",
  });
  expect(await (await call("collections/" + id)).json()).toMatchObject({
    description: "Study",
    visibility: "unlisted",
  });
});
it("denies missing session, CSRF, unknown records, wrong owner and unavailable chain", async () => {
  const path = `collections/${id}/metadata`,
    body = { description: "", category: "General", visibility: "public" };
  expect((await call(path, "PATCH", body, false)).status).toBe(401);
  expect((await call(path, "PATCH", body, true, "")).status).toBe(403);
  expect(
    (
      await call(
        `collections/${"0x" + "bb".repeat(32)}/metadata`,
        "PATCH",
        body
      )
    ).status
  ).toBe(404);
  vi.mocked(getOnChainCollection).mockResolvedValue({
    owner: "0x" + "22".repeat(20),
  } as any);
  expect((await call(path, "PATCH", body)).status).toBe(403);
  vi.mocked(rpcMatchesConfiguredChain).mockResolvedValue(false);
  expect((await call(path, "PATCH", body)).status).toBe(503);
});
it("rejects strict metadata violations", async () => {
  for (const body of [
    { description: "x".repeat(2001) },
    { category: "unknown" },
    { visibility: "private" },
    { source: "raw" },
    {},
    { description: 5 },
  ])
    expect(
      (await call(`collections/${id}/metadata`, "PATCH", body)).status
    ).toBe(400);
});
import { privateKeyToAccount } from "viem/accounts";
import { ownerSummaryMessage } from "../../../shared/api";
it("retains unlisted settlements and collections for real signed owner reads only", async () => {
  const wallet = privateKeyToAccount(("0x" + "45".repeat(32)) as `0x${string}`),
    owner = wallet.address.toLowerCase();
  await env.DB.prepare(
    "UPDATE collections SET owner_address = ? WHERE collection_id = ?"
  )
    .bind(owner, id)
    .run();
  vi.mocked(getOnChainCollection).mockResolvedValue({
    owner,
    price: 100n,
    policyVersion: 1,
    active: true,
  } as any);
  await env.DB.prepare(
    `INSERT INTO collection_metadata VALUES(?,?,?,'Hidden','Research','unlisted',?)`
  )
    .bind(10143, env.CONTRACT_ADDRESS, id, Date.now())
    .run();
  await env.DB.prepare(
    `INSERT INTO queries(request_id,collection_id,buyer_address,policy_version,outcome,created_at,settled_at,chain_id,contract_address,amount_wei) VALUES(?,?,?,1,'settled',?,?,?,?,?)`
  )
    .bind(
      "0x" + "ee".repeat(32),
      id,
      address,
      Date.now(),
      Date.now(),
      10143,
      env.CONTRACT_ADDRESS,
      "100"
    )
    .run();
  const publicData = await (await call("marketplace/analytics")).json();
  expect(publicData).toMatchObject({
    paidQueries: 0,
    recentActivity: [],
    topCollections: [],
  });
  expect(JSON.stringify(publicData)).not.toContain(id);
  expect(JSON.stringify(publicData)).not.toContain("Secret");
  const timestamp = Date.now(),
    signature = await wallet.signMessage({
      message: ownerSummaryMessage(
        10143,
        env.CONTRACT_ADDRESS,
        owner,
        timestamp
      ),
    });
  const signed = (path: string) =>
    worker.fetch(
      new Request(`https://vault.example/api/owner/${path}?address=${owner}`, {
        headers: { "x-signature": signature, "x-timestamp": String(timestamp) },
      }),
      env
    );
  expect(await (await signed("analytics")).json()).toMatchObject({
    confirmedCollections: 1,
    paidQueries: 1,
  });
  const collections = (await (await signed("collections")).json()) as any;
  expect(collections.collections).toHaveLength(1);
  expect(collections.collections[0].visibility).toBe("unlisted");
});
import { readFileSync } from "node:fs";
it("applies metadata migration over populated legacy collection records", async () => {
  store.sqlite.prepare("DROP TABLE collection_metadata").all();
  store.sqlite
    .prepare(readFileSync("migrations/0011_collection_metadata.sql", "utf8"))
    .all();
  expect(await (await call("collections/" + id)).json()).toMatchObject({
    collectionId: id,
    description: "",
    category: "General",
    visibility: "public",
  });
});
it("preserves omitted fields during concurrent disjoint partial patches", async () => {
  expect(
    (
      await call(`collections/${id}/metadata`, "PATCH", {
        description: "Original",
        category: "General",
        visibility: "public",
      })
    ).status
  ).toBe(200);
  const realDb = env.DB;
  let readers = 0;
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  env.DB = {
    prepare(sql: string) {
      const statement = realDb.prepare(sql);
      if (!sql.startsWith("SELECT description, category, visibility"))
        return statement;
      const original = statement.first.bind(statement);
      statement.first = (async () => {
        const row = await original();
        readers++;
        if (readers === 2) release();
        if (readers <= 2) await barrier;
        return row;
      }) as typeof statement.first;
      return statement;
    },
  } as D1Database;
  const responses = await Promise.all([
    call(`collections/${id}/metadata`, "PATCH", { visibility: "unlisted" }),
    call(`collections/${id}/metadata`, "PATCH", {
      description: "Updated independently",
    }),
  ]);
  expect(responses.map((response) => response.status)).toEqual([200, 200]);
  env.DB = realDb;
  expect(await (await call("collections/" + id)).json()).toMatchObject({
    description: "Updated independently",
    category: "General",
    visibility: "unlisted",
  });
});
it("enforces the account mutation quota through the worker before owner RPC", async () => {
  for (let i = 0; i < 20; i++)
    expect(
      (
        await call(`collections/${id}/metadata`, "PATCH", {
          description: "Update " + i,
        })
      ).status
    ).toBe(200);
  const calls = vi.mocked(getOnChainCollection).mock.calls.length;
  const rejected = await call(`collections/${id}/metadata`, "PATCH", {
    visibility: "unlisted",
  });
  expect(rejected.status).toBe(429);
  expect(rejected.headers.get("Retry-After")).toBe("60");
  expect(vi.mocked(getOnChainCollection).mock.calls.length).toBe(calls);
  expect(await (await call("collections/" + id)).json()).toMatchObject({
    description: "Update 19",
    visibility: "public",
  });
}, 30000);
