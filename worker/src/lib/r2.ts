import type { Env } from "./types";
import type { CitedPassage } from "../../../shared/api";
import { keccak256, toBytes } from "viem";

const MAX_PASSAGE_WORDS = 600;
const MAX_PASSAGE_CHARS = 4_000;

// Store immutable content under its verified hash. The confirmed D1 record
// selects the version used for paid retrieval.
export async function storeCollection(
  collectionId: string,
  content: string,
  contentHash: string,
  env: Env,
): Promise<void> {
  if (keccak256(toBytes(content)).toLowerCase() !== contentHash.toLowerCase())
    throw new Error("Collection content hash does not match its bytes");
  const versionKey = `collections/${collectionId}/v/${contentHash}.md`;

  await env.COLLECTION_STORE.put(versionKey, content, {
    httpMetadata: { contentType: "text/markdown" },
    customMetadata: { collectionId, contentHash },
  });

}

export async function retrievePassages(
  collectionId: string,
  query: string,
  expectedContentHash: string,
  env: Env,
): Promise<{ passages: string[]; passageIds: string[]; contentHash: string }> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(expectedContentHash))
    throw new Error("Confirmed collection content hash is invalid");
  const obj = await env.COLLECTION_STORE.get(`collections/${collectionId}/v/${expectedContentHash}.md`);
  if (!obj) throw new Error("Collection content version not found in storage");

  const content = await obj.text();
  if (keccak256(toBytes(content)).toLowerCase() !== expectedContentHash.toLowerCase())
    throw new Error("Collection content failed integrity verification");
  const chunks = splitIntoChunks(content);

  // Simple keyword relevance ranking. Replace with vector search in production.
  const queryWords = query
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 3);

  const scored = chunks.map((chunk, i) => {
    const lower = chunk.toLowerCase();
    const score = queryWords.reduce((acc, w) => acc + (lower.split(w).length - 1), 0);
    return { chunk, score, id: `chunk-${i}` };
  });

  scored.sort((a, b) => b.score - a.score);

  const top = scored.slice(0, 4);
  // Prefix passage IDs with the contentHash so citations are pinned to the
  // exact content version and remain verifiable after re-uploads.
  return {
    passages: top.map((t) => t.chunk),
    passageIds: top.map((t) => `${expectedContentHash}:${t.id}`),
    contentHash: expectedContentHash,
  };
}

export async function retrieveCitedPassages(
  collectionId: string,
  contentHash: string | null,
  passageIds: string[],
  env: Env,
): Promise<CitedPassage[]> {
  if (!contentHash || !/^0x[0-9a-fA-F]{64}$/.test(contentHash)) return [];
  const object = await env.COLLECTION_STORE.get(`collections/${collectionId}/v/${contentHash}.md`);
  if (!object) return [];
  const content = await object.text();
  if (keccak256(toBytes(content)).toLowerCase() !== contentHash.toLowerCase()) return [];
  const chunks = splitIntoChunks(content);
  return passageIds.flatMap((id) => {
    const match = /^(.+):chunk-(\d+)$/.exec(id);
    if (!match || match[1].toLowerCase() !== contentHash.toLowerCase()) return [];
    const text = chunks[Number(match[2])];
    return text ? [{ id, text, version: contentHash }] : [];
  });
}

function splitIntoChunks(text: string): string[] {
  // Bound both words and characters. A single unbroken token or long paragraph
  // must never turn a 500 KB upload into a 500 KB model prompt passage.
  const words = text.match(/\S+/gu) ?? [];
  const chunks: string[] = [];
  let current = "";
  let count = 0;
  const flush = () => {
    if (current) chunks.push(current);
    current = "";
    count = 0;
  };
  const append = (part: string) => {
    const extra = current ? 1 : 0;
    if (current && (count >= MAX_PASSAGE_WORDS || current.length + extra + part.length > MAX_PASSAGE_CHARS)) flush();
    current = current ? `${current} ${part}` : part;
    count++;
  };
  for (const word of words) {
    let part = "";
    for (const scalar of word) {
      if (part.length + scalar.length > MAX_PASSAGE_CHARS) {
        append(part);
        part = "";
      }
      part += scalar;
    }
    if (part) append(part);
  }
  flush();
  return chunks;
}
