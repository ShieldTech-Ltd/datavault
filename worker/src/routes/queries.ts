import type { Env } from "../lib/types";
import {
  getCollectionRow, claimQuery, updateQuerySettled, updateQuerySettlementPending,
  updateQueryOutcome, updateQueryRunning, updateQueryAnswerRecorded,
  updateQueryContentHash, getQueryRow,
} from "../lib/d1";
import { getOnChainCollection, getOnChainQuery } from "../lib/policy";
import { verifyOpenReceipt } from "../lib/chain-receipts";
import { operatorMatches, paidServiceConfigured } from "../lib/config";
import { executionMessage, type QueryResult } from "../../../shared/api";
import { retrievePassages, retrieveCitedPassages } from "../lib/r2";
import { callModel } from "../lib/model";
import { verifyMessage } from "viem";
import { settleOnChainWithConfirmation } from "../lib/settlement";
import { isValidBytes32, isValidQuestion, isValidSignature, isValidTimestamp, error400 } from "../lib/validation";
import { checkRateLimit, callerIdentity } from "../lib/ratelimit";
import { rpcMatchesConfiguredChain } from "../lib/chain-identity";

// Worker lease duration: if a Worker instance claims a requestId but crashes,
// another instance may reclaim it after this window.
const LEASE_MS = 60_000;

export async function handleDemoCollection(env: Env): Promise<Response> {
  const id = env.DEMO_COLLECTION_ID;
  if (!isValidBytes32(id) || !paidServiceConfigured(env)) {
    return new Response("Demo collection unavailable.", { status: 404 });
  }
  const row = await getCollectionRow(id, env);
  if (!row || row.status !== "confirmed") return new Response("Demo collection unavailable.", { status: 404 });
  if (!(await rpcMatchesConfiguredChain(env))) return new Response("Demo collection unavailable.", { status: 404 });
  const policy = await getOnChainCollection(id as `0x${string}`, env);
  if (!policy || !policy.active || !operatorMatches(env, policy) || policy.owner.toLowerCase() !== row.owner_address) {
    return new Response("Demo collection unavailable.", { status: 404 });
  }
  return new Response(JSON.stringify({
    collectionId: id,
    collectionName: row.collection_name,
    ownerAddress: row.owner_address,
    priceWei: policy.price.toString(),
  }), { headers: { "Content-Type": "application/json" } });
}

// ── POST /api/queries/prepare ─────────────────────────────────────

export async function handlePrepare(req: Request, env: Env): Promise<Response> {
  if (!paidServiceConfigured(env)) {
    return new Response(JSON.stringify({ error: "Paid queries are not configured on this deployment." }),
      { status: 503, headers: { "Content-Type": "application/json" } });
  }
  const body = await req.json<{ collectionId: unknown; question: unknown }>();
  const { collectionId } = body;
  if (!isValidBytes32(collectionId)) return error400("collectionId must be a 0x-prefixed 32-byte hex string");
  if (!isValidQuestion(body.question)) return error400("question must be a non-empty string up to 500 characters");

  const col = await getCollectionRow(collectionId, env);
  if (!col) return new Response("Collection not found", { status: 404 });
  if (col.status !== "confirmed") return new Response("Collection is not yet confirmed on-chain", { status: 403 });
  if (!col.active) return new Response("Collection is paused", { status: 403 });
  if (!(await rpcMatchesConfiguredChain(env))) {
    return new Response(JSON.stringify({ error: "Monad RPC chain does not match this deployment." }),
      { status: 503, headers: { "Content-Type": "application/json" } });
  }

  const onChain = await getOnChainCollection(collectionId as `0x${string}`, env);
  if (!onChain) return new Response("Collection not found on-chain", { status: 404 });
  if (!onChain.active) return new Response("Collection is paused on-chain", { status: 403 });
  if (!operatorMatches(env, onChain)) return new Response("Collection operator is not configured for settlement.", { status: 503 });
  const priceWei = onChain.price.toString();

  const priceDisplay = (Number(priceWei) / 1e18).toFixed(6);

  return new Response(
    JSON.stringify({ collectionId, priceWei, priceDisplay, collectionName: col.collection_name }),
    { headers: { "Content-Type": "application/json" } },
  );
}

// ── POST /api/queries/execute ─────────────────────────────────────

