import { describe, expect, it } from "vitest";
import { keccak256, toBytes } from "viem";
import { makeEnv } from "./helpers";
import { paidServiceConfigured, settlementKeyConfigured } from "../lib/config";

describe("settlement key release guard", () => {
  it("rejects the low-integer example previously present in Git history", () => {
    expect(settlementKeyConfigured(`0x${"0".repeat(63)}1`)).toBe(false);
  });

  it("rejects repeated-byte and public Hardhat test keys", () => {
    expect(settlementKeyConfigured(`0x${"33".repeat(32)}`)).toBe(false);
    expect(settlementKeyConfigured(`0x${"aA".repeat(32)}`)).toBe(false);
    expect(settlementKeyConfigured(makeEnv().SETTLEMENT_PRIVATE_KEY)).toBe(false);
  });

  it("allows a valid operator key shape while requiring the other service settings", () => {
    const key = keccak256(toBytes("datavault-test-operator"));
    expect(settlementKeyConfigured(key)).toBe(true);
    const env = makeEnv({ CONTRACT_ADDRESS: `0x${"aa".repeat(20)}`, SETTLEMENT_PRIVATE_KEY: key });
    expect(paidServiceConfigured(env as never)).toBe(true);
    expect(paidServiceConfigured({ ...env, MODEL_API_KEY: "" } as never)).toBe(false);
  });
});
