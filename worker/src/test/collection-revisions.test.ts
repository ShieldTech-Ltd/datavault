import { beforeEach, afterEach, expect, it as test, vi } from "vitest";
import worker from "../index";
import { sqliteD1 } from "./sqlite-d1";
import type { Env } from "../lib/types";
import { digest } from "../lib/account-session";
vi.mock("../lib/chain-identity", () => ({
  rpcMatchesConfiguredChain: vi.fn(async () => true),
}));
vi.mock("../lib/chain-receipts", () => ({
  verifyRegistrationReceipt: vi.fn(async () => false),
  verifiedSettlementHash: vi.fn(async () => "0x" + "ee".repeat(32)),
}));
vi.mock("../lib/policy", () => ({
  getOnChainQuery: vi.fn(async () => ({ state: 1 })),
  getOnChainCollection: vi.fn(async () => ({
    owner: "0x" + "11".repeat(20),
    price: 100n,
    policyVersion: 1,
    active: true,
  })),
}));
import { rpcMatchesConfiguredChain } from "../lib/chain-identity";
import { getOnChainCollection } from "../lib/policy";
const it = (name: string, fn: () => Promise<void>) => test(name, fn, 30000);
let store: ReturnType<typeof sqliteD1>, env: Env;
const id = "0x" + "aa".repeat(32),
  next = "0x" + "bb".repeat(32),
  other = "0x" + "cc".repeat(32);
const address = "0x" + "11".repeat(20),
  token = "12".repeat(32),
  csrf = "34".repeat(32);
