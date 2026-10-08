import { beforeEach, describe, expect, it, vi } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { keccak256, toBytes } from "viem";
import { createHash } from "node:crypto";
import { executionMessage } from "../../../shared/api";
import { handleExecute, handleReconcile, handleAnswerRecovery } from "../routes/queries";
import type { Env } from "../lib/types";

const mocks = vi.hoisted(() => ({
  getOnChainCollection: vi.fn(), getOnChainQuery: vi.fn(), verifyOpenReceipt: vi.fn(),
  claimQuery: vi.fn(), getQueryRow: vi.fn(), getCollectionRow: vi.fn(), updateQueryRunning: vi.fn(),
  updateQueryOutcome: vi.fn(), updateQueryContentHash: vi.fn(),
  updateQueryAnswerRecorded: vi.fn(), updateQuerySettlementPending: vi.fn(),
  updateQuerySettled: vi.fn(), retrievePassages: vi.fn(), callModel: vi.fn(),
  settle: vi.fn(), checkRateLimit: vi.fn(), rpcMatchesConfiguredChain: vi.fn(),
  verifiedSettlementHash: vi.fn(),
}));

vi.mock("../lib/policy", () => ({
  getOnChainCollection: mocks.getOnChainCollection, getOnChainQuery: mocks.getOnChainQuery,
}));
vi.mock("../lib/chain-receipts", () => ({ verifyOpenReceipt: mocks.verifyOpenReceipt,
  verifiedSettlementHash: mocks.verifiedSettlementHash }));
vi.mock("../lib/d1", () => ({
  claimQuery: mocks.claimQuery, getQueryRow: mocks.getQueryRow, getCollectionRow: mocks.getCollectionRow,
  updateQueryRunning: mocks.updateQueryRunning, updateQueryOutcome: mocks.updateQueryOutcome,
  updateQueryContentHash: mocks.updateQueryContentHash,
  updateQueryAnswerRecorded: mocks.updateQueryAnswerRecorded,
  updateQuerySettlementPending: mocks.updateQuerySettlementPending,
  updateQuerySettled: mocks.updateQuerySettled,
}));
vi.mock("../lib/r2", () => ({ retrievePassages: mocks.retrievePassages }));
vi.mock("../lib/model", () => ({ callModel: mocks.callModel }));
vi.mock("../lib/settlement", () => ({ settleOnChainWithConfirmation: mocks.settle }));
vi.mock("../lib/ratelimit", () => ({
  checkRateLimit: mocks.checkRateLimit, callerIdentity: vi.fn(() => "test"),
}));
vi.mock("../lib/chain-identity", () => ({ rpcMatchesConfiguredChain: mocks.rpcMatchesConfiguredChain }));

const buyer = privateKeyToAccount(`0x${"22".repeat(32)}`);
const requestId = `0x${"aa".repeat(32)}`;
const collectionId = `0x${"bb".repeat(32)}`;
const openTxHash = `0x${"cc".repeat(32)}`;
const settleTxHash = `0x${"ee".repeat(32)}`;
const answerDigest = `sha256:${createHash("sha256").update("A cited fact.").digest("hex")}`;
const contract = `0x${"dd".repeat(20)}`;
const env = {
  CONTRACT_ADDRESS: contract, SETTLEMENT_PRIVATE_KEY: keccak256(toBytes("datavault-test-operator")),
  MODEL_API_KEY: "test-model-key", CHAIN_ID: "10143", MONAD_RPC_URL: "http://localhost:8545",
} as Env;
const question = "What does the guide say?";

