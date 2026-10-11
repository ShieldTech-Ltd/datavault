import { describe, expect, it } from "vitest";
import { MockR2Bucket, makeEnv } from "./helpers";
import { retrieveCitedPassages, retrievePassages, storeCollection } from "../lib/r2";
import { keccak256, toBytes } from "viem";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const collectionId = `0x${"aa".repeat(32)}`;
const hash = (content: string) => keccak256(toBytes(content));

describe("bounded private passages", () => {
  it("keeps a short valid document queryable", async () => {
    const env = makeEnv({ COLLECTION_STORE: new MockR2Bucket() });
    const content = "Short guide.";
    const contentHash = hash(content);
    await storeCollection(collectionId, content, contentHash, env as never);
    const result = await retrievePassages(collectionId, "guide", contentHash, env as never);
    expect(result.passages).toEqual(["Short guide."]);
    expect(result.passageIds).toEqual([`${contentHash}:chunk-0`]);
  });

  it("bounds a long unbroken paragraph before model use and reconstructs the same citation", async () => {
    const env = makeEnv({ COLLECTION_STORE: new MockR2Bucket() });
    const content = `${"topic ".repeat(12_000)}${"z".repeat(20_000)}`;
    const contentHash = hash(content);
    await storeCollection(collectionId, content, contentHash, env as never);
    const result = await retrievePassages(collectionId, "topic", contentHash, env as never);
    expect(result.passages.length).toBeGreaterThan(0);
    expect(result.passages.length).toBeLessThanOrEqual(4);
    for (const passage of result.passages) {
      expect(passage.length).toBeLessThanOrEqual(4_000);
      expect(passage.trim().split(/\s+/u).length).toBeLessThanOrEqual(600);
    }
    const cited = await retrieveCitedPassages(collectionId, contentHash, result.passageIds, env as never);
    expect(cited.map((item) => item.text)).toEqual(result.passages);
  });

  it("rejects content whose bytes no longer match the confirmed hash", async () => {
    const store = new MockR2Bucket();
    const env = makeEnv({ COLLECTION_STORE: store });
    const contentHash = hash("Original guide.");
    await storeCollection(collectionId, "Original guide.", contentHash, env as never);
    await store.put(`collections/${collectionId}/v/${contentHash}.md`, "Changed guide.");
    await expect(retrievePassages(collectionId, "guide", contentHash, env as never))
      .rejects.toThrow("integrity verification");
    expect(await retrieveCitedPassages(collectionId, contentHash, [`${contentHash}:chunk-0`], env as never))
      .toEqual([]);
  });

  it("returns focused, versioned passages for the public sample questions", async () => {
    const env = makeEnv({ COLLECTION_STORE: new MockR2Bucket() });
    const content = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../../demo/uk-practical-guide.md"), "utf8");
    const contentHash = hash(content);
    await storeCollection(collectionId, content, contentHash, env as never);
    for (const [question, section] of [
      ["What information should a freelancer include on an invoice?", "What to put on an invoice"],
      ["Why might a sole trader use a separate business bank account?", "Why separate business and personal banking"],
      ["What records should a freelancer keep for business expenses?", "Records for business expenses"],
    ]) {
      const result = await retrievePassages(collectionId, question, contentHash, env as never);
      expect(result.passages[0]).toContain(section);
      expect(result.passages[0].length).toBeLessThanOrEqual(1_600);
      const cited = await retrieveCitedPassages(collectionId, contentHash, [result.passageIds[0]], env as never);
      expect(cited[0].text).toBe(result.passages[0]);
    }
  });
});
