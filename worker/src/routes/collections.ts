import { keccak256, toBytes, verifyMessage } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Env } from "../lib/types";
import { storeCollection } from "../lib/r2";
import { insertCollection, getCollectionRow, confirmCollection } from "../lib/d1";
import { buildRegisterCalldata, getOnChainCollection } from "../lib/policy";
import {
  isValidAddress, isValidBytes32, isValidPriceWei, isValidSignature,
  isValidTimestamp, checkContentLength, LIMITS,
  error400, error401, error403, error413,
} from "../lib/validation";
import { checkRateLimit, callerIdentity } from "../lib/ratelimit";
import { verifyRegistrationReceipt } from "../lib/chain-receipts";
import { registrationMessage } from "../../../shared/api";
import { paidServiceConfigured } from "../lib/config";
import { rpcMatchesConfiguredChain } from "../lib/chain-identity";
import { collectionIdFor } from "../lib/collection-id";
import { decodeCollectionText } from '../../../shared/document-text';

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

  if (file.size > LIMITS.MAX_UPLOAD_BYTES) return error413();
  let content: string;
  try { content = decodeCollectionText(new Uint8Array(await file.arrayBuffer()), file.name); }
  catch (error) { return error400(error instanceof Error ? error.message : 'Invalid text file'); }

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
  if (!(await rpcMatchesConfiguredChain(env))) {
    return new Response("Monad RPC chain does not match this deployment.", { status: 503 });
  }

  const collectionId = collectionIdFor(Number(env.CHAIN_ID), env.CONTRACT_ADDRESS,
    ownerAddress, contentHash);

  const existing = await getCollectionRow(collectionId, env);
  if (existing && existing.status !== "orphaned" &&
      !(existing.status === "staging" && existing.staged_at !== null &&
        Date.now() - existing.staged_at > STAGING_EXPIRY_MS)) {
    return new Response(JSON.stringify({ error: "Collection already registered" }), {
      status: 409, headers: { "Content-Type": "application/json" },
    });
  }

  // Store content privately in R2 at a versioned key (immutable by content hash)
  await storeCollection(collectionId, content, contentHash, env);

  // Persist metadata in D1 as 'staging'. The row is not queryable until confirmed.
  const staged = await insertCollection(
    {
      collection_id: collectionId,
      owner_address: (ownerAddress as string).toLowerCase(),
      collection_name: (file as File).name.replace(/\.md$/i, ""),
      content_hash: contentHash,
    },
    env,
  );
  if (!staged) return new Response(JSON.stringify({ error: "Collection already registered" }), {
    status: 409, headers: { "Content-Type": "application/json" },
  });

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
    if (col.owner_address === (body.ownerAddress as string).toLowerCase() &&
        col.confirmed_tx?.toLowerCase() === (body.txHash as string).toLowerCase()) {
      return new Response(JSON.stringify({ ok: true, alreadyConfirmed: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("Confirmed registration does not match this owner and transaction.", { status: 409 });
  }
  if (col.status === "orphaned") return error400("Staging window expired. Please register again.");

  // Verify the submitted ownerAddress matches what was stored at staging time
  if (col.owner_address !== (body.ownerAddress as string).toLowerCase()) {
    return error403("ownerAddress does not match the registered owner");
  }
  if (!(await rpcMatchesConfiguredChain(env))) {
    return new Response("Monad RPC chain does not match this deployment.", { status: 503 });
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

  const confirmed = await confirmCollection(collectionId, body.txHash as string, env);
  if (!confirmed) {
    const latest = await getCollectionRow(collectionId, env);
    if (latest?.status === "confirmed" &&
        latest.owner_address === (body.ownerAddress as string).toLowerCase() &&
        latest.confirmed_tx?.toLowerCase() === (body.txHash as string).toLowerCase()) {
      return new Response(JSON.stringify({ ok: true, alreadyConfirmed: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("Registration state changed during confirmation.", { status: 409 });
  }

  return new Response(
    JSON.stringify({ ok: true, collectionId, status: "confirmed" }),
    { headers: { "Content-Type": "application/json" } },
  );
}
