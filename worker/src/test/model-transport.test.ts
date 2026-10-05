import { describe, expect, it, vi } from "vitest";
import { callModel } from "../lib/model";
import type { Env } from "../lib/types";

describe("model credential transport", () => {
  it("rejects an HTTP endpoint before sending the model key", async () => {
    const originalFetch = globalThis.fetch;
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as typeof fetch;
    try {
      await expect(callModel("Question?", ["Source passage"], ["chunk-0"], {
        MODEL_API_KEY: "private-test-key", MODEL_API_BASE: "http://model.example.org/v1",
      } as Env)).rejects.toThrow(/HTTPS/);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally { globalThis.fetch = originalFetch; }
  });

  it("rejects credentials embedded in a model endpoint URL", async () => {
    await expect(callModel("Question?", ["Source passage"], ["chunk-0"], {
      MODEL_API_KEY: "private-test-key", MODEL_API_BASE: "https://user:pass@model.example.org/v1",
    } as Env)).rejects.toThrow(/embedded credentials/);
  });
});
