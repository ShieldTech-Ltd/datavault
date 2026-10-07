import { keccak256, toBytes, verifyMessage } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Env } from "../lib/types";
import { storeCollection } from "../lib/r2";
import { insertCollection, getCollectionRow, confirmCollection, markCollectionOrphaned } from "../lib/d1";
import { buildRegisterCalldata, verifyUploadSignature, getOnChainCollection } from "../lib/policy";
import {
  isValidAddress, isValidBytes32, isValidPriceWei, isValidSignature,
  isValidTimestamp, checkContentLength, LIMITS,
  error400, error401, error403, error413,
} from "../lib/validation";
import { checkRateLimit, callerIdentity } from "../lib/ratelimit";
import { verifyRegistrationReceipt } from "../lib/chain-receipts";
import { registrationMessage } from "../../../shared/api";
import { paidServiceConfigured } from "../lib/config";

// Staging collections expire after 30 minutes if the owner never confirms the tx.
const STAGING_EXPIRY_MS = 30 * 60 * 1000;

// ── POST /api/collections ─────────────────────────────────────────

export async function handleRegisterCollection(req: Request, env: Env): Promise<Response> {
  if (!paidServiceConfigured(env)) {
    return new Response("Collection registration is not configured on this deployment.", { status: 503 });
  }
  const sizeErr = checkContentLength(req);
  if (sizeErr) return sizeErr;

  const { allowed, retryAfter } = await checkRateLimit(callerIdentity(req), "register", env);
  if (!allowed) return new Response(JSON.stringify({ error: "Too many requests" }), {
    status: 429, headers: { "Content-Type": "application/json", "Retry-After": String(retryAfter) },
  });

  const formData = await req.formData();
  const file = formData.get("file") as File | string | null;
  const priceWeiStr = formData.get("priceWei") as string | null;
  const ownerAddress = formData.get("ownerAddress") as string | null;

  if (!file || typeof file === "string") return error400("Missing or invalid file field");
  if (!isValidAddress(ownerAddress)) return error400("ownerAddress must be a 0x-prefixed 20-byte hex address");
  if (!isValidPriceWei(priceWeiStr)) return error400("priceWei must be a positive integer string no larger than 10 MON");

  const content = await (file as File).text();
  if (!content.trim()) return error400("File is empty");
  if (new TextEncoder().encode(content).length > LIMITS.MAX_UPLOAD_BYTES) return error413();

  const priceWei = BigInt(priceWeiStr as string);
  const contentHash = keccak256(toBytes(content));
  const signature = req.headers.get("x-signature") ?? "";
  const timestamp = Number(req.headers.get("x-timestamp"));
  if (!isValidSignature(signature) || !isValidTimestamp(timestamp)) return error401("A current owner signature is required");
  const authorized = await verifyMessage({
    address: ownerAddress as `0x${string}`,
    message: registrationMessage(Number(env.CHAIN_ID) || 10143, env.CONTRACT_ADDRESS,
      ownerAddress as string, contentHash, priceWei.toString(), timestamp),
    signature: signature as `0x${string}`,
  }).catch(() => false);
  if (!authorized) return error403("Signature does not match the collection owner");

  // Derive the collection ID from the signed owner and content hash.
  const collectionId = keccak256(toBytes(`${ownerAddress}:${contentHash}`));

  const existing = await getCollectionRow(collectionId, env);
  if (existing) {
    // If a prior staging attempt expired, allow a fresh one
    if (existing.status === "staging" && existing.staged_at !== null &&
        Date.now() - existing.staged_at > STAGING_EXPIRY_MS) {
      await markCollectionOrphaned(collectionId, env);
    } else if (existing.status !== "orphaned") {
      return new Response(JSON.stringify({ error: "Collection already registered" }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // Store content privately in R2 at a versioned key (immutable by content hash)
  await storeCollection(collectionId, content, contentHash, env);

  // Persist metadata in D1 as 'staging'. The row is not queryable until confirmed.
  await insertCollection(
    {
      collection_id: collectionId,
      owner_address: (ownerAddress as string).toLowerCase(),
      collection_name: (file as File).name.replace(/\.md$/i, ""),
      content_hash: contentHash,
    },
    env,
  );

  // Derive the Worker's settlement address from the settlement private key
  const operatorAddress = privateKeyToAccount(env.SETTLEMENT_PRIVATE_KEY as `0x${string}`).address;

  // Build the calldata the frontend will use to call registerCollection on-chain
  const txCalldata = await buildRegisterCalldata(collectionId as `0x${string}`, priceWei, operatorAddress);

  return new Response(
    JSON.stringify({ collectionId, contentHash, operatorAddress, txCalldata }),
    { headers: { "Content-Type": "application/json" } },
  );
}

// ── POST /api/collections/:id/confirm ────────────────────────────

// Called by the frontend after the owner's wallet has signed and the tx has
// been included. The Worker verifies the on-chain state before activating the
// D1 row. Until this is called, the collection cannot be queried.
export async function handleConfirmCollection(
  req: Request,
  env: Env,
  collectionId: string,
): Promise<Response> {
  if (!env.CONTRACT_ADDRESS) return new Response("Contract is not configured.", { status: 503 });
  if (!isValidBytes32(collectionId)) return error400("Invalid collectionId path segment");

  const body = await req.json<{ txHash: unknown; ownerAddress: unknown }>();
  if (!isValidBytes32(body.txHash)) return error400("txHash must be a 0x-prefixed 32-byte hex string");
  if (!isValidAddress(body.ownerAddress)) return error400("ownerAddress must be a 0x-prefixed 20-byte hex address");

  const col = await getCollectionRow(collectionId, env);
  if (!col) return new Response("Collection not found", { status: 404 });
  if (col.status === "confirmed") {
    return new Response(JSON.stringify({ ok: true, alreadyConfirmed: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }
  if (col.status === "orphaned") return error400("Staging window expired. Please register again.");

  // Verify the submitted ownerAddress matches what was stored at staging time
  if (col.owner_address !== (body.ownerAddress as string).toLowerCase()) {
    return error403("ownerAddress does not match the registered owner");
  }

  // Verify on-chain: the collection must exist with the correct owner
  const onChain = await getOnChainCollection(collectionId as `0x${string}`, env);
  if (!onChain) {
    return new Response("Collection not found on-chain. The transaction may not be confirmed yet.", { status: 404 });
  }
  if (onChain.owner.toLowerCase() !== col.owner_address) {
    return error403("On-chain owner does not match the registered owner.");
  }
  if (!(await verifyRegistrationReceipt(env, body.txHash as `0x${string}`, collectionId, col.owner_address))) {
    return new Response("Registration transaction is unconfirmed or does not match this collection.", { status: 409 });
  }

  await confirmCollection(collectionId, body.txHash as string, env);

  return new Response(
    JSON.stringify({ ok: true, collectionId, status: "confirmed" }),
    { headers: { "Content-Type": "application/json" } },
  );
}

// ── POST /api/collections/:id/upload ─────────────────────────────

// The client must sign: `datavault-upload:<collectionId>:<sha256(body)>:<timestamp>`
// and send x-signature and x-timestamp headers alongside the body.
// This prevents any party other than the registered owner from overwriting the collection.
export async function handleUploadCollection(
  req: Request,
  env: Env,
  collectionId: string,
): Promise<Response> {
  if (!isValidBytes32(collectionId)) return error400("Invalid collectionId path segment");

  const sizeErr = checkContentLength(req);
  if (sizeErr) return sizeErr;

  const col = await getCollectionRow(collectionId, env);
  if (!col) return new Response("Collection not found", { status: 404 });
  if (col.status !== "confirmed") return error403("Collection is not yet confirmed on-chain");

  const signature = req.headers.get("x-signature") ?? "";
  const timestampStr = req.headers.get("x-timestamp") ?? "";
  const timestamp = parseInt(timestampStr, 10);

  if (!isValidSignature(signature)) return error401("x-signature header is missing or malformed");
  if (!isValidTimestamp(timestamp)) return error401("x-timestamp header is missing, invalid, or expired");

  const body = await req.text();
  if (!body.trim()) return error400("Request body is empty");
  if (new TextEncoder().encode(body).length > LIMITS.MAX_UPLOAD_BYTES) return error413();

  const contentHash = await sha256Hex(body);

  const valid = await verifyUploadSignature(
    col.owner_address,
    collectionId,
    contentHash,
    timestamp,
    signature,
  );

  if (!valid) return error403("Invalid or expired signature");

  // For re-uploads, also verify the signer is still the on-chain owner.
  // This catches a case where the owner transferred the collection off-chain somehow.
  if (env.CONTRACT_ADDRESS) {
    const onChain = await getOnChainCollection(collectionId as `0x${string}`, env);
    if (!onChain || onChain.owner.toLowerCase() !== col.owner_address) {
      return error403("On-chain owner mismatch. Re-upload not authorized.");
    }
  }

  const newContentHash = keccak256(toBytes(body));
  await storeCollection(collectionId, body, newContentHash, env);

  return new Response(JSON.stringify({ ok: true, contentHash: newContentHash }), {
    headers: { "Content-Type": "application/json" },
  });
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
