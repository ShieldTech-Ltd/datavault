import type { Env } from "./types";

// Stores content at an immutable versioned key (by content hash) and updates
// the 'latest' pointer. A changed document gets a new versioned key, preserving
// the old version for any in-flight queries that already opened escrow against it.
export async function storeCollection(
  collectionId: string,
  content: string,
  contentHash: string,
  env: Env,
): Promise<void> {
  const versionKey = `collections/${collectionId}/v/${contentHash}.md`;
  const latestKey  = `collections/${collectionId}/latest`;

  await env.COLLECTION_STORE.put(versionKey, content, {
    httpMetadata: { contentType: "text/markdown" },
    customMetadata: { collectionId, contentHash },
  });

  // Update the latest pointer so retrievePassages always reads the current version
  await env.COLLECTION_STORE.put(latestKey, contentHash, {
    httpMetadata: { contentType: "text/plain" },
    customMetadata: { collectionId },
  });
}

export async function retrievePassages(
  collectionId: string,
  query: string,
  env: Env,
): Promise<{ passages: string[]; passageIds: string[] }> {
  // Resolve the latest content hash pointer, then fetch the versioned object.
  const latestObj = await env.COLLECTION_STORE.get(`collections/${collectionId}/latest`);
  if (!latestObj) throw new Error("Collection not found in storage");
  const contentHash = (await latestObj.text()).trim();

  const obj = await env.COLLECTION_STORE.get(`collections/${collectionId}/v/${contentHash}.md`);
  if (!obj) throw new Error("Collection content version not found in storage");

  const content = await obj.text();
  const chunks = splitIntoChunks(content, 600);

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
  return {
    passages: top.map((t) => t.chunk),
    passageIds: top.map((t) => t.id),
  };
}

function splitIntoChunks(text: string, targetWords: number): string[] {
  const paragraphs = text.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    const wordCount = (current + " " + para).trim().split(/\s+/).length;
    if (wordCount > targetWords && current) {
      chunks.push(current.trim());
      current = para;
    } else {
      current = current ? current + "\n\n" + para : para;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  return chunks.filter((c) => c.length > 50);
}
