import type { Env } from "../lib/types";
import { getCollectionRow } from "../lib/d1";
import { getOnChainCollection } from "../lib/policy";
import { paidServiceConfigured, operatorMatches } from "../lib/config";
import { rpcMatchesConfiguredChain } from "../lib/chain-identity";
import { isValidBytes32, error400 } from "../lib/validation";
import { authenticatedOwner } from "../lib/wallet-auth";

interface ListedCollection {
  collection_id: string;
  collection_name: string;
  owner_address: string;
  created_at: number;
  confirmed_tx: string | null;
  paid_queries: number;
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function verifiedCollection(row: ListedCollection, env: Env) {
  const policy = await getOnChainCollection(
    row.collection_id as `0x${string}`,
    env
  );
  if (!policy) throw new Error("Monad collection state unavailable");
  if (policy.owner.toLowerCase() !== row.owner_address.toLowerCase())
    return null;
  return {
    collectionId: row.collection_id,
    name: row.collection_name,
    ownerAddress: row.owner_address,
    createdAt: row.created_at,
    registrationTxHash: row.confirmed_tx,
    paidQueries: row.paid_queries,
    priceWei: policy.price.toString(),
    policyVersion: policy.policyVersion,
    active: policy.active,
    queryAvailable:
      policy.active &&
      paidServiceConfigured(env) &&
      operatorMatches(env, policy),
    chainId: Number(env.CHAIN_ID),
    contractAddress: env.CONTRACT_ADDRESS,
  };
}

function pagination(url: URL): { limit: number; offset: number } | null {
  const limitText = url.searchParams.get("limit") ?? "12";
  const offsetText = url.searchParams.get("offset") ?? "0";
  if (!/^\d+$/.test(limitText) || !/^\d+$/.test(offsetText)) return null;
  const limit = Number(limitText);
  const offset = Number(offsetText);
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 24 ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset > 1000
  )
    return null;
  return { limit, offset };
}

export async function handleListCollections(
  req: Request,
  env: Env
): Promise<Response> {
  const url = new URL(req.url);
  const page = pagination(url);
  if (!page)
    return error400("limit must be 1 to 24 and offset must be 0 to 1000");
  const search = (url.searchParams.get("search") ?? "").trim();
  if (search.length > 64)
    return error400("search must be at most 64 characters");
  if (!env.CONTRACT_ADDRESS || !(await rpcMatchesConfiguredChain(env))) {
    return json({ error: "Monad collection catalogue is unavailable." }, 503);
  }

  const searchClause = search
    ? "AND LOWER(c.collection_name) LIKE ? ESCAPE '\\'"
    : "";
  const sql = `SELECT c.collection_id, c.collection_name, c.owner_address, c.created_at, c.confirmed_tx,
            COALESCE(q.paid_queries, 0) AS paid_queries
       FROM collections c
       LEFT JOIN (
         SELECT collection_id, COUNT(*) AS paid_queries FROM queries
          WHERE outcome = 'settled' AND chain_id = ? AND LOWER(contract_address) = ? GROUP BY collection_id
       ) q ON q.collection_id = c.collection_id
      WHERE c.status = 'confirmed' AND c.chain_id = ? AND c.contract_address = ? ${searchClause}
      ORDER BY c.created_at DESC, c.collection_id DESC
      LIMIT ? OFFSET ?`;
  const escapedSearch = search.toLowerCase().replace(/[\\%_]/g, "\\$&");
  const bindings = search
    ? [
        Number(env.CHAIN_ID),
        env.CONTRACT_ADDRESS.toLowerCase(),
        Number(env.CHAIN_ID),
        env.CONTRACT_ADDRESS.toLowerCase(),
        `%${escapedSearch}%`,
        page.limit,
        page.offset,
      ]
    : [
        Number(env.CHAIN_ID),
        env.CONTRACT_ADDRESS.toLowerCase(),
        Number(env.CHAIN_ID),
        env.CONTRACT_ADDRESS.toLowerCase(),
        page.limit,
        page.offset,
      ];
  const result = await env.DB.prepare(sql)
    .bind(...bindings)
    .all<ListedCollection>();

  let checked;
  try {
    checked = await Promise.all(
      result.results.map((row) => verifiedCollection(row, env))
    );
  } catch {
    return json({ error: "Monad collection state is unavailable." }, 503);
  }
  return json({
    collections: checked.filter(
      (row): row is NonNullable<typeof row> => row !== null
    ),
    limit: page.limit,
    offset: page.offset,
    search,
    hasMore: result.results.length === page.limit,
  });
}

