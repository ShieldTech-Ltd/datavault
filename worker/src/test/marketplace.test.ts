import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../lib/types";
import { privateKeyToAccount } from "viem/accounts";
import { ownerSummaryMessage } from "../../../shared/api";
import {
  handleCollectionDetail,
  handleListCollections,
  handleOwnerCollections,
} from "../routes/marketplace";

const mocks = vi.hoisted(() => ({
  chain: vi.fn(async () => true),
  policy: vi.fn(),
  row: vi.fn(),
}));
vi.mock("../lib/chain-identity", () => ({
  rpcMatchesConfiguredChain: mocks.chain,
}));
vi.mock("../lib/policy", () => ({ getOnChainCollection: mocks.policy }));
vi.mock("../lib/d1", () => ({ getCollectionRow: mocks.row }));

const id = `0x${"ab".repeat(32)}`;
const owner = `0x${"cd".repeat(20)}`;
const signedOwner = privateKeyToAccount(`0x${"39".repeat(32)}`);
const row = {
  collection_id: id,
  collection_name: "Guide",
  owner_address: owner,
  created_at: 123,
  confirmed_tx: `0x${"ef".repeat(32)}`,
  paid_queries: 2,
};
const env = {
  CONTRACT_ADDRESS: `0x${"12".repeat(20)}`,
  CHAIN_ID: "10143",
  SETTLEMENT_PRIVATE_KEY: "",
  MODEL_API_KEY: "",
  DB: {
    prepare: () => ({
      bind: () => ({
        all: async () => ({ results: [row] }),
        first: async () => ({ paid_queries: 2 }),
      }),
    }),
  },
} as unknown as Env;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.chain.mockResolvedValue(true);
  mocks.policy.mockResolvedValue({
    owner,
    price: 1000n,
    active: true,
    policyVersion: 2,
    operator: owner,
  });
  mocks.row.mockResolvedValue({ ...row, status: "confirmed" });
});

describe("public collection catalogue", () => {
  it("returns only on-chain verified public metadata without private content", async () => {
    const response = await handleListCollections(
      new Request("https://example.test/api/collections"),
      env
    );
    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      collections: Array<Record<string, unknown>>;
    };
    expect(data.collections).toHaveLength(1);
    expect(data.collections[0].name).toBe("Guide");
    expect(data.collections[0].priceWei).toBe("1000");
    expect(data.collections[0].queryAvailable).toBe(false);
    expect(JSON.stringify(data)).not.toMatch(/answer|passage|contentHash/);
  });

  it("rejects invalid pagination before reading D1", async () => {
    const response = await handleListCollections(
      new Request("https://example.test/api/collections?limit=999"),
      env
    );
    expect(response.status).toBe(400);
  });

  it("limits search length before any catalogue read", async () => {
    const response = await handleListCollections(
      new Request(
        `https://example.test/api/collections?search=${"x".repeat(65)}`
      ),
      env
    );
    expect(response.status).toBe(400);
    expect(mocks.policy).not.toHaveBeenCalled();
  });

  it("escapes search wildcard characters before querying the catalogue", async () => {
    let query = "";
    let bound: unknown[] = [];
    const searchableEnv = {
      ...env,
      DB: {
        prepare: (sql: string) => {
          query = sql;
          return {
            bind: (...args: unknown[]) => {
              bound = args;
              return { all: async () => ({ results: [] }) };
            },
          };
        },
      },
    } as unknown as Env;
    const response = await handleListCollections(
      new Request("https://example.test/api/collections?search=%25_%5C"),
      searchableEnv
    );
    expect(response.status).toBe(200);
    expect(query).toContain("LIKE ? ESCAPE '\\'");
    expect(bound).toEqual(["%\\%\\_\\\\%", 12, 0]);
  });

  it("does not show a D1 row with a different on-chain owner", async () => {
    mocks.policy.mockResolvedValueOnce({
      owner: `0x${"ff".repeat(20)}`,
      price: 1000n,
      active: true,
      policyVersion: 2,
    });
    const response = await handleListCollections(
      new Request("https://example.test/api/collections"),
      env
    );
    const data = (await response.json()) as { collections: unknown[] };
    expect(data.collections).toHaveLength(0);
  });

  it("reports chain outage instead of an empty marketplace", async () => {
    mocks.policy.mockResolvedValueOnce(null);
    const response = await handleListCollections(
      new Request("https://example.test/api/collections"),
      env
    );
    expect(response.status).toBe(503);
  });

  it("does not reveal a staging collection detail", async () => {
    mocks.row.mockResolvedValueOnce({ ...row, status: "staging" });
    const response = await handleCollectionDetail(env, id);
    expect(response.status).toBe(404);
    expect(mocks.policy).not.toHaveBeenCalled();
  });

  it("requires an owner signature before listing owned collections", async () => {
    const response = await handleOwnerCollections(
      new Request(
        `https://example.test/api/owner/collections?address=${signedOwner.address}`
      ),
      env
    );
    expect(response.status).toBe(401);
    expect(mocks.policy).not.toHaveBeenCalled();
  });

  it("lists only on-chain verified collections for the signing owner", async () => {
    const timestamp = Date.now();
    const signature = await signedOwner.signMessage({
      message: ownerSummaryMessage(
        10143,
        env.CONTRACT_ADDRESS,
        signedOwner.address,
        timestamp
      ),
    });
    const lowerOwner = signedOwner.address.toLowerCase();
    let bound: unknown[] = [];
    const ownerEnv = {
      ...env,
      DB: {
        prepare: () => ({
          bind: (...args: unknown[]) => {
            bound = args;
            return {
              all: async () => ({
                results: [{ ...row, owner_address: lowerOwner }],
              }),
            };
          },
        }),
      },
    } as unknown as Env;
    mocks.policy.mockResolvedValueOnce({
      owner: signedOwner.address,
      price: 1000n,
      active: true,
      policyVersion: 1,
      operator: signedOwner.address,
    });
    const response = await handleOwnerCollections(
      new Request(
        `https://example.test/api/owner/collections?address=${signedOwner.address}`,
        {
          headers: {
            "x-signature": signature,
            "x-timestamp": String(timestamp),
          },
        }
      ),
      ownerEnv
    );
    expect(response.status).toBe(200);
    expect(bound).toEqual([lowerOwner, 12, 0]);
    const body = (await response.json()) as {
      collections: Array<{ name: string }>;
    };
    expect(body.collections).toHaveLength(1);
    expect(body.collections[0].name).toBe("Guide");
  });
});
