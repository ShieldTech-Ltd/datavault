import { describe, expect, it } from "vitest";
import { collectionIdFor } from "../lib/collection-id";

const owner = `0x${"ab".repeat(20)}`;
const contract = `0x${"cd".repeat(20)}`;
const hash = `0x${"ef".repeat(32)}`;

describe("collection deployment identity", () => {
  it("keeps the same owner and content stable within a deployment", () => {
    expect(collectionIdFor(10143, contract, owner, hash)).toBe(
      collectionIdFor(10143, contract.toUpperCase(), owner.toUpperCase(), hash.toUpperCase())
    );
  });

  it("assigns a distinct ID after a contract or chain migration", () => {
    const original = collectionIdFor(10143, contract, owner, hash);
    expect(collectionIdFor(10143, `0x${"12".repeat(20)}`, owner, hash)).not.toBe(original);
    expect(collectionIdFor(31337, contract, owner, hash)).not.toBe(original);
  });

  it("assigns different IDs to different owners or content", () => {
    const original = collectionIdFor(10143, contract, owner, hash);
    expect(collectionIdFor(10143, contract, `0x${"34".repeat(20)}`, hash)).not.toBe(original);
    expect(collectionIdFor(10143, contract, owner, `0x${"56".repeat(32)}`)).not.toBe(original);
  });
});
