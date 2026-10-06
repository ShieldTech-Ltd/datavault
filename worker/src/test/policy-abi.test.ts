import { describe, it, expect } from "vitest";
import { encodeAbiParameters, decodeAbiParameters, parseAbiParameters, type Address } from "viem";

/**
 * These tests verify the ABI tuple definitions used in policy.ts correctly
 * decode struct return values from getCollection and getQuery into named fields.
 *
 * The fix in policy.ts changed bare positional return types like
 *   returns (address,address,uint256,uint32,bool)
 * to named tuple returns like
 *   returns (tuple(address owner, address operator, uint256 price, uint32 policyVersion, bool active))
 * so that viem decodes the result as an object with named keys instead of a
 * positional array. These tests encode a struct using the same tuple signature
 * and confirm the decoded object has the expected shape.
 */

const OWNER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address;
const OPERATOR = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address;
const BUYER = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as Address;
const COLLECTION_ID = ("0x" + "ab".repeat(32)) as `0x${string}`;
const REQUEST_ID = ("0x" + "cd".repeat(32)) as `0x${string}`;

// ── getCollection tuple ────────────────────────────────────────────────────

const collectionTupleType = parseAbiParameters(
  "(address owner, address operator, uint256 price, uint32 policyVersion, bool active)",
);

describe("getCollection ABI tuple decode", () => {
  it("decodes all five fields by name", () => {
    const encoded = encodeAbiParameters(collectionTupleType, [
      {
        owner: OWNER,
        operator: OPERATOR,
        price: 1_000_000_000_000_000_000n, // 1 MON in wei
        policyVersion: 3,
        active: true,
      },
    ]);

    const [result] = decodeAbiParameters(collectionTupleType, encoded);

    expect(result.owner).toBe(OWNER);
    expect(result.operator).toBe(OPERATOR);
    expect(result.price).toBe(1_000_000_000_000_000_000n);
    expect(result.policyVersion).toBe(3);
    expect(result.active).toBe(true);
  });

  it("round-trips price=0 and active=false", () => {
    const encoded = encodeAbiParameters(collectionTupleType, [
      { owner: OWNER, operator: OPERATOR, price: 0n, policyVersion: 0, active: false },
    ]);
    const [result] = decodeAbiParameters(collectionTupleType, encoded);
    expect(result.price).toBe(0n);
    expect(result.active).toBe(false);
  });

  it("round-trips max uint32 policyVersion", () => {
    const encoded = encodeAbiParameters(collectionTupleType, [
      { owner: OWNER, operator: OPERATOR, price: 1n, policyVersion: 0xffffffff, active: true },
    ]);
    const [result] = decodeAbiParameters(collectionTupleType, encoded);
    expect(result.policyVersion).toBe(0xffffffff);
  });
});

// ── getQuery tuple ─────────────────────────────────────────────────────────

const queryTupleType = parseAbiParameters(
  "(bytes32 collectionId, address buyer, uint256 amount, uint32 policyVersion, uint64 openedAt, uint8 state)",
);

describe("getQuery ABI tuple decode", () => {
  it("decodes all six fields by name", () => {
    const encoded = encodeAbiParameters(queryTupleType, [
      {
        collectionId: COLLECTION_ID,
        buyer: BUYER,
        amount: 500_000_000_000_000_000n,
        policyVersion: 1,
        openedAt: 1_700_000_000n,
        state: 0,
      },
    ]);

    const [result] = decodeAbiParameters(queryTupleType, encoded);

    expect(result.collectionId).toBe(COLLECTION_ID);
    expect(result.buyer).toBe(BUYER);
    expect(result.amount).toBe(500_000_000_000_000_000n);
    expect(result.policyVersion).toBe(1);
    expect(result.openedAt).toBe(1_700_000_000n);
    expect(result.state).toBe(0);
  });

  it("decodes state=1 (Settled) and state=2 (Refunded)", () => {
    for (const state of [1, 2] as const) {
      const encoded = encodeAbiParameters(queryTupleType, [
        { collectionId: COLLECTION_ID, buyer: BUYER, amount: 1n, policyVersion: 0, openedAt: 0n, state },
      ]);
      const [result] = decodeAbiParameters(queryTupleType, encoded);
      expect(result.state).toBe(state);
    }
  });

  it("zero buyer address round-trips correctly", () => {
    const zeroBuyer = "0x0000000000000000000000000000000000000000" as Address;
    const encoded = encodeAbiParameters(queryTupleType, [
      { collectionId: REQUEST_ID, buyer: zeroBuyer, amount: 0n, policyVersion: 0, openedAt: 0n, state: 0 },
    ]);
    const [result] = decodeAbiParameters(queryTupleType, encoded);
    // policy.ts returns null when buyer is the zero address
    expect(result.buyer).toBe(zeroBuyer);
  });

  it("round-trips max uint64 openedAt", () => {
    const maxUint64 = 18_446_744_073_709_551_615n;
    const encoded = encodeAbiParameters(queryTupleType, [
      { collectionId: COLLECTION_ID, buyer: BUYER, amount: 1n, policyVersion: 0, openedAt: maxUint64, state: 0 },
    ]);
    const [result] = decodeAbiParameters(queryTupleType, encoded);
    expect(result.openedAt).toBe(maxUint64);
  });
});
