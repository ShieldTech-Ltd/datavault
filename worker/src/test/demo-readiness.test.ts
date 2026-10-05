import { beforeEach, describe, expect, it, vi } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { handlePrepare, handleExecute, handleAnswerRecovery } from "../routes/queries";
import { handleRegisterCollection, handleConfirmCollection } from "../routes/collections";
import { callModel } from "../lib/model";
import type { Env } from "../lib/types";
import { executionMessage } from "../../../shared/api";

const mocks = vi.hoisted(() => ({
  getCollectionRow: vi.fn(),
  getQueryRow: vi.fn(),
  claimQuery: vi.fn(),
  insertCollection: vi.fn(),
  confirmCollection: vi.fn(),
  markCollectionOrphaned: vi.fn(),
  getOnChainCollection: vi.fn(),
  getOnChainQuery: vi.fn(),
  verifyOpenReceipt: vi.fn(),
  retrievePassages: vi.fn(),
  storeCollection: vi.fn(),
  verifyRegistrationReceipt: vi.fn(),
}));
vi.mock("../lib/d1", () => ({
  getCollectionRow: mocks.getCollectionRow,
  getQueryRow: mocks.getQueryRow,
  claimQuery: mocks.claimQuery,
  insertCollection: mocks.insertCollection,
  confirmCollection: mocks.confirmCollection,
  markCollectionOrphaned: mocks.markCollectionOrphaned,
}));
vi.mock("../lib/policy", () => ({
  getOnChainCollection: mocks.getOnChainCollection,
  getOnChainQuery: mocks.getOnChainQuery,
}));
vi.mock("../lib/chain-receipts", () => ({ verifyOpenReceipt: mocks.verifyOpenReceipt,
  verifyRegistrationReceipt: mocks.verifyRegistrationReceipt }));
vi.mock("../lib/r2", () => ({ retrievePassages: mocks.retrievePassages,
  retrieveCitedPassages: vi.fn(() => []), storeCollection: mocks.storeCollection }));
vi.mock("../lib/ratelimit", () => ({ checkRateLimit: vi.fn(() => ({ allowed: true, retryAfter: 0 })), callerIdentity: vi.fn(() => "test") }));

const owner = privateKeyToAccount(`0x${"11".repeat(32)}`);
const buyer = privateKeyToAccount(`0x${"22".repeat(32)}`);
const requestId = `0x${"aa".repeat(32)}`;
const collectionId = `0x${"bb".repeat(32)}`;
const openTxHash = `0x${"cc".repeat(32)}`;
const contract = `0x${"dd".repeat(20)}`;
const env = {
  CONTRACT_ADDRESS: contract, SETTLEMENT_PRIVATE_KEY: `0x${"33".repeat(32)}`,
  MODEL_API_KEY: "test-model-key", CHAIN_ID: "10143", MONAD_RPC_URL: "http://localhost:8545",
} as Env;

beforeEach(() => {
  vi.clearAllMocks();
  const operator = privateKeyToAccount(env.SETTLEMENT_PRIVATE_KEY as `0x${string}`).address;
  mocks.getCollectionRow.mockResolvedValue({ status: "confirmed", active: 1, collection_name: "Guide" });
  mocks.getOnChainCollection.mockResolvedValue({ owner: owner.address, operator, price: 100n, active: true, policyVersion: 1 });
  mocks.getOnChainQuery.mockResolvedValue({ buyer: buyer.address, amount: 100n, state: 0,
    collectionId, policyVersion: 1, openedAt: BigInt(Math.floor(Date.now() / 1000)) });
  mocks.verifyOpenReceipt.mockResolvedValue(true);
  mocks.verifyRegistrationReceipt.mockResolvedValue(true);
});

describe("collection ownership", () => {
  it("rejects an unsigned staging upload before storing content", async () => {
    const form = new FormData();
    form.set("file", new File(["A useful private guide."], "guide.md", { type: "text/markdown" }));
    form.set("ownerAddress", owner.address);
    form.set("priceWei", "100");
    const response = await handleRegisterCollection(new Request("http://localhost/api/collections", {
      method: "POST", body: form,
    }), env);
    expect(response.status).toBe(401);
    expect(mocks.storeCollection).not.toHaveBeenCalled();
    expect(mocks.insertCollection).not.toHaveBeenCalled();
  });

  it("does not confirm a collection against an unrelated transaction", async () => {
    mocks.getCollectionRow.mockResolvedValue({ owner_address: owner.address.toLowerCase(), status: "staging" });
    mocks.verifyRegistrationReceipt.mockResolvedValue(false);
    const response = await handleConfirmCollection(new Request("http://localhost/api/collections/confirm", {
      method: "POST", body: JSON.stringify({ txHash: openTxHash, ownerAddress: owner.address }),
    }), env, collectionId);
    expect(response.status).toBe(409);
    expect(mocks.confirmCollection).not.toHaveBeenCalled();
  });
});

