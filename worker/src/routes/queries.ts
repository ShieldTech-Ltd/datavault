import type { Env } from "../lib/types";
import {
  getCollectionRow, claimQuery, updateQuerySettled, updateQueryOutcome,
  updateQueryRunning, updateQueryAnswerRecorded, getQueryRow,
} from "../lib/d1";
import { getOnChainCollection, getOnChainQuery, verifyUploadSignature } from "../lib/policy";
import { retrievePassages } from "../lib/r2";
import { callModel } from "../lib/model";
import { createWalletClient, http, parseAbi, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { isValidBytes32, isValidQuestion, isValidSignature, isValidTimestamp, error400 } from "../lib/validation";
import { checkRateLimit, callerIdentity } from "../lib/ratelimit";

// Worker lease duration: if a Worker instance claims a requestId but crashes,
// another instance may reclaim it after this window.
const LEASE_MS = 60_000;

// ── POST /api/queries/prepare ─────────────────────────────────────

export async function handlePrepare(req: Request, env: Env): Promise<Response> {
  const body = await req.json<{ collectionId: unknown; question: unknown }>();
  const { collectionId } = body;
  if (!isValidBytes32(collectionId)) return error400("collectionId must be a 0x-prefixed 32-byte hex string");

  const col = await getCollectionRow(collectionId, env);
  if (!col) return new Response("Collection not found", { status: 404 });
  if (col.status !== "confirmed") return new Response("Collection is not yet confirmed on-chain", { status: 403 });
  if (!col.active) return new Response("Collection is paused", { status: 403 });

  let priceWei = "0";
  if (env.CONTRACT_ADDRESS) {
    const onChain = await getOnChainCollection(collectionId as `0x${string}`, env);
    if (!onChain) return new Response("Collection not found on-chain", { status: 404 });
    if (!onChain.active) return new Response("Collection is paused on-chain", { status: 403 });
    priceWei = onChain.price.toString();
  }

  const priceDisplay = priceWei === "0"
    ? "0 (dev mode)"
    : (Number(priceWei) / 1e18).toFixed(6);

  return new Response(
    JSON.stringify({ collectionId, priceWei, priceDisplay, collectionName: col.collection_name }),
    { headers: { "Content-Type": "application/json" } },
  );
}

// ── POST /api/queries/execute ─────────────────────────────────────

export async function handleExecute(req: Request, env: Env): Promise<Response> {
  if (!env.CONTRACT_ADDRESS) {
    return new Response(
      JSON.stringify({ error: "Service unavailable: contract not configured on this deployment." }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  const { allowed, retryAfter } = await checkRateLimit(callerIdentity(req), "execute", env);
  if (!allowed) return new Response(JSON.stringify({ error: "Too many requests" }), {
    status: 429, headers: { "Content-Type": "application/json", "Retry-After": String(retryAfter) },
  });

  const body = await req.json<{ requestId: unknown; collectionId: unknown; question: unknown }>();
  const { requestId, collectionId, question } = body;

  if (!isValidBytes32(requestId)) return error400("requestId must be a 0x-prefixed 32-byte hex string");
  if (!isValidBytes32(collectionId)) return error400("collectionId must be a 0x-prefixed 32-byte hex string");
  if (!isValidQuestion(question)) return error400("question must be a non-empty string up to 500 characters");

  const questionDigest = await sha256Hex(question as string);

  // ── On-chain checks (before any claim attempt) ────────────────────
  const onChain = await getOnChainCollection(collectionId as `0x${string}`, env);
  if (!onChain) return new Response("Collection not found on-chain", { status: 404 });
  if (!onChain.active) {
    return new Response(JSON.stringify({ error: "Collection is paused." }), {
      status: 403, headers: { "Content-Type": "application/json" },
    });
  }
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

  // ── Atomic claim ─────────────────────────────────────────────────
  // INSERT OR IGNORE: only one Worker instance wins. If we lose the race,
  // inspect the existing row to return the right response.
  const claimed = await claimQuery({
    request_id: requestId as string,
    collection_id: collectionId as string,
    buyer_address: buyerAddress,
    policy_version: currentPolicyVersion,
    question_digest: questionDigest,
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

    // Answer already recorded (Worker crashed after model call but before response delivery)
    // Return the stored answer so the buyer is not charged twice.
    if (existing.outcome === "answer_recorded" || existing.outcome === "settled") {
      return new Response(
        JSON.stringify({
          answer: existing.answer_text ?? "",
          passages: JSON.parse(existing.passage_ids),
          requestId,
          txHash: existing.tx_hash ?? "pending",
          receiptUrl: `/api/queries/${requestId}/receipt`,
          recovered: true,
        }),
        { headers: { "Content-Type": "application/json" } },
      );
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

  try {
    const { passages, passageIds } = await retrievePassages(collectionId as string, question as string, env);
    if (passages.length === 0) {
      await updateQueryOutcome(requestId as string, "failed", env);
      return new Response("No relevant passages found", { status: 422 });
    }

    const { answer, passages: citedPassages, responseDigest } = await callModel(question as string, passages, env);

    // Persist answer BEFORE broadcasting the settlement tx.
    // If the Worker crashes after settle but before response delivery, the buyer
    // can recover via GET /api/queries/:id/answer.
    await updateQueryAnswerRecorded(requestId as string, answer, passageIds, responseDigest, env);

    // Recheck policy immediately before settlement
    const preSettlePolicy = await getOnChainCollection(collectionId as `0x${string}`, env);
    if (!preSettlePolicy || !preSettlePolicy.active || preSettlePolicy.policyVersion !== currentPolicyVersion) {
      await updateQueryOutcome(requestId as string, "failed", env);
      return new Response(
        JSON.stringify({ error: "Collection policy changed before settlement. Call refundExpired to recover payment." }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      );
    }

    let settleTxHash = "no-settlement-key";
    if (env.SETTLEMENT_PRIVATE_KEY) {
      settleTxHash = await settleOnChain(requestId as `0x${string}`, env);
    }

    await updateQuerySettled(requestId as string, settleTxHash, passageIds, responseDigest, env);

    return new Response(
      JSON.stringify({
        answer,
        passages: citedPassages,
        requestId,
        txHash: settleTxHash,
        receiptUrl: `/api/queries/${requestId}/receipt`,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    await updateQueryOutcome(requestId as string, "failed", env);
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
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
      txHash: row.tx_hash,
      policyVersion: row.policy_version,
      passageIds: JSON.parse(row.passage_ids),
      responseDigest: row.response_digest,
      outcome: row.outcome,
      createdAt: row.created_at,
      settledAt: row.settled_at,
    }),
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

  if (row.outcome !== "answer_recorded" && row.outcome !== "settled") {
    return new Response(
      JSON.stringify({ error: "Answer not available. Request has not been answered yet or failed.", outcome: row.outcome }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  // Verify the caller is the buyer who paid
  const message = `datavault-answer:${requestId}:${timestamp}`;
  const valid = await verifyUploadSignature(row.buyer_address, requestId, await sha256Hex(message), timestamp, signature);
  if (!valid) {
    // verifyUploadSignature expects the upload message format, so verify directly
    const { verifyMessage } = await import("viem");
    const directValid = await verifyMessage({
      address: row.buyer_address as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    }).catch(() => false);
    if (!directValid) {
      return new Response(JSON.stringify({ error: "Signature does not match the buyer address." }), {
        status: 403, headers: { "Content-Type": "application/json" },
      });
    }
  }

  return new Response(
    JSON.stringify({
      answer: row.answer_text,
      passageIds: JSON.parse(row.passage_ids),
      responseDigest: row.response_digest,
      outcome: row.outcome,
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

// ── On-chain settlement ───────────────────────────────────────────

async function settleOnChain(requestId: `0x${string}`, env: Env): Promise<string> {
  const account = privateKeyToAccount(env.SETTLEMENT_PRIVATE_KEY as `0x${string}`);
  const chain = {
    id: Number(env.CHAIN_ID) || 10143,
    name: "Monad Testnet",
    nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
    rpcUrls: { default: { http: [env.MONAD_RPC_URL] } },
  } as const;

  const walletClient = createWalletClient({ account, chain, transport: http() });
  const settleAbi = parseAbi(["function settleQuery(bytes32 requestId) external"]);

  const { encodeFunctionData } = await import("viem");
  const data = encodeFunctionData({ abi: settleAbi, functionName: "settleQuery", args: [requestId] });

  const hash = await walletClient.sendTransaction({
    to: env.CONTRACT_ADDRESS as Address,
    data,
    chain,
    account,
  });

  return hash;
}