export async function handleCollectionDetail(
  env: Env,
  collectionId: string
): Promise<Response> {
  if (!isValidBytes32(collectionId)) return error400("Invalid collection ID");
  if (!env.CONTRACT_ADDRESS || !(await rpcMatchesConfiguredChain(env))) {
    return json({ error: "Monad collection catalogue is unavailable." }, 503);
  }
  const row = await getCollectionRow(collectionId, env);
  if (!row || row.status !== "confirmed")
    return json({ error: "Collection not found." }, 404);
  const count = await env.DB.prepare(
    "SELECT COUNT(*) AS paid_queries FROM queries WHERE collection_id = ? AND outcome = 'settled' AND chain_id = ? AND LOWER(contract_address) = ?"
  )
    .bind(
      collectionId,
      Number(env.CHAIN_ID),
      env.CONTRACT_ADDRESS.toLowerCase()
    )
    .first<{ paid_queries: number }>();
  const collection = await verifiedCollection(
    {
      collection_id: row.collection_id,
      collection_name: row.collection_name,
      owner_address: row.owner_address,
      created_at: row.created_at,
      confirmed_tx: row.confirmed_tx,
      paid_queries: count?.paid_queries ?? 0,
    },
    env
  ).catch(() => undefined);
  if (collection === undefined)
    return json({ error: "Monad collection state is unavailable." }, 503);
  if (collection === null)
    return json({ error: "Collection owner does not match Monad." }, 409);
  return json(collection);
}

export async function handleOwnerCollections(
  req: Request,
  env: Env
): Promise<Response> {
  const owner = await authenticatedOwner(req, env);
  if (owner instanceof Response) return owner;
  const page = pagination(new URL(req.url));
  if (!page)
    return error400("limit must be 1 to 24 and offset must be 0 to 1000");
  if (!(await rpcMatchesConfiguredChain(env))) {
    return json({ error: "Monad collection state is unavailable." }, 503);
  }
  const result = await env.DB.prepare(
    `SELECT c.collection_id, c.collection_name, c.owner_address, c.created_at, c.confirmed_tx,
            COALESCE(q.paid_queries, 0) AS paid_queries
       FROM collections c
       LEFT JOIN (
         SELECT collection_id, COUNT(*) AS paid_queries FROM queries
          WHERE outcome = 'settled' AND chain_id = ? AND LOWER(contract_address) = ? GROUP BY collection_id
       ) q ON q.collection_id = c.collection_id
      WHERE c.status = 'confirmed' AND c.chain_id = ? AND c.contract_address = ? AND c.owner_address = ?
      ORDER BY c.created_at DESC, c.collection_id DESC
      LIMIT ? OFFSET ?`
  )
    .bind(
      Number(env.CHAIN_ID),
      env.CONTRACT_ADDRESS.toLowerCase(),
      Number(env.CHAIN_ID),
      env.CONTRACT_ADDRESS.toLowerCase(),
      owner,
      page.limit,
      page.offset
    )
    .all<ListedCollection>();
  try {
    const checked = await Promise.all(
      result.results.map((row) => verifiedCollection(row, env))
    );
    return json({
      ownerAddress: owner,
      collections: checked.filter(
        (row): row is NonNullable<typeof row> => row !== null
      ),
      limit: page.limit,
      offset: page.offset,
      hasMore: result.results.length === page.limit,
    });
  } catch {
    return json({ error: "Monad collection state is unavailable." }, 503);
  }
}
