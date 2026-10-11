import { describe, expect, it, vi } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { buyerHistoryMessage } from "../../../shared/api";
import type { Env } from "../lib/types";
import { handleBuyerHistory } from "../routes/buyer-history";

const buyer = privateKeyToAccount(`0x${"43".repeat(32)}`);
const stranger = privateKeyToAccount(`0x${"44".repeat(32)}`);
const contract = `0x${"12".repeat(20)}`;
const requestId = `0x${"ab".repeat(32)}`;

function environment() {
  const prepare = vi.fn((sql: string) => ({
    bind: (...args: unknown[]) => ({
      all: async () => ({
        results: [
          {
            request_id: requestId,
            collection_id: `0x${"cd".repeat(32)}`,
            collection_name: "Guide",
            open_tx_hash: `0x${"ef".repeat(32)}`,
            settle_tx_hash: `0x${"11".repeat(32)}`,
            amount_wei: "1000",
            outcome: "settled",
            created_at: 123,
            settled_at: 456,
            answer_text: "Private answer",
          },
        ],
      }),
      args,
    }),
    sql,
  }));
  return {
    env: {
      CHAIN_ID: "10143",
      CONTRACT_ADDRESS: contract,
      DB: { prepare },
    } as unknown as Env,
    prepare,
  };
}

describe("signed buyer request history", () => {
  it("requires the buyer signature before reading D1", async () => {
    const { env, prepare } = environment();
    const response = await handleBuyerHistory(
      new Request(
        `https://example.test/api/buyer/queries?address=${buyer.address}`
      ),
      env
    );
    expect(response.status).toBe(401);
    expect(prepare).not.toHaveBeenCalled();
  });

  it("rejects a signature by a different wallet", async () => {
    const { env, prepare } = environment();
    const timestamp = Date.now();
    const signature = await stranger.signMessage({
      message: buyerHistoryMessage(10143, contract, buyer.address, timestamp),
    });
    const response = await handleBuyerHistory(
      new Request(
        `https://example.test/api/buyer/queries?address=${buyer.address}`,
        {
          headers: {
            "x-signature": signature,
            "x-timestamp": String(timestamp),
          },
        }
      ),
      env
    );
    expect(response.status).toBe(403);
    expect(prepare).not.toHaveBeenCalled();
  });

  it("returns deployment-scoped metadata without answer text", async () => {
    const { env, prepare } = environment();
    const timestamp = Date.now();
    const signature = await buyer.signMessage({
      message: buyerHistoryMessage(10143, contract, buyer.address, timestamp),
    });
    const response = await handleBuyerHistory(
      new Request(
        `https://example.test/api/buyer/queries?address=${buyer.address}`,
        {
          headers: {
            "x-signature": signature,
            "x-timestamp": String(timestamp),
          },
        }
      ),
      env
    );
    expect(response.status).toBe(200);
    const statement = prepare.mock.calls[0][0];
    expect(statement).toContain("LOWER(q.buyer_address) = ?");
    expect(statement).toContain("LOWER(q.contract_address) = ?");
    const body = (await response.json()) as {
      requests: Array<{ requestId: string }>;
    };
    expect(body.requests[0].requestId).toBe(requestId);
    expect(JSON.stringify(body)).not.toContain("Private answer");
  });
});
