/**
 * Route-level auth and access control tests.
 * These verify denial before protected work, not full end-to-end execution.
 * Live chain and model calls are not made here.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { MockD1Database, makeEnv } from "./helpers";
import { handleReceipt } from "../routes/queries";
import { handleConfirmCollection } from "../routes/collections";

vi.mock("../lib/chain-identity", () => ({ rpcMatchesConfiguredChain: vi.fn(async () => true) }));

const COL_ID  = "0x" + "bb".repeat(32);
const REQ_ID  = "0x" + "aa".repeat(32);
const BUYER   = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const TX_HASH = "0x" + "dd".repeat(32);

// ── Receipt endpoint ───────────────────────────────────────────────

describe("GET /api/queries/:id/receipt", () => {
  it("returns 404 for unknown requestId", async () => {
    const env = makeEnv();
    const res = await handleReceipt(env as never, REQ_ID);
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid requestId format", async () => {
    const env = makeEnv();
    const res = await handleReceipt(env as never, "not-a-bytes32");
    expect(res.status).toBe(400);
  });

  it("returns receipt JSON for a known pending request", async () => {
    const db = new MockD1Database();
    db.seed("queries", [{
      request_id: REQ_ID,
      collection_id: COL_ID,
      buyer_address: BUYER,
      policy_version: 1,
      question_digest: "0x" + "ff".repeat(32),
      open_tx_hash: TX_HASH,
      settle_tx_hash: null,
      refund_tx_hash: null,
      chain_id: 10143,
      contract_address: "0x" + "11".repeat(20),
      content_hash: "0x" + "22".repeat(32),
      passage_ids: "[]",
      outcome: "pending",
      claimed_at: Date.now(),
      lease_expires_at: Date.now() + 60000,
      created_at: Date.now(),
      settled_at: null,
      answer_text: null,
      response_digest: null,
    }]);
    const env = makeEnv({ DB: db });
    const res = await handleReceipt(env as never, REQ_ID);
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.requestId).toBe(REQ_ID);
    expect(body.outcome).toBe("pending");
    expect(body.buyerAddress).toBe(BUYER);
    expect(body.chainId).toBe(10143);
    expect(body.openTxHash).toBe(TX_HASH);
  });

  it("does not expose answer text in receipt (answer only via authenticated endpoint)", async () => {
    const db = new MockD1Database();
    db.seed("queries", [{
      request_id: REQ_ID,
      collection_id: COL_ID,
      buyer_address: BUYER,
      policy_version: 1,
      question_digest: "0x" + "ff".repeat(32),
      open_tx_hash: TX_HASH,
      settle_tx_hash: TX_HASH,
      refund_tx_hash: null,
      chain_id: 10143,
      contract_address: "0x" + "11".repeat(20),
      content_hash: "0x" + "22".repeat(32),
      passage_ids: '["p:0"]',
      outcome: "settled",
      claimed_at: Date.now() - 5000,
      lease_expires_at: Date.now() + 55000,
      created_at: Date.now() - 5000,
      settled_at: Date.now(),
      answer_text: "SECRET ANSWER",
      response_digest: "sha256:abc",
    }]);
    const env = makeEnv({ DB: db });
    const res = await handleReceipt(env as never, REQ_ID);
    const body = await res.json() as Record<string, unknown>;
    expect(body.answer).toBeUndefined();
    expect(body.answerText).toBeUndefined();
    // Receipt does expose citedPassageIds and responseDigest (not the answer itself)
    expect(body.citedPassageIds).toBeDefined();
    expect(body.responseDigest).toBe("sha256:abc");
  });
});

// ── Confirm collection endpoint ────────────────────────────────────

describe("POST /api/collections/:id/confirm", () => {
  let db: MockD1Database;
  let env: ReturnType<typeof makeEnv>;

  beforeEach(() => {
    db = new MockD1Database();
    env = makeEnv({ DB: db, CONTRACT_ADDRESS: "0x" + "11".repeat(20) });
    db.seed("collections", [{
      collection_id: COL_ID,
      owner_address: BUYER.toLowerCase(),
      collection_name: "test-collection",
      content_hash: "0x" + "ff".repeat(32),
      policy_version: 1,
      active: 1,
      status: "staging",
      staged_at: Date.now(),
      confirmed_tx: null,
      created_at: Date.now() - 1000,
    }]);
  });

  it("returns 400 for invalid collectionId", async () => {
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ txHash: TX_HASH, ownerAddress: BUYER }),
    });
    const res = await handleConfirmCollection(req, env as never, "bad-id");
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid txHash format", async () => {
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ txHash: "not-a-hash", ownerAddress: BUYER }),
    });
    const res = await handleConfirmCollection(req, env as never, COL_ID);
    expect(res.status).toBe(400);
  });

  it("returns 403 when ownerAddress does not match stored owner", async () => {
    const wrongOwner = "0x" + "99".repeat(20);
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ txHash: TX_HASH, ownerAddress: wrongOwner }),
    });
    const res = await handleConfirmCollection(req, env as never, COL_ID);
    expect(res.status).toBe(403);
  });

  it("returns 404 for an unregistered collection", async () => {
    const unknownId = "0x" + "ee".repeat(32);
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ txHash: TX_HASH, ownerAddress: BUYER }),
    });
    const res = await handleConfirmCollection(req, env as never, unknownId);
    expect(res.status).toBe(404);
  });
});