export async function handleExecute(req: Request, env: Env): Promise<Response> {
  if (!paidServiceConfigured(env)) {
    return new Response(
      JSON.stringify({ error: "Service unavailable: contract not configured on this deployment." }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }
  const { allowed, retryAfter } = await checkRateLimit(callerIdentity(req), "execute", env);
  if (!allowed) return new Response(JSON.stringify({ error: "Too many requests" }), {
    status: 429, headers: { "Content-Type": "application/json", "Retry-After": String(retryAfter) },
  });

  const body = await req.json<{ requestId: unknown; collectionId: unknown; question: unknown; openTxHash: unknown }>();
  const { requestId, collectionId, question, openTxHash } = body;

  if (!isValidBytes32(requestId)) return error400("requestId must be a 0x-prefixed 32-byte hex string");
  if (!isValidBytes32(collectionId)) return error400("collectionId must be a 0x-prefixed 32-byte hex string");
  if (!isValidQuestion(question)) return error400("question must be a non-empty string up to 500 characters");
  if (!isValidBytes32(openTxHash)) return error400("openTxHash must be a 0x-prefixed transaction hash");

  const signature = req.headers.get("x-signature") ?? "";
  const timestamp = Number(req.headers.get("x-timestamp"));
  if (!isValidSignature(signature) || !isValidTimestamp(timestamp)) {
    return new Response("A current buyer signature is required.", { status: 401 });
  }
  if (!(await rpcMatchesConfiguredChain(env))) {
    return new Response(JSON.stringify({ error: "Monad RPC chain does not match this deployment." }),
      { status: 503, headers: { "Content-Type": "application/json" } });
  }

  const questionDigest = await sha256Hex(question as string);

  // ── On-chain checks (before any claim attempt) ────────────────────
  const onChain = await getOnChainCollection(collectionId as `0x${string}`, env);
  if (!onChain) return new Response("Collection not found on-chain", { status: 404 });
  if (!onChain.active) {
    return new Response(JSON.stringify({ error: "Collection is paused." }), {
      status: 403, headers: { "Content-Type": "application/json" },
    });
  }
  if (!operatorMatches(env, onChain)) return new Response("Collection operator is not configured for settlement.", { status: 503 });
  const currentPolicyVersion = onChain.policyVersion;
  const currentPrice = onChain.price;

  const escrow = await getOnChainQuery(requestId as `0x${string}`, env);
  if (!escrow) return new Response("Escrow not found on-chain. Call openQuery first.", { status: 402 });
  if (escrow.state !== 0) return new Response("Escrow already finalised.", { status: 409 });
  if (escrow.collectionId.toLowerCase() !== (collectionId as string).toLowerCase()) {
    return new Response("Escrow collectionId mismatch.", { status: 400 });
  }
  if (escrow.amount < currentPrice) return new Response("Escrow amount below collection price.", { status: 402 });
  if (escrow.policyVersion !== currentPolicyVersion) {
    return new Response(
      "Policy version changed since escrow was opened. Call refundExpired to recover payment.",
      { status: 409 },
    );
  }
  const REFUND_TIMEOUT_S = 600n;
  const nowS = BigInt(Math.floor(Date.now() / 1000));
  if (nowS >= escrow.openedAt + REFUND_TIMEOUT_S) {
    return new Response(
      JSON.stringify({ error: "Escrow timeout has elapsed. Call refundExpired to recover payment." }),
      { status: 409, headers: { "Content-Type": "application/json" } },
    );
  }

  const buyerAddress = escrow.buyer;
  const chainId = Number(env.CHAIN_ID) || 10143;
  const authorized = await verifyMessage({
    address: buyerAddress,
    message: executionMessage(chainId, env.CONTRACT_ADDRESS, requestId, collectionId, questionDigest, openTxHash, timestamp),
    signature: signature as `0x${string}`,
  }).catch(() => false);
  if (!authorized) return new Response("Signature does not match the escrow buyer.", { status: 403 });
  if (!(await verifyOpenReceipt(env, openTxHash as `0x${string}`, requestId, collectionId, buyerAddress, escrow.amount))) {
    return new Response("Opening transaction is unconfirmed or does not match this escrow.", { status: 409 });
  }

  // ── Atomic claim ─────────────────────────────────────────────────
  // INSERT OR IGNORE: only one Worker instance wins. If we lose the race,
  // inspect the existing row to return the right response.
  const claimed = await claimQuery({
    request_id: requestId as string,
    collection_id: collectionId as string,
    buyer_address: buyerAddress,
    policy_version: currentPolicyVersion,
    question_digest: questionDigest,
    open_tx_hash: openTxHash,
    chain_id: chainId,
    contract_address: env.CONTRACT_ADDRESS,
    amount_wei: escrow.amount.toString(),
  }, env, LEASE_MS);

  if (!claimed) {
    const existing = await getQueryRow(requestId as string, env);
    if (!existing) return new Response("Claim race: please retry.", { status: 409 });

    // Question substitution attempt
    if (existing.question_digest !== questionDigest) {
      return new Response(
        JSON.stringify({ error: "requestId already used with a different question." }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      );
    }

    // The authenticated answer endpoint handles requests already settled on-chain.
    if (existing.outcome === "answer_recorded" || existing.outcome === "settlement_pending") {
      return new Response(JSON.stringify({
        requestId, openTxHash, settleTxHash: existing.settle_tx_hash,
        outcome: "settlement_pending", receiptUrl: `/api/queries/${requestId}/receipt`,
      } satisfies QueryResult), { headers: { "Content-Type": "application/json" } });
    }

    // Another instance is running and its lease has not expired
    if (
      existing.outcome === "running" &&
      existing.lease_expires_at !== null &&
      Date.now() < existing.lease_expires_at
    ) {
      return new Response(
        JSON.stringify({ error: "Request is being processed by another instance. Retry after lease expires.", retryAfter: Math.ceil((existing.lease_expires_at - Date.now()) / 1000) }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      );
    }

    // Lease expired (Worker crashed mid-execution): reclaim is not implemented in this
    // iteration. Return 409 and document in recovery guide. The buyer can refundExpired
    // after the on-chain timeout.
    return new Response(
      JSON.stringify({ error: "Duplicate requestId or stale claim. Call refundExpired after the on-chain timeout if the escrow is still open." }),
      { status: 409, headers: { "Content-Type": "application/json" } },
    );
  }

  // ── Execution (this instance holds the claim) ─────────────────────
  await updateQueryRunning(requestId as string, env);

  let answerMayBeRecorded = false;
  let settleTxHash: `0x${string}` | null = null;
  try {
    const { passages, passageIds, contentHash } = await retrievePassages(collectionId as string, question as string, env);
    if (passages.length === 0) {
      await updateQueryOutcome(requestId as string, "failed", env);
      return new Response("No relevant passages found", { status: 422 });
    }

    // Record the content version used so the receipt is self-describing
    await updateQueryContentHash(requestId as string, contentHash, env);

    const { answer, citedPassages, citedPassageIds, responseDigest, isInsufficientEvidence } =
      await callModel(question as string, passages, passageIds, env);

    // Persist answer BEFORE broadcasting the settlement tx.
    // If the Worker crashes after settle but before response delivery, the buyer
    // can recover via GET /api/queries/:id/answer.
    answerMayBeRecorded = true;
    await updateQueryAnswerRecorded(requestId as string, answer, citedPassageIds, responseDigest, env);

    // Recheck policy immediately before settlement
    const preSettlePolicy = await getOnChainCollection(collectionId as `0x${string}`, env);
    if (!preSettlePolicy || !preSettlePolicy.active || preSettlePolicy.policyVersion !== currentPolicyVersion) {
      await updateQueryOutcome(requestId as string, "failed", env);
      return new Response(
        JSON.stringify({ error: "Collection policy changed before settlement. Call refundExpired to recover payment." }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      );
    }

    // Settle on-chain and wait for confirmation. If the tx broadcasts but times out
    // before confirmation, mark as settlement_pending so the buyer can reconcile.
    const preSettleEscrow = await getOnChainQuery(requestId as `0x${string}`, env);
    if (!preSettleEscrow || preSettleEscrow.state !== 0 || BigInt(Math.floor(Date.now() / 1000)) >= preSettleEscrow.openedAt + REFUND_TIMEOUT_S) {
      await updateQueryOutcome(requestId as string, "failed", env);
      return new Response("Escrow is no longer open for settlement.", { status: 409 });
    }
    const digestHex = responseDigest.slice("sha256:".length);
    if (!/^sha256:[0-9a-fA-F]{64}$/.test(responseDigest) || /^0{64}$/.test(digestHex)) {
      throw new Error("Answer digest is invalid for settlement.");
    }
    const result = await settleOnChainWithConfirmation(requestId as `0x${string}`, `0x${digestHex}`, env);
    settleTxHash = result.hash;
    if (result.status === "reverted") {
      await updateQueryOutcome(requestId as string, "failed", env);
      return new Response(JSON.stringify({ error: "Settlement transaction reverted. Check escrow status and refund after the timeout if it remains open.", settleTxHash }), {
        status: 409, headers: { "Content-Type": "application/json" },
      });
    }
    if (result.status === "pending") {
      await updateQuerySettlementPending(requestId as string, settleTxHash, env);
      return new Response(JSON.stringify({
        requestId, openTxHash, settleTxHash, outcome: "settlement_pending",
        receiptUrl: `/api/queries/${requestId}/receipt`,
      } satisfies QueryResult), { headers: { "Content-Type": "application/json" } });
    }

    await updateQuerySettled(requestId as string, settleTxHash, citedPassageIds, responseDigest, env);

    return new Response(
      JSON.stringify({
        answer,
        citedPassages,
        citedPassageIds,
        isInsufficientEvidence,
        responseDigest,
        requestId,
        openTxHash,
        settleTxHash,
        outcome: "settled",
        receiptUrl: `/api/queries/${requestId}/receipt`,
      } satisfies QueryResult),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    if (answerMayBeRecorded) {
      // The answer write or settlement may have completed before an RPC or D1
      // error reached this Worker. Preserve the row for authenticated chain
      // reconciliation instead of writing a false terminal failure.
      return new Response(JSON.stringify({
        requestId, openTxHash, settleTxHash, outcome: "settlement_pending",
        receiptUrl: `/api/queries/${requestId}/receipt`,
      } satisfies QueryResult), { status: 202, headers: { "Content-Type": "application/json" } });
    }
    await updateQueryOutcome(requestId as string, "failed", env);
    const knownModelFailure = err instanceof Error && err.message.startsWith("Model API");
    return new Response(JSON.stringify({ error: knownModelFailure
      ? "Model provider unavailable. If escrow remains open, refund after the timeout."
      : "Query failed. Check the on-chain escrow before retrying payment." }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
}

// ── GET /api/queries/:id/receipt ──────────────────────────────────

export async function handleReceipt(env: Env, requestId: string): Promise<Response> {
  if (!isValidBytes32(requestId)) return error400("Invalid requestId path segment");
  const row = await getQueryRow(requestId, env);
  if (!row) return new Response("Not found", { status: 404 });

  return new Response(
    JSON.stringify({
      requestId: row.request_id,
      collectionId: row.collection_id,
      buyerAddress: row.buyer_address,
      chainId: row.chain_id,
      contractAddress: row.contract_address,
      contentHash: row.content_hash,
      amountWei: row.amount_wei,
      policyVersion: row.policy_version,
      openTxHash: row.open_tx_hash,
      settleTxHash: row.settle_tx_hash,
      refundTxHash: row.refund_tx_hash,
      citedPassageIds: JSON.parse(row.passage_ids),
      responseDigest: row.response_digest,
      outcome: row.outcome,
      createdAt: row.created_at,
      settledAt: row.settled_at,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
}

// ── POST /api/queries/:id/reconcile ──────────────────────────────

// Called by the buyer after a settlement_pending response. Checks on-chain
// state for the pending tx and updates D1 if the settlement was confirmed.
// Requires buyer ECDSA auth (same pattern as answer recovery).
export async function handleReconcile(req: Request, env: Env, requestId: string): Promise<Response> {
  if (!isValidBytes32(requestId)) return error400("Invalid requestId path segment");
  if (!env.CONTRACT_ADDRESS) {
    return new Response(JSON.stringify({ error: "Contract not configured." }), {
      status: 503, headers: { "Content-Type": "application/json" },
    });
  }

  const signature = req.headers.get("x-signature") ?? "";
  const timestampStr = req.headers.get("x-timestamp") ?? "";
  const timestamp = parseInt(timestampStr, 10);

  if (!isValidSignature(signature)) {
    return new Response(JSON.stringify({ error: "x-signature header missing or malformed" }), {
      status: 401, headers: { "Content-Type": "application/json" },
    });
  }
  if (!isValidTimestamp(timestamp)) {
    return new Response(JSON.stringify({ error: "x-timestamp header missing, invalid, or expired" }), {
      status: 401, headers: { "Content-Type": "application/json" },
    });
  }

  const row = await getQueryRow(requestId, env);
  if (!row) return new Response("Not found", { status: 404 });

  // Verify caller is the original buyer
  const message = `datavault-reconcile:${requestId}:${timestamp}`;
  const { verifyMessage } = await import("viem");
  const valid = await verifyMessage({
    address: row.buyer_address as `0x${string}`,
    message,
    signature: signature as `0x${string}`,
  }).catch(() => false);
  if (!valid) {
    return new Response(JSON.stringify({ error: "Signature does not match buyer address." }), {
      status: 403, headers: { "Content-Type": "application/json" },
    });
  }

  if (row.outcome === "settled") {
    return new Response(
      JSON.stringify({ outcome: "settled", settleTxHash: row.settle_tx_hash }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  // Check on-chain escrow state
  const escrow = await getOnChainQuery(requestId as `0x${string}`, env);
  if (escrow && escrow.state === 1 && row.answer_text) {
    // Settled on-chain: update D1
    await updateQuerySettled(
      requestId,
      row.settle_tx_hash ?? null,
      JSON.parse(row.passage_ids),
      row.response_digest ?? "",
      env,
    );
    return new Response(
      JSON.stringify({ outcome: "settled", settleTxHash: row.settle_tx_hash, reconciled: true }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  if (escrow?.state === 2) {
    await updateQueryOutcome(requestId, "refunded", env);
    return new Response(JSON.stringify({ outcome: "refunded" }),
      { headers: { "Content-Type": "application/json" } });
  }
  if (escrow?.state === 0 && BigInt(Math.floor(Date.now() / 1000)) >= escrow.openedAt + 600n) {
    await updateQueryOutcome(requestId, "refundable", env);
    return new Response(JSON.stringify({ outcome: "refundable" }),
      { headers: { "Content-Type": "application/json" } });
  }

  if (!row.answer_text) {
    return new Response(JSON.stringify({ outcome: row.outcome, message: "No answer has been recorded." }),
      { headers: { "Content-Type": "application/json" } });
  }

  return new Response(
    JSON.stringify({ outcome: "settlement_pending", settleTxHash: row.settle_tx_hash, message: "Settlement not yet confirmed on-chain." }),
    { headers: { "Content-Type": "application/json" } },
  );
}

// ── GET /api/queries/:id/answer ───────────────────────────────────

// Recovery endpoint: returns the stored answer for the original buyer.
// Requires an ECDSA signature from the buyer's address over:
//   datavault-answer:<requestId>:<timestamp>
// This proves the caller is the same wallet that opened the escrow, without
// requiring a separate session system.
export async function handleAnswerRecovery(req: Request, env: Env, requestId: string): Promise<Response> {
  if (!isValidBytes32(requestId)) return error400("Invalid requestId path segment");

  const signature = req.headers.get("x-signature") ?? "";
  const timestampStr = req.headers.get("x-timestamp") ?? "";
  const timestamp = parseInt(timestampStr, 10);

  if (!isValidSignature(signature)) {
    return new Response(JSON.stringify({ error: "x-signature header is missing or malformed" }), {
      status: 401, headers: { "Content-Type": "application/json" },
    });
  }
  if (!isValidTimestamp(timestamp)) {
    return new Response(JSON.stringify({ error: "x-timestamp header is missing, invalid, or expired" }), {
      status: 401, headers: { "Content-Type": "application/json" },
    });
  }

  const row = await getQueryRow(requestId, env);
  if (!row) return new Response("Not found", { status: 404 });

  if (row.outcome !== "settled") {
    return new Response(
      JSON.stringify({ error: "Answer not available. Request has not been answered yet or failed.", outcome: row.outcome }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  // Verify the caller is the buyer who paid
  const message = `datavault-answer:${requestId}:${timestamp}`;
  const valid = await verifyMessage({
      address: row.buyer_address as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    }).catch(() => false);
  if (!valid) {
      return new Response(JSON.stringify({ error: "Signature does not match the buyer address." }), {
        status: 403, headers: { "Content-Type": "application/json" },
      });
  }

  const citedPassageIds = JSON.parse(row.passage_ids) as string[];
  const citedPassages = await retrieveCitedPassages(row.collection_id, row.content_hash, citedPassageIds, env)
    .catch(() => []);

  return new Response(
    JSON.stringify({
      answer: row.answer_text,
      citedPassageIds,
      citedPassages,
      responseDigest: row.response_digest,
      settleTxHash: row.settle_tx_hash,
      outcome: "settled",
      requestId,
      recovered: true,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
}

// ── Helpers ───────────────────────────────────────────────────────

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