async function execute() {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(question));
  const questionDigest = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const timestamp = Date.now();
  const signature = await buyer.signMessage({ message: executionMessage(
    10143, contract, requestId, collectionId, questionDigest, openTxHash, timestamp,
  ) });
  return handleExecute(new Request("http://localhost/api/queries/execute", {
    method: "POST", headers: { "x-signature": signature, "x-timestamp": String(timestamp) },
    body: JSON.stringify({ requestId, collectionId, question, openTxHash }),
  }), env);
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.rpcMatchesConfiguredChain.mockResolvedValue(true);
  mocks.getCollectionRow.mockResolvedValue({ status: "confirmed", owner_address: buyer.address.toLowerCase(),
    content_hash: `0x${"ff".repeat(32)}` });
  mocks.checkRateLimit.mockResolvedValue({ allowed: true, retryAfter: 0 });
  const operator = privateKeyToAccount(env.SETTLEMENT_PRIVATE_KEY as `0x${string}`).address;
  mocks.getOnChainCollection.mockResolvedValue({ owner: buyer.address, operator,
    price: 100n, active: true, policyVersion: 1 });
  mocks.getOnChainQuery.mockResolvedValue({ buyer: buyer.address, amount: 100n, state: 0,
    collectionId, policyVersion: 1, openedAt: BigInt(Math.floor(Date.now() / 1000)) });
  mocks.verifyOpenReceipt.mockResolvedValue(true);
  mocks.claimQuery.mockResolvedValue(true);
  mocks.retrievePassages.mockResolvedValue({ passages: ["A fact."],
    passageIds: [`0x${"ff".repeat(32)}:chunk-0`], contentHash: `0x${"ff".repeat(32)}` });
  mocks.callModel.mockResolvedValue({ answer: "A cited fact.", citedPassages: [],
    citedPassageIds: [`0x${"ff".repeat(32)}:chunk-0`], responseDigest: answerDigest, isInsufficientEvidence: false });
  mocks.settle.mockResolvedValue({ hash: settleTxHash, status: "confirmed" });
  mocks.verifiedSettlementHash.mockResolvedValue(settleTxHash);
});