describe("paid query boundary", () => {
  it("does not offer a paid quote without all required runtime keys", async () => {
    const response = await handlePrepare(new Request("http://localhost/api/queries/prepare", {
      method: "POST", body: JSON.stringify({ collectionId, question: "What is in the guide?" }),
    }), { ...env, MODEL_API_KEY: "" });
    expect(response.status).toBe(503);
    expect(mocks.getCollectionRow).not.toHaveBeenCalled();
  });

  it("rejects a caller who cannot sign as the escrow buyer before retrieval", async () => {
    const response = await handleExecute(new Request("http://localhost/api/queries/execute", {
      method: "POST",
      headers: { "x-signature": `0x${"00".repeat(65)}`, "x-timestamp": String(Date.now()) },
      body: JSON.stringify({ requestId, collectionId, question: "What is in the guide?", openTxHash }),
    }), env);
    expect(response.status).toBe(403);
    expect(mocks.verifyOpenReceipt).not.toHaveBeenCalled();
    expect(mocks.retrievePassages).not.toHaveBeenCalled();
  });

  it("rejects an unconfirmed opening transaction even with the buyer signature", async () => {
    mocks.verifyOpenReceipt.mockResolvedValue(false);
    const question = "What is in the guide?";
    const digestBytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(question));
    const digest = Array.from(new Uint8Array(digestBytes)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
    const timestamp = Date.now();
    const signature = await buyer.signMessage({ message: executionMessage(
      10143, contract, requestId, collectionId, digest, openTxHash, timestamp,
    ) });
    const response = await handleExecute(new Request("http://localhost/api/queries/execute", {
      method: "POST", headers: { "x-signature": signature, "x-timestamp": String(timestamp) },
      body: JSON.stringify({ requestId, collectionId, question, openTxHash }),
    }), env);
    expect(response.status).toBe(409);
    expect(mocks.claimQuery).not.toHaveBeenCalled();
    expect(mocks.retrievePassages).not.toHaveBeenCalled();
  });

  it("withholds an answer recorded before settlement", async () => {
    mocks.getQueryRow.mockResolvedValue({ buyer_address: buyer.address, outcome: "answer_recorded",
      answer_text: "Private answer", passage_ids: "[]" });
    const timestamp = Date.now();
    const signature = await buyer.signMessage({ message: `datavault-answer:${requestId}:${timestamp}` });
    const response = await handleAnswerRecovery(new Request(`http://localhost/api/queries/${requestId}/answer`, {
      headers: { "x-signature": signature, "x-timestamp": String(timestamp) },
    }), env, requestId);
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("Private answer");
  });

  it("does not release a settled answer to a different wallet", async () => {
    mocks.getQueryRow.mockResolvedValue({ buyer_address: buyer.address, outcome: "settled",
      answer_text: "Private answer", passage_ids: "[]" });
    const timestamp = Date.now();
    const signature = await owner.signMessage({ message: `datavault-answer:${requestId}:${timestamp}` });
    const response = await handleAnswerRecovery(new Request(`http://localhost/api/queries/${requestId}/answer`, {
      headers: { "x-signature": signature, "x-timestamp": String(timestamp) },
    }), env, requestId);
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain("Private answer");
  });
});

describe("model citations", () => {
  it("accepts an exact versioned passage ID", async () => {
    const id = `0x${"ab".repeat(32)}:chunk-0`;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: `The guide says to keep invoices [Passage ${id}].` } }],
    }), { status: 200 })) as typeof fetch;
    try {
      const result = await callModel("What records should I keep?", ["Keep copies of all invoices."], [id], env);
      expect(result.citedPassageIds).toEqual([id]);
      expect(result.citedPassages[0].text).toBe("Keep copies of all invoices.");
    } finally { globalThis.fetch = originalFetch; }
  });
});
