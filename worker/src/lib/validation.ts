import { MAX_TEXT_BYTES, MULTIPART_OVERHEAD_BYTES } from '../../../shared/document-text';
// Concrete limits documented in docs/api-contract.md
export const LIMITS = {
  MAX_UPLOAD_BYTES: MAX_TEXT_BYTES,
  MAX_QUESTION_LEN:  500,       // characters
  MAX_PRICE_WEI:     BigInt("10000000000000000000"), // 10 MON
  MIN_PRICE_WEI:     BigInt(1),
} as const;

const HEX_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const HEX_BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;
const HEX_SIG_RE     = /^0x[0-9a-fA-F]{130}$/; // 65-byte ECDSA sig

export function isValidAddress(s: unknown): s is string {
  return typeof s === "string" && HEX_ADDRESS_RE.test(s);
}

export function isValidBytes32(s: unknown): s is string {
  return typeof s === "string" && HEX_BYTES32_RE.test(s);
}

export function isValidSignature(s: unknown): s is string {
  return typeof s === "string" && HEX_SIG_RE.test(s);
}

export function isValidPriceWei(s: unknown): boolean {
  if (typeof s !== "string") return false;
  try {
    const n = BigInt(s);
    return n >= LIMITS.MIN_PRICE_WEI && n <= LIMITS.MAX_PRICE_WEI;
  } catch {
    return false;
  }
}

export function isValidQuestion(s: unknown): s is string {
  return typeof s === "string" && s.trim().length > 0 && s.length <= LIMITS.MAX_QUESTION_LEN;
}

export function isValidTimestamp(ts: unknown): boolean {
  if (typeof ts !== "number" || !Number.isFinite(ts)) return false;
  const age = Date.now() - ts;
  return age >= 0 && age <= 5 * 60 * 1000; // not in future, not older than 5 min
}

export function checkContentLength(req: Request): Response | null {
  const cl = req.headers.get("content-length");
  // Multipart boundaries and form fields add overhead beyond the file limit.
  // The router independently enforces the same envelope allowance.
  const multipart = req.headers.get("content-type")?.startsWith("multipart/form-data");
  const maxBytes = LIMITS.MAX_UPLOAD_BYTES + (multipart ? MULTIPART_OVERHEAD_BYTES : 0);
  if (cl !== null && parseInt(cl, 10) > maxBytes) {
    return error413();
  }
  return null;
}

// ── Consistent error helpers ──────────────────────────────────────

export function error400(detail: string): Response {
  return new Response(JSON.stringify({ error: detail }), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  });
}

export function error401(detail = "Unauthorized"): Response {
  return new Response(JSON.stringify({ error: detail }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

export function error403(detail = "Forbidden"): Response {
  return new Response(JSON.stringify({ error: detail }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });
}

export function error413(): Response {
  return new Response(
    JSON.stringify({ error: `Request body exceeds ${LIMITS.MAX_UPLOAD_BYTES / 1024} KB limit` }),
    { status: 413, headers: { "Content-Type": "application/json" } },
  );
}

export function error429(retryAfter: number): Response {
  return new Response(JSON.stringify({ error: "Too many requests" }), {
    status: 429,
    headers: { "Content-Type": "application/json", "Retry-After": String(retryAfter) },
  });
}
