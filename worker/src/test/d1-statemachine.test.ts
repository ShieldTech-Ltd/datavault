import { describe, it, expect, beforeEach } from "vitest";
import { MockD1Database, makeEnv } from "./helpers";
import {
  claimQuery,
  reclaimExpiredQuery,
  updateQueryRunning,
  updateQueryAnswerRecorded,
  updateQuerySettlementPending,
  updateQuerySettled,
  getQueryRow,
  requestIdExists,
  insertCollection,
  confirmCollection,
  getCollectionRow,
} from "../lib/d1";

const REQ_ID = "0x" + "aa".repeat(32);
const COL_ID = "0x" + "bb".repeat(32);
const BUYER = "0x" + "cc".repeat(20);
const TX_HASH = "0x" + "dd".repeat(32);
const TX_HASH2 = "0x" + "ee".repeat(32);

function baseRow() {
  return {
    request_id: REQ_ID,
    collection_id: COL_ID,
    buyer_address: BUYER,
    policy_version: 1,
    question_digest: "0x" + "ff".repeat(32),
    open_tx_hash: TX_HASH,
    chain_id: 10143,
    contract_address: "0x" + "11".repeat(20),
    content_hash: "0x" + "22".repeat(32),
    amount_wei: "1000000000000000",
  };
}

describe("claimQuery", () => {
  let db: MockD1Database;
  let env: ReturnType<typeof makeEnv>;

  beforeEach(() => {
    db = new MockD1Database();
    env = makeEnv({ DB: db }) as ReturnType<typeof makeEnv>;
  });

  it("returns true and inserts on first claim", async () => {
    const claimed = await claimQuery(baseRow(), env as never);
    expect(claimed).toMatch(/^[0-9a-f-]{36}$/);
    const row = await getQueryRow(REQ_ID, env as never);
    expect(row?.outcome).toBe("pending");
    expect(row?.buyer_address).toBe(BUYER);
  });

  it("returns false when requestId already claimed (idempotent)", async () => {
    await claimQuery(baseRow(), env as never);
    const second = await claimQuery(baseRow(), env as never);
    expect(second).toBeNull();
  });

  it("stores exact escrow amount with chain and opening transaction", async () => {
    await claimQuery(baseRow(), env as never);
    const row = await getQueryRow(REQ_ID, env as never);
    expect(row?.open_tx_hash).toBe(TX_HASH);
    expect(row?.chain_id).toBe(10143);
    expect(row?.amount_wei).toBe("1000000000000000");
  });
});

describe("query state transitions", () => {
  let db: MockD1Database;
  let env: ReturnType<typeof makeEnv>;
  let token: string;

  beforeEach(async () => {
    db = new MockD1Database();
    env = makeEnv({ DB: db }) as ReturnType<typeof makeEnv>;
    token = (await claimQuery(baseRow(), env as never)) as string;
  });

  it("pending -> running", async () => {
    expect(await updateQueryRunning(REQ_ID, token, env as never)).toBe(true);
    const row = await getQueryRow(REQ_ID, env as never);
    expect(row?.outcome).toBe("running");
  });

  it("running -> answer_recorded stores answer and passage IDs", async () => {
    await updateQueryRunning(REQ_ID, token, env as never);
    await updateQueryAnswerRecorded(
      REQ_ID,
      "The answer.",
      ["p:0", "p:1"],
      "sha256:abc",
      token,
      env as never
    );
    const row = await getQueryRow(REQ_ID, env as never);
    expect(row?.outcome).toBe("answer_recorded");
    expect(row?.answer_text).toBe("The answer.");
    expect(row?.passage_ids).toBe(JSON.stringify(["p:0", "p:1"]));
    expect(row?.response_digest).toBe("sha256:abc");
  });

  it("answer_recorded -> settlement_pending stores settle tx hash", async () => {
    await updateQueryRunning(REQ_ID, token, env as never);
    await updateQueryAnswerRecorded(
      REQ_ID,
      "ans",
      [],
      "sha256:x",
      token,
      env as never
    );
    await updateQuerySettlementPending(REQ_ID, TX_HASH2, env as never);
    const row = await getQueryRow(REQ_ID, env as never);
    expect(row?.outcome).toBe("settlement_pending");
    expect(row?.settle_tx_hash).toBe(TX_HASH2);
  });

  it("settlement_pending -> settled records settled_at", async () => {
    await updateQueryRunning(REQ_ID, token, env as never);
    await updateQueryAnswerRecorded(
      REQ_ID,
      "ans",
      ["p:0"],
      "sha256:y",
      token,
      env as never
    );
    await updateQuerySettled(
      REQ_ID,
      TX_HASH2,
      ["p:0"],
      "sha256:y",
      env as never
    );
    const row = await getQueryRow(REQ_ID, env as never);
    expect(row?.outcome).toBe("settled");
    expect(row?.settle_tx_hash).toBe(TX_HASH2);
    expect(row?.settled_at).toBeGreaterThan(0);
  });

  it("lets one Worker resume an expired claim and fences the old Worker", async () => {
    await updateQueryRunning(REQ_ID, token, env as never);
    db.getTable("queries")[0].lease_expires_at = Date.now() - 1;
    const resumed = await reclaimExpiredQuery(baseRow() as never, env as never);
    expect(resumed).toBeTruthy();
    expect(resumed).not.toBe(token);
    expect(await updateQueryRunning(REQ_ID, token, env as never)).toBe(false);
    expect(await updateQueryRunning(REQ_ID, resumed as string, env as never)).toBe(true);
    expect(await updateQueryAnswerRecorded(REQ_ID, "old answer", [], "sha256:old", token, env as never)).toBe(false);
    expect(await updateQueryAnswerRecorded(REQ_ID, "new answer", [], "sha256:new", resumed as string, env as never)).toBe(true);
    expect((await getQueryRow(REQ_ID, env as never))?.answer_text).toBe("new answer");
    expect(await reclaimExpiredQuery(baseRow() as never, env as never)).toBeNull();
  });
});

describe("requestIdExists", () => {
  it("returns false before insert", async () => {
    const env = makeEnv();
    expect(await requestIdExists(REQ_ID, env as never)).toBe(false);
  });

  it("returns true after claim", async () => {
    const db = new MockD1Database();
    const env = makeEnv({ DB: db }) as ReturnType<typeof makeEnv>;
    await claimQuery(baseRow(), env as never);
    expect(await requestIdExists(REQ_ID, env as never)).toBe(true);
  });
});

describe("collection lifecycle", () => {
  it("inserts as staging and confirms to confirmed", async () => {
    const db = new MockD1Database();
    const env = makeEnv({ DB: db }) as ReturnType<typeof makeEnv>;
    await insertCollection(
      {
        collection_id: COL_ID,
        owner_address: BUYER,
        collection_name: "test",
        content_hash: "0x" + "ff".repeat(32),
      },
      env as never
    );
    const row = await getCollectionRow(COL_ID, env as never);
    expect(row?.status).toBe("staging");
    expect(row?.chain_id).toBe(10143);
    expect(row?.contract_address).toBe("");
    expect(
      await getCollectionRow(COL_ID, {
        ...env,
        CONTRACT_ADDRESS: "0x" + "11".repeat(20),
      } as never)
    ).toBeNull();

    await confirmCollection(COL_ID, TX_HASH, env as never);
    const confirmed = await getCollectionRow(COL_ID, env as never);
    expect(confirmed?.status).toBe("confirmed");
    expect(confirmed?.confirmed_tx).toBe(TX_HASH);
  });
});
