import { verifyMessage } from "viem";
import { buyerHistoryMessage, ownerSummaryMessage } from "../../../shared/api";
import type { Env } from "./types";
import {
  isValidAddress,
  isValidSignature,
  isValidTimestamp,
  error400,
} from "./validation";

async function authenticatedWallet(
  req: Request,
  env: Env,
  purpose: "owner" | "buyer"
): Promise<string | Response> {
  const address = new URL(req.url).searchParams.get("address");
  if (!isValidAddress(address))
    return error400("A valid wallet address is required.");
  const signature = req.headers.get("x-signature");
  const timestamp = Number(req.headers.get("x-timestamp"));
  if (!isValidSignature(signature) || !isValidTimestamp(timestamp)) {
    return new Response(
      JSON.stringify({ error: "A current wallet signature is required." }),
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
      JSON.stringify({ error: "Wallet access is not configured." }),
      {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
  const valid = await verifyMessage({
    address: address as `0x${string}`,
    message: (purpose === "owner" ? ownerSummaryMessage : buyerHistoryMessage)(
      Number(env.CHAIN_ID),
      env.CONTRACT_ADDRESS,
      address,
      timestamp
    ),
    signature: signature as `0x${string}`,
  }).catch(() => false);
  if (!valid)
    return new Response(
      JSON.stringify({ error: "Signature does not match the wallet." }),
      {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }
    );
  return address.toLowerCase();
}

export const authenticatedOwner = (req: Request, env: Env) =>
  authenticatedWallet(req, env, "owner");
export const authenticatedBuyer = (req: Request, env: Env) =>
  authenticatedWallet(req, env, "buyer");
