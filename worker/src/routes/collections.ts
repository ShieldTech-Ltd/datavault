import { keccak256, toBytes } from "viem";
import type { Env } from "../lib/types";
import { storeCollection } from "../lib/r2";
import { insertCollection, getCollectionRow } from "../lib/d1";
import { buildRegisterCalldata, verifyUploadSignature } from "../lib/policy";

export async function handleRegisterCollection(req: Request, env: Env): Promise<Response> {
  const formData = await req.formData();
  const file = formData.get("file") as File | string | null;
  const priceWeiStr = formData.get("priceWei") as string | null;
  const ownerAddress = formData.get("ownerAddress") as string | null;

  if (!file || typeof file === "string" || !priceWeiStr || !ownerAddress) {
    return new Response("Missing file, priceWei, or ownerAddress", { status: 400 });
  }

  const content = await (file as File).text();
  if (!content.trim()) return new Response("Empty file", { status: 400 });

  const priceWei = BigInt(priceWeiStr as string);
  const contentHash = keccak256(toBytes(content));

  // Derive collection ID from owner + content hash
  const collectionId = keccak256(toBytes(`${ownerAddress}:${contentHash}`));

  const existing = await getCollectionRow(collectionId, env);
  if (existing) {
    return new Response(JSON.stringify({ error: "Collection already registered" }), {
      status: 409,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Store content privately in R2
  await storeCollection(collectionId, content, env);

  // Persist metadata in D1
  await insertCollection(
    {
      collection_id: collectionId,
      owner_address: ownerAddress as string,
      collection_name: (file as File).name.replace(/\.md$/i, ""),
      content_hash: contentHash,
    },
    env,
  );

  // Build the calldata the frontend will use to call registerCollection on-chain
  const txCalldata = await buildRegisterCalldata(collectionId as `0x${string}`, priceWei);

  return new Response(
    JSON.stringify({ collectionId, contentHash, txCalldata }),
    { headers: { "Content-Type": "application/json" } },
  );
}

// The client must sign: `datavault-upload:<collectionId>:<sha256(body)>:<timestamp>`
// and send x-signature and x-timestamp headers alongside the body.
// This prevents any party other than the registered owner from overwriting the collection.
export async function handleUploadCollection(
  req: Request,
  env: Env,
  collectionId: string,
): Promise<Response> {
  const col = await getCollectionRow(collectionId, env);
  if (!col) return new Response("Collection not found", { status: 404 });

  const signature = req.headers.get("x-signature") ?? "";
  const timestampStr = req.headers.get("x-timestamp") ?? "";
  const timestamp = parseInt(timestampStr, 10);

  if (!signature || !timestamp || isNaN(timestamp)) {
    return new Response("Missing x-signature or x-timestamp header", { status: 401 });
  }

  const body = await req.text();
  if (!body.trim()) return new Response("Empty body", { status: 400 });

  const contentHash = await sha256Hex(body);

  const valid = await verifyUploadSignature(
    col.owner_address,
    collectionId,
    contentHash,
    timestamp,
    signature,
  );

  if (!valid) {
    return new Response("Invalid or expired signature", { status: 403 });
  }

  await storeCollection(collectionId, body, env);

  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