describe("settlement uncertainty after answer recording", () => {
  it("claims the exact on-chain escrow amount for revenue records", async () => {
    await execute();
    expect(mocks.claimQuery).toHaveBeenCalledWith(expect.objectContaining({ amount_wei: "100" }), env, expect.any(Number));
    expect(mocks.settle).toHaveBeenCalledWith(requestId, `0x${answerDigest.slice(7)}`, env);
  });

  it("preserves the answer if the settlement broadcast reports an ambiguous error", async () => {
    mocks.settle.mockRejectedValue(new Error("RPC connection lost"));
    const response = await execute();
    expect(response.status).toBe(202);
    const body = await response.json() as { outcome: string; answer?: string; settleTxHash: string | null };
    expect(body.outcome).toBe("settlement_pending");
    expect(body.answer).toBeUndefined();
    expect(body.settleTxHash).toBeNull();
    expect(mocks.updateQueryAnswerRecorded).toHaveBeenCalledOnce();
    expect(mocks.updateQueryOutcome).not.toHaveBeenCalled();
  });

  it("preserves the answer and transaction hash if D1 fails after on-chain confirmation", async () => {
    mocks.updateQuerySettled.mockRejectedValue(new Error("D1 unavailable"));
    const response = await execute();
    expect(response.status).toBe(202);
    expect((await response.json() as { settleTxHash: string }).settleTxHash).toBe(settleTxHash);
    expect(mocks.updateQueryOutcome).not.toHaveBeenCalled();
  });

  it("marks a confirmed reverted settlement as failed without releasing the answer", async () => {
    mocks.settle.mockResolvedValue({ hash: settleTxHash, status: "reverted" });
    const response = await execute();
    expect(response.status).toBe(409);
    expect(await response.text()).not.toContain("A cited fact.");
    expect(mocks.updateQueryOutcome).toHaveBeenCalledWith(requestId, "failed", env);
  });

  it("marks a model failure before answer recording as failed", async () => {
    mocks.callModel.mockRejectedValue(new Error("Model API unavailable"));
    const response = await execute();
    expect(response.status).toBe(500);
    expect(mocks.updateQueryAnswerRecorded).not.toHaveBeenCalled();
    expect(mocks.updateQueryOutcome).toHaveBeenCalledWith(requestId, "failed", env);
  });

  it("reconciles a recorded answer only after on-chain settlement", async () => {
    mocks.getQueryRow.mockResolvedValue({ request_id: requestId, buyer_address: buyer.address,
      outcome: "answer_recorded", answer_text: "A cited fact.", passage_ids: "[]",
      response_digest: answerDigest, settle_tx_hash: settleTxHash, open_tx_hash: openTxHash });
    mocks.getOnChainQuery.mockResolvedValue({ state: 1 });
    const timestamp = Date.now();
    const signature = await buyer.signMessage({ message: `datavault-reconcile:${requestId}:${timestamp}` });
    const response = await handleReconcile(new Request(`http://localhost/api/queries/${requestId}/reconcile`, {
      method: "POST", headers: { "x-signature": signature, "x-timestamp": String(timestamp) },
    }), env, requestId);
    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain("A cited fact.");
    expect(mocks.verifiedSettlementHash).toHaveBeenCalledWith(env, requestId,
      `0x${answerDigest.slice(7)}`, settleTxHash, openTxHash);
    expect(mocks.updateQuerySettled).toHaveBeenCalledWith(requestId, settleTxHash, [], answerDigest, env);
  });

  it("keeps a paid answer private if the settlement event does not match", async () => {
    mocks.getQueryRow.mockResolvedValue({ request_id: requestId, buyer_address: buyer.address,
      outcome: "answer_recorded", answer_text: "A cited fact.", passage_ids: "[]",
      response_digest: answerDigest, settle_tx_hash: settleTxHash, open_tx_hash: openTxHash });
    mocks.getOnChainQuery.mockResolvedValue({ state: 1 });
    mocks.verifiedSettlementHash.mockResolvedValue(null);
    const timestamp = Date.now();
    const signature = await buyer.signMessage({ message: `datavault-reconcile:${requestId}:${timestamp}` });
    const response = await handleReconcile(new Request(`http://localhost/api/queries/${requestId}/reconcile`, {
      method: "POST", headers: { "x-signature": signature, "x-timestamp": String(timestamp) },
    }), env, requestId);
    expect(response.status).toBe(409);
    expect(await response.text()).not.toContain("A cited fact.");
    expect(mocks.updateQuerySettled).not.toHaveBeenCalled();
  });

  it("discovers a settlement hash missing after a Worker crash", async () => {
    mocks.getQueryRow.mockResolvedValue({ request_id: requestId, buyer_address: buyer.address,
      outcome: "answer_recorded", answer_text: "A cited fact.", passage_ids: "[]",
      response_digest: answerDigest, settle_tx_hash: null, open_tx_hash: openTxHash });
    mocks.getOnChainQuery.mockResolvedValue({ state: 1 });
    const timestamp = Date.now();
    const signature = await buyer.signMessage({ message: `datavault-reconcile:${requestId}:${timestamp}` });
    const response = await handleReconcile(new Request(`http://localhost/api/queries/${requestId}/reconcile`, {
      method: "POST", headers: { "x-signature": signature, "x-timestamp": String(timestamp) },
    }), env, requestId);
    expect(response.status).toBe(200);
    expect(mocks.verifiedSettlementHash).toHaveBeenCalledWith(env, requestId,
      `0x${answerDigest.slice(7)}`, null, openTxHash);
    expect(mocks.updateQuerySettled).toHaveBeenCalledWith(requestId, settleTxHash, [], answerDigest, env);
  });

  it("withholds a tampered answer even when D1 says settled", async () => {
    mocks.getQueryRow.mockResolvedValue({ request_id: requestId, buyer_address: buyer.address,
      outcome: "settled", answer_text: "Different answer", passage_ids: "[]",
      response_digest: answerDigest, settle_tx_hash: settleTxHash, open_tx_hash: openTxHash });
    mocks.getOnChainQuery.mockResolvedValue({ state: 1 });
    const timestamp = Date.now();
    const signature = await buyer.signMessage({ message: `datavault-answer:${requestId}:${timestamp}` });
    const response = await handleAnswerRecovery(new Request(`http://localhost/api/queries/${requestId}/answer`, {
      headers: { "x-signature": signature, "x-timestamp": String(timestamp) },
    }), env, requestId);
    expect(response.status).toBe(409);
    expect(await response.text()).not.toContain("Different answer");
    expect(mocks.verifiedSettlementHash).not.toHaveBeenCalled();
  });
});
