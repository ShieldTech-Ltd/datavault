import { parseEventLogs } from "viem";
import { CONTRACT_ADDRESS, DATAVAULT_ABI, viemClient } from "./contract";

interface AnswerAnchor {
  answer: string;
  requestId: string;
  responseDigest: string;
  settleTxHash: string | null;
}

export async function verifyAnswerAnchor(
  record: AnswerAnchor
): Promise<"verified" | "unavailable" | "mismatch"> {
  if (!CONTRACT_ADDRESS || !record.settleTxHash) return "unavailable";
  const contractAddress = CONTRACT_ADDRESS;
  if (!/^sha256:[0-9a-fA-F]{64}$/.test(record.responseDigest))
    return "unavailable";
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(record.answer)
  );
  const calculated = Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  if (`sha256:${calculated}` !== record.responseDigest.toLowerCase())
    return "mismatch";
  try {
    const receipt = await viemClient.getTransactionReceipt({
      hash: record.settleTxHash as `0x${string}`,
    });
    if (receipt.status !== "success") return "mismatch";
    const logs = parseEventLogs({
      abi: DATAVAULT_ABI,
      eventName: "QuerySettled",
      logs: receipt.logs.filter(
        (log) => log.address.toLowerCase() === contractAddress.toLowerCase()
      ),
      strict: true,
    });
    return logs.some(
      (log) =>
        log.args.requestId.toLowerCase() === record.requestId.toLowerCase() &&
        log.args.answerDigest.toLowerCase() === `0x${calculated}`
    )
      ? "verified"
      : "mismatch";
  } catch {
    return "unavailable";
  }
}
