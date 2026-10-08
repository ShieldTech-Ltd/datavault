import { describe, expect, it } from "vitest";
import { MockR2Bucket, makeEnv } from "./helpers";
import { retrieveCitedPassages, retrievePassages, storeCollection } from "../lib/r2";

const collectionId = `0x${"aa".repeat(32)}`;
const contentHash = `0x${"bb".repeat(32)}`;

describe("bounded private passages", () => {
  it("keeps a short valid document queryable", async () => {
    const env = makeEnv({ COLLECTION_STORE: new MockR2Bucket() });
    await storeCollection(collectionId, "Short guide.", contentHash, env as never);
    const result = await retrievePassages(collectionId, "guide", env as never);
    expect(result.passages).toEqual(["Short guide."]);
    expect(result.passageIds).toEqual([`${contentHash}:chunk-0`]);
  });

  it("bounds a long unbroken paragraph before model use and reconstructs the same citation", async () => {
    const env = makeEnv({ COLLECTION_STORE: new MockR2Bucket() });
    const content = `${"topic ".repeat(12_000)}${"z".repeat(20_000)}`;
    await storeCollection(collectionId, content, contentHash, env as never);
    const result = await retrievePassages(collectionId, "topic", env as never);
    expect(result.passages.length).toBeGreaterThan(0);
    expect(result.passages.length).toBeLessThanOrEqual(4);
    for (const passage of result.passages) {
      expect(passage.length).toBeLessThanOrEqual(4_000);
      expect(passage.trim().split(/\s+/u).length).toBeLessThanOrEqual(600);
    }
    const cited = await retrieveCitedPassages(collectionId, contentHash, result.passageIds, env as never);
    expect(cited.map((item) => item.text)).toEqual(result.passages);
  });
});
