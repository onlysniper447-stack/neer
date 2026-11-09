import "./node-only";
import { apiHeaders } from "./http-node";
import { clientIp } from "./rate-limit-node";
import { rheaRateLimit, type RheaBucket } from "./rhea-rate-limit";
import { RheaError } from "./rhea-node";

export const RHEA_MAX_BODY_BYTES = 4 * 1024;

export function newRheaRequestId(): string {
  return `rhea_${crypto.randomUUID()}`;
}

/** Same-origin only: no CORS headers are ever sent, and cross-site browser calls are refused. */
export function sameOriginCheck(req: Request): RheaError | null {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return new RheaError("RHEA_FORBIDDEN_ORIGIN", 403, "This endpoint only serves Neer's own pages.");
  const origin = req.headers.get("origin");
  if (!origin) return null;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    if (host && new URL(origin).host === host) return null;
  } catch { /* malformed Origin */ }
  return new RheaError("RHEA_FORBIDDEN_ORIGIN", 403, "This endpoint only serves Neer's own pages.");
}

export function rheaJson(requestId: string, status: number, body: unknown, extra: Record<string, string> = {}): Response {
  const headers = apiHeaders(requestId);
  headers.set("Content-Type", "application/json");
  for (const [k, v] of Object.entries(extra)) headers.set(k, v);
  return new Response(JSON.stringify(body), { status, headers });
}

export function rheaErrorResponse(requestId: string, err: RheaError): Response {
  return rheaJson(requestId, err.status, { requestId, ...err.toBody() }, err.retryAfterSec ? { "Retry-After": String(err.retryAfterSec) } : {});
}

export async function limitOrResponse(req: Request, bucket: RheaBucket, requestId: string): Promise<Response | null> {
  const limit = await rheaRateLimit(bucket, clientIp(req.headers));
  if (limit.ok) return null;
  return rheaJson(requestId, 429, { requestId, error: { code: "RHEA_RATE_LIMITED", message: `Too many requests. Try again in ${limit.retryAfterSec} seconds.` } }, { "Retry-After": String(limit.retryAfterSec) });
}

/** Streams the body and stops at RHEA_MAX_BODY_BYTES, whatever Content-Length says. */
export async function readSmallJson(req: Request): Promise<{ ok: true; value: unknown } | { ok: false; status: number; message: string }> {
  if (!req.body) return { ok: false, status: 400, message: "Request body must be JSON." };
  const reader = req.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > RHEA_MAX_BODY_BYTES) {
        await reader.cancel().catch(() => {});
        return { ok: false, status: 413, message: "Request body is too large." };
      }
      text += decoder.decode(part.value, { stream: true });
    }
    text += decoder.decode();
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    await reader.cancel().catch(() => {});
    return { ok: false, status: 400, message: "Request body must be valid UTF-8 JSON." };
  }
}
