import { describe, expect, it, vi } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
vi.mock("../lib/chain-identity", () => ({
  rpcMatchesConfiguredChain: vi.fn(async () => true),
}));
import type { Env } from "../lib/types";
import {
  handleMarketplaceAnalytics,
  handleOwnerAnalytics,
} from "../routes/analytics";

const owner = privateKeyToAccount(`0x${"37".repeat(32)}`);
const other = privateKeyToAccount(`0x${"38".repeat(32)}`);
const collectionId = `0x${"ab".repeat(32)}`;
const rows = [
  {
    request_id: `0x${"01".repeat(32)}`,
    collection_id: collectionId,
    collection_name: "Guide",
    buyer_address: other.address,
    amount_wei: "1000000000000000000",
    created_at: Date.now(),
    settled_at: Date.now(),
    settle_tx_hash: `0x${"11".repeat(32)}`,
  },
  {
    request_id: `0x${"02".repeat(32)}`,
    collection_id: collectionId,
    collection_name: "Guide",
    buyer_address: other.address,
    amount_wei: null,
    created_at: Date.now(),
    settled_at: Date.now(),
    settle_tx_hash: `0x${"22".repeat(32)}`,
  },
];

function environment(onPrepare?: (sql: string) => void): Env {
  return {
    CHAIN_ID: "10143",
    CONTRACT_ADDRESS: `0x${"12".repeat(20)}`,
    DB: {
      prepare: (sql: string) => {
        onPrepare?.(sql);
        return {
          bind: (...args: unknown[]) => ({
            all: async () => ({
              results:
                sql.includes("FROM queries") &&
                (!sql.includes("c.owner_address") ||
                  args[8] === owner.address.toLowerCase())
                  ? rows
                  : [],
            }),
            first: async () => ({ count: 1 }),
          }),
          first: async () => ({ count: 1 }),
        };
      },
    },
  } as unknown as Env;
}

describe("recorded product analytics", () => {
  it("does not show stale records without a configured contract", async () => {
    const response = await handleMarketplaceAnalytics({
      ...environment(),
      CONTRACT_ADDRESS: "",
    });
    expect(response.status).toBe(503);
  });
  it("counts settlements in the last 30 days by settlement time", async () => {
    const prepare = vi.fn();
    await handleMarketplaceAnalytics(environment(prepare));
    const paymentsSql = prepare.mock.calls
      .map(([sql]) => sql as string)
      .find((sql) => sql.includes("FROM queries"));
    expect(paymentsSql).toContain("q.settled_at >= ?");
    expect(paymentsSql).toContain(
      "q.chain_id = ? AND LOWER(q.contract_address) = ?"
    );
    expect(paymentsSql).toContain("c.chain_id = ? AND c.contract_address = ?");
    expect(paymentsSql).toContain("q.settled_at < ?");
  });
  it("sums exact wei and discloses missing historical amount coverage", async () => {
    const response = await handleMarketplaceAnalytics(environment());
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      recordedRevenueWei: string;
      revenueCoverage: { knownAmounts: number; settledQueries: number };
      topCollections: Array<{ recordedRevenueWei: string }>;
      rankingAvailable: boolean;
    };
    expect(body.recordedRevenueWei).toBe("1000000000000000000");
    expect(body.revenueCoverage).toEqual({
      knownAmounts: 1,
      settledQueries: 2,
    });
    expect(body.rankingAvailable).toBe(false);
    expect(body.topCollections).toEqual([]);
    expect(JSON.stringify(body)).not.toContain("answer_text");
  });

  it("rejects an owner summary signed by a different wallet", async () => {
    const timestamp = Date.now();
    const signature = await other.signMessage({
      message: `datavault-owner-summary:10143:${`0x${"12".repeat(
        20
      )}`}:${owner.address.toLowerCase()}:${timestamp}`,
    });
    const response = await handleOwnerAnalytics(
      new Request(
        `https://example.test/api/owner/analytics?address=${owner.address}`,
        {
          headers: {
            "x-signature": signature,
            "x-timestamp": String(timestamp),
          },
        }
      ),
      environment()
    );
    expect(response.status).toBe(403);
  });

  it("returns an owner summary only with a current matching signature", async () => {
    const timestamp = Date.now();
    const signature = await owner.signMessage({
      message: `datavault-owner-summary:10143:${`0x${"12".repeat(
        20
      )}`}:${owner.address.toLowerCase()}:${timestamp}`,
    });
    const response = await handleOwnerAnalytics(
      new Request(
        `https://example.test/api/owner/analytics?address=${owner.address}`,
        {
          headers: {
            "x-signature": signature,
            "x-timestamp": String(timestamp),
          },
        }
      ),
      environment()
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ownerAddress: string;
      paidQueries: number;
    };
    expect(body.ownerAddress).toBe(owner.address.toLowerCase());
    expect(body.paidQueries).toBe(2);
  });
});
