import { describe, it, expect } from "vitest";
import {
  isValidAddress, isValidBytes32, isValidSignature,
  isValidPriceWei, isValidQuestion, isValidTimestamp,
  checkContentLength, LIMITS,
} from "../lib/validation";

describe("isValidAddress", () => {
  it("accepts a valid 20-byte hex address", () => {
    expect(isValidAddress("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266")).toBe(true);
  });
  it("rejects missing 0x prefix", () => {
    expect(isValidAddress("f39Fd6e51aad88F6F4ce6aB8827279cffFb92266")).toBe(false);
  });
  it("rejects 32-byte hash", () => {
    expect(isValidAddress("0x" + "a".repeat(64))).toBe(false);
  });
  it("rejects null", () => {
    expect(isValidAddress(null)).toBe(false);
  });
});

describe("isValidBytes32", () => {
  it("accepts a valid 32-byte hex", () => {
    expect(isValidBytes32("0x" + "ab".repeat(32))).toBe(true);
  });
  it("rejects a 20-byte address", () => {
    expect(isValidBytes32("0x" + "ab".repeat(20))).toBe(false);
  });
  it("rejects non-hex chars", () => {
    expect(isValidBytes32("0x" + "zz".repeat(32))).toBe(false);
  });
});

describe("isValidSignature", () => {
  it("accepts a valid 65-byte ECDSA signature", () => {
    expect(isValidSignature("0x" + "cd".repeat(65))).toBe(true);
  });
  it("rejects a 64-byte value", () => {
    expect(isValidSignature("0x" + "cd".repeat(64))).toBe(false);
  });
  it("rejects empty string", () => {
    expect(isValidSignature("")).toBe(false);
  });
});

describe("isValidPriceWei", () => {
  it("accepts 1 wei", () => {
    expect(isValidPriceWei("1")).toBe(true);
  });
  it("accepts 10 MON", () => {
    expect(isValidPriceWei(LIMITS.MAX_PRICE_WEI.toString())).toBe(true);
  });
  it("rejects zero", () => {
    expect(isValidPriceWei("0")).toBe(false);
  });
  it("rejects over 10 MON", () => {
    expect(isValidPriceWei((LIMITS.MAX_PRICE_WEI + 1n).toString())).toBe(false);
  });
  it("rejects non-numeric string", () => {
    expect(isValidPriceWei("abc")).toBe(false);
  });
  it("rejects number type", () => {
    expect(isValidPriceWei(100 as unknown as string)).toBe(false);
  });
});

describe("isValidQuestion", () => {
  it("accepts a short question", () => {
    expect(isValidQuestion("What is the tax rate?")).toBe(true);
  });
  it("accepts exactly 500 chars", () => {
    expect(isValidQuestion("a".repeat(500))).toBe(true);
  });
  it("rejects 501 chars", () => {
    expect(isValidQuestion("a".repeat(501))).toBe(false);
  });
  it("rejects whitespace-only string", () => {
    expect(isValidQuestion("   ")).toBe(false);
  });
  it("rejects empty string", () => {
    expect(isValidQuestion("")).toBe(false);
  });
});

describe("isValidTimestamp", () => {
  it("accepts a timestamp from 1 second ago", () => {
    expect(isValidTimestamp(Date.now() - 1000)).toBe(true);
  });
  it("accepts a timestamp from 4 minutes ago", () => {
    expect(isValidTimestamp(Date.now() - 4 * 60 * 1000)).toBe(true);
  });
  it("rejects a timestamp older than 5 minutes", () => {
    expect(isValidTimestamp(Date.now() - 6 * 60 * 1000)).toBe(false);
  });
  it("rejects a future timestamp", () => {
    expect(isValidTimestamp(Date.now() + 5000)).toBe(false);
  });
  it("rejects NaN", () => {
    expect(isValidTimestamp(NaN)).toBe(false);
  });
});

describe("checkContentLength", () => {
  it("returns null when content-length is within limit", () => {
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "content-length": "1000" },
    });
    expect(checkContentLength(req)).toBeNull();
  });

  it("returns 413 when content-length exceeds limit", () => {
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "content-length": String(LIMITS.MAX_UPLOAD_BYTES + 1) },
    });
    const res = checkContentLength(req);
    expect(res?.status).toBe(413);
  });

  it("returns null when content-length header is absent", () => {
    const req = new Request("http://localhost", { method: "POST" });
    expect(checkContentLength(req)).toBeNull();
  });
});
