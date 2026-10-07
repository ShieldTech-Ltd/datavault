import { verifyMessage } from "viem";
import { ownerSummaryMessage } from "../../../shared/api";
import type { Env } from "./types";
import {
  isValidAddress,
  isValidSignature,
  isValidTimestamp,
  error400,
} from "./validation";

export async function authenticatedOwner(
  req: Request,
  env: Env
): Promise<string | Response> {
  const owner = new URL(req.url).searchParams.get("address");
  if (!isValidAddress(owner))
    return error400("A valid owner address is required.");
  const signature = req.headers.get("x-signature");
  const timestamp = Number(req.headers.get("x-timestamp"));
  if (!isValidSignature(signature) || !isValidTimestamp(timestamp)) {
    return new Response(
      JSON.stringify({ error: "A current owner signature is required." }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
  if (
    !isValidAddress(env.CONTRACT_ADDRESS) ||
    !Number.isSafeInteger(Number(env.CHAIN_ID))
  ) {
    return new Response(
      JSON.stringify({ error: "Owner access is not configured." }),
      {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
  const valid = await verifyMessage({
    address: owner as `0x${string}`,
    message: ownerSummaryMessage(
      Number(env.CHAIN_ID),
      env.CONTRACT_ADDRESS,
      owner,
      timestamp
    ),
    signature: signature as `0x${string}`,
  }).catch(() => false);
  if (!valid)
    return new Response(
      JSON.stringify({ error: "Signature does not match the owner." }),
      {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }
    );
  return owner.toLowerCase();
}
