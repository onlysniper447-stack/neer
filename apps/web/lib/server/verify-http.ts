import "./node-only";
import { FINDING_CODES, VERIFY_VERSION, type FindingCode } from "@neer/verify";
import { apiHeaders } from "./http-node";

const knownCodes: ReadonlySet<string> = new Set(FINDING_CODES);

/** No request values, messages, IPs, identifiers or exception objects enter this record. */
export function logVerification(status: number, codes: readonly FindingCode[] = []): void {
  const record = {
    timestamp: new Date().toISOString(),
    status,
    findingCodes: codes.filter((code) => knownCodes.has(code)),
    version: VERIFY_VERSION,
  };
  try { console.info(JSON.stringify(record)); } catch { /* A failed logger must not expose an exception. */ }
}

export function verifyHeaders(): Headers {
  const headers = apiHeaders(crypto.randomUUID());
  headers.set("X-Neer-Verify-Version", VERIFY_VERSION);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Access-Control-Expose-Headers", "X-Neer-Verify-Version, Retry-After");
  return headers;
}

/** Node API transport calls this before touching headers or constructing a body stream. */
export function verifyMethodResponse(method: string): Response | null {
  if (method === "POST") return null;
  const headers = verifyHeaders();
  if (method === "OPTIONS") {
    logVerification(204);
    return new Response(null, { status: 204, headers });
  }
  headers.set("Allow", "POST, OPTIONS");
  logVerification(405);
  return new Response(method === "HEAD" ? null : JSON.stringify({ error: "method_not_allowed" }), {
    status: 405,
    headers: new Headers([...headers, ["Content-Type", "application/json"]]),
  });
}

/** A single sanitized fallback for both transport setup and business-handler errors. */
export function verifyInternalErrorResponse(headers = verifyHeaders()): Response {
  logVerification(500);
  return Response.json({ error: "internal_error" }, { status: 500, headers });
}