const call = (
  parent = id,
  method = "GET",
  body?: unknown,
  auth = true,
  csrfValue = csrf
) =>
  worker.fetch(
    new Request(`https://vault.example/api/collections/${parent}/revisions`, {
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
  for (const [collection, name] of [
    [id, "Original"],
    [next, "New secret"],
    [other, "Third"],
  ])
    await env.DB.prepare(
      `INSERT INTO collections(collection_id,owner_address,collection_name,content_hash,created_at,status,chain_id,contract_address) VALUES(?,?,?,?,?,'confirmed',?,?)`
    )
      .bind(
        collection,
        address,
        name,
        collection,
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
it("links immutable confirmed registrations and retries identically without advancing twice", async () => {
  expect((await call(id, "POST", { collectionId: next })).status).toBe(200);
  expect((await call(id, "POST", { collectionId: next })).status).toBe(200);
  const history = (await (await call()).json()) as any;
  expect(history).toMatchObject({
    originalCollectionId: id,
    currentCollectionId: next,
  });
  expect(history.versions.map((v: any) => [v.collectionId, v.ordinal])).toEqual(
    [
      [id, 1],
      [next, 2],
    ]
  );
  expect(
    store.sqlite
      .prepare("SELECT content_hash FROM collections WHERE collection_id = ?")
      .all(id)[0].content_hash
  ).toBe(id);
  expect(
    (
      await worker.fetch(
        new Request(`https://vault.example/api/collections/${id}/upload`, {
          method: "POST",
          body: "replacement",
        }),
        env
      )
    ).status
  ).toBe(410);
});
it("two simultaneous current-parent links have one winner and no orphan member", async () => {
  const responses = await Promise.all([
    call(id, "POST", { collectionId: next }),
    call(id, "POST", { collectionId: other }),
  ]);
  expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
  expect(
    store.sqlite.prepare("SELECT * FROM collection_revision_members").all()
  ).toHaveLength(2);
  const history = (await (await call()).json()) as any;
  expect(history.versions).toHaveLength(2);
  expect(
    (
      await call(id, "POST", {
        collectionId: other === history.currentCollectionId ? next : other,
      })
    ).status
  ).toBe(409);
});
it("rejects malformed, unauthenticated, staged, unrelated and cross-deployment candidates", async () => {
  expect((await call(id, "POST", { collectionId: next }, false)).status).toBe(
    401
  );
  expect(
    (await call(id, "POST", { collectionId: next }, true, "")).status
  ).toBe(403);
  for (const body of [
    { collectionId: id },
    { collectionId: next, extra: true },
    { collectionId: "bad" },
    null,
    [],
  ])
    expect((await call(id, "POST", body)).status).toBe(400);
  await env.DB.prepare(
    "UPDATE collections SET status='staging' WHERE collection_id=?"
  )
    .bind(next)
    .run();
  expect((await call(id, "POST", { collectionId: next })).status).toBe(404);
  await env.DB.prepare(
    "UPDATE collections SET status='confirmed', chain_id=1 WHERE collection_id=?"
  )
    .bind(next)
    .run();
  expect((await call(id, "POST", { collectionId: next })).status).toBe(404);
  await env.DB.prepare(
    "UPDATE collections SET chain_id=10143, owner_address=? WHERE collection_id=?"
  )
    .bind("0x" + "22".repeat(20), next)
    .run();
  expect((await call(id, "POST", { collectionId: next })).status).toBe(403);
  expect(
    store.sqlite.prepare("SELECT * FROM collection_revision_families").all()
  ).toHaveLength(0);
});
it("requires both live owners and verified chain before any family write", async () => {
  vi.mocked(getOnChainCollection).mockImplementation(
    async (collection: any) =>
      ({ owner: collection === next ? "0x" + "22".repeat(20) : address } as any)
  );
  expect((await call(id, "POST", { collectionId: next })).status).toBe(403);
  vi.mocked(rpcMatchesConfiguredChain).mockResolvedValue(false);
  expect((await call(id, "POST", { collectionId: next })).status).toBe(503);
  expect(
    store.sqlite.prepare("SELECT * FROM collection_revision_families").all()
  ).toHaveLength(0);
});
it("never discloses an unlisted target through public family history or detail", async () => {
  expect((await call(id, "POST", { collectionId: next })).status).toBe(200);
  await env.DB.prepare(
    `INSERT INTO collection_metadata VALUES(?,?,?,'','General','unlisted',?)`
  )
    .bind(10143, env.CONTRACT_ADDRESS, next, Date.now())
    .run();
  const publicHistory = (await (
    await call(id, "GET", undefined, false)
  ).json()) as any;
  expect(JSON.stringify(publicHistory)).not.toContain(next);
  expect(JSON.stringify(publicHistory)).not.toContain("New secret");
  expect(publicHistory).toMatchObject({ newerUnlistedRevision: true });
  expect(
    (
      (await (await call(next, "GET", undefined, false)).json()) as any
    ).versions.map((v: any) => v.collectionId)
  ).toEqual([id, next]);
  expect(((await (await call()).json()) as any).versions).toHaveLength(2);
  const detail = await worker.fetch(
    new Request(`https://vault.example/api/collections/${id}`),
    env
  );
  const detailBody = await detail.json();
  expect(detailBody).toMatchObject({ newerUnlistedRevision: true });
  expect(JSON.stringify(detailBody)).not.toContain(next);
});
it("rejects reuse in another family and supports bounded stable ordinal pages", async () => {
  await call(id, "POST", { collectionId: next });
  await call(next, "POST", { collectionId: other });
  expect((await call(id, "POST", { collectionId: other })).status).toBe(409);
  const page = await worker.fetch(
    new Request(
      `https://vault.example/api/collections/${id}/revisions?limit=1&cursor=1`
    ),
    env
  );
  expect(await page.json()).toMatchObject({
    versions: [{ collectionId: next, ordinal: 2 }],
    nextCursor: 2,
  });
  expect(
    (
      await worker.fetch(
        new Request(
          `https://vault.example/api/collections/${id}/revisions?limit=51`
        ),
        env
      )
    ).status
  ).toBe(400);
});

import { privateKeyToAccount } from "viem/accounts";
import { keccak256, toBytes } from "viem";
import { createHash } from "node:crypto";
import { queryRecoveryMessage } from "../../../shared/api";
import { storeCollection } from "../lib/r2";
it("keeps actual old R2 bytes and settled answer citations recoverable after a new revision", async () => {
  const objects = new Map<string, string>();
  env.COLLECTION_STORE = {
    put: async (key: string, value: string) => {
      objects.set(key, value);
    },
    get: async (key: string) =>
      objects.has(key) ? { text: async () => objects.get(key)! } : null,
  } as any;
  const oldContent = "Original immutable evidence.",
    newContent = "New independent evidence.",
    oldHash = keccak256(toBytes(oldContent)),
    newHash = keccak256(toBytes(newContent));
  await env.DB.prepare(
    "UPDATE collections SET content_hash=? WHERE collection_id=?"
  )
    .bind(oldHash, id)
    .run();
  await env.DB.prepare(
    "UPDATE collections SET content_hash=? WHERE collection_id=?"
  )
    .bind(newHash, next)
    .run();
  await storeCollection(id, oldContent, oldHash, env);
  await storeCollection(next, newContent, newHash, env);
  const before = [...objects.entries()];
  const buyer = privateKeyToAccount(("0x" + "45".repeat(32)) as `0x${string}`),
    requestId = "0x" + "dd".repeat(32),
    answer = "Original immutable evidence.",
    answerDigest =
      "sha256:" + createHash("sha256").update(answer).digest("hex");
  await env.DB.prepare(
    `INSERT INTO queries(request_id,collection_id,buyer_address,policy_version,outcome,created_at,settled_at,chain_id,contract_address,content_hash,passage_ids,answer_text,response_digest,settle_tx_hash) VALUES(?,?,?,1,'settled',?,?,?,?,?,?,?,?,?)`
  )
    .bind(
      requestId,
      id,
      buyer.address.toLowerCase(),
      Date.now(),
      Date.now(),
      10143,
      env.CONTRACT_ADDRESS,
      oldHash,
      JSON.stringify([oldHash + ":chunk-0"]),
      answer,
      answerDigest,
      "0x" + "ee".repeat(32)
    )
    .run();
  expect((await call(id, "POST", { collectionId: next })).status).toBe(200);
  expect([...objects.entries()]).toEqual(before);
  expect(
    store.sqlite
      .prepare("SELECT content_hash FROM collections WHERE collection_id=?")
      .all(id)[0].content_hash
  ).toBe(oldHash);
  const timestamp = Date.now(),
    signature = await buyer.signMessage({
      message: queryRecoveryMessage(
        "answer",
        10143,
        env.CONTRACT_ADDRESS,
        requestId,
        timestamp
      ),
    });
  const response = await worker.fetch(
    new Request(`https://vault.example/api/queries/${requestId}/answer`, {
      headers: { "x-signature": signature, "x-timestamp": String(timestamp) },
    }),
    env
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    answer,
    citedPassages: [{ text: oldContent, version: oldHash }],
    recovered: true,
  });
});
it("failed chain confirmation leaves staged candidate outside any family", async () => {
  await env.DB.prepare(
    "UPDATE collections SET status='staging', staged_at=? WHERE collection_id=?"
  )
    .bind(Date.now(), next)
    .run();
  const confirmation = await worker.fetch(
    new Request(`https://vault.example/api/collections/${next}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ownerAddress: address,
        txHash: "0x" + "ee".repeat(32),
      }),
    }),
    env
  );
  expect(confirmation.status).toBe(409);
  expect((await call(id, "POST", { collectionId: next })).status).toBe(404);
  expect(
    store.sqlite.prepare("SELECT * FROM collection_revision_families").all()
  ).toHaveLength(0);
});
it("guards orphan initialization and membership invariants at the SQLite boundary", async () => {
  const insertion = () =>
    env.DB.batch([
      env.DB.prepare(
        `INSERT INTO collection_revision_members VALUES(?,?,?,?,?,?,?,?)`
      ).bind(10143, env.CONTRACT_ADDRESS, next, id, id, address, 3, Date.now()),
    ]);
  await expect(insertion()).rejects.toThrow();
  expect(
    store.sqlite.prepare("SELECT * FROM collection_revision_families").all()
  ).toHaveLength(0);
  expect(
    store.sqlite.prepare("SELECT * FROM collection_revision_members").all()
  ).toHaveLength(0);
  await call(id, "POST", { collectionId: next });
  await expect(
    env.DB.batch([
      env.DB.prepare(
        `INSERT INTO collection_revision_members VALUES(?,?,?,?,?,?,?,?)`
      ).bind(
        10143,
        env.CONTRACT_ADDRESS,
        next,
        other,
        other,
        address,
        2,
        Date.now()
      ),
    ])
  ).rejects.toThrow();
  expect(
    store.sqlite.prepare("SELECT * FROM collection_revision_families").all()
  ).toHaveLength(1);
  expect(
    store.sqlite.prepare("SELECT * FROM collection_revision_members").all()
  ).toHaveLength(2);
});

it("public current links are present while unlisted originals remain hidden from public descendants", async () => {
  await call(id, "POST", { collectionId: next });
  const detail = await worker.fetch(
    new Request(`https://vault.example/api/collections/${id}`),
    env
  );
  expect(await detail.json()).toMatchObject({ currentCollectionId: next });
  await env.DB.prepare(
    `INSERT INTO collection_metadata VALUES(?,?,?,'','General','unlisted',?)`
  )
    .bind(10143, env.CONTRACT_ADDRESS, id, Date.now())
    .run();
  const publicHistory = await (
    await call(next, "GET", undefined, false)
  ).json();
  expect(JSON.stringify(publicHistory)).not.toContain(id);
  expect(publicHistory).toMatchObject({
    currentCollectionId: next,
    versions: [{ collectionId: next }],
  });
  expect(await (await call(id, "GET", undefined, false)).json()).toMatchObject({
    originalCollectionId: id,
    versions: [{ collectionId: id }, { collectionId: next }],
  });
});
it("rejects an untrusted origin and a session for another owner before linking", async () => {
  const req = new Request(
    `https://vault.example/api/collections/${id}/revisions`,
    {
      method: "POST",
      headers: {
        Cookie: `dv_session=${token}`,
        "x-csrf-token": csrf,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ collectionId: next }),
    }
  );
  expect((await worker.fetch(req, env)).status).toBe(403);
  await env.DB.prepare("UPDATE accounts SET address=? WHERE account_id=?")
    .bind("0x" + "22".repeat(20), "alice")
    .run();
  expect((await call(id, "POST", { collectionId: next })).status).toBe(403);
  expect(
    store.sqlite.prepare("SELECT * FROM collection_revision_families").all()
  ).toHaveLength(0);
});
