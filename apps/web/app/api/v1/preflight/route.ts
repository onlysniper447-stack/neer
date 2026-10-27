import { NextResponse, type NextRequest } from "next/server";
import { clientIp, rateLimit } from "@/lib/server/rate-limit";
import { newRequestId, preflightService } from "@/lib/server/service";
import { apiHeaders } from "@/lib/server/http";
import { applyCors, preflightResponse } from "@/lib/server/cors";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 64 * 1024;

export async function POST(req: NextRequest) {
  const requestId = newRequestId();
  const headers = apiHeaders(requestId);
  applyCors(req, headers, "POST, OPTIONS");

  const limit = await rateLimit("preflight", clientIp(req.headers));
  if (!limit.ok) {
    headers.set("Retry-After", String(limit.retryAfterSec));
    return NextResponse.json(
      { requestId, error: { code: "NEER_RATE_LIMITED", message: `Too many checks. Try again in ${limit.retryAfterSec} seconds.` } },
      { status: 429, headers },
    );
  }

  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) {
    return NextResponse.json({ requestId, error: { code: "NEER_INVALID_INPUT", message: "Request body is too large." } }, { status: 400, headers });
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return NextResponse.json({ requestId, error: { code: "NEER_INVALID_INPUT", message: "Request body must be JSON." } }, { status: 400, headers });
  }

  const { status, body } = await preflightService(json, requestId);
  return NextResponse.json(body, { status, headers });
}

export function OPTIONS(req: NextRequest) {
  return preflightResponse(req, "POST, OPTIONS");
}
