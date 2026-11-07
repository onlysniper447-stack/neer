import { NextResponse, type NextRequest } from "next/server";
import { clientIp, rateLimit } from "@/lib/server/rate-limit";
import { newRequestId, preflightService } from "@/lib/server/service";
import { readJsonBody } from "@/lib/server/read-json-body";
import { apiHeaders } from "@/lib/server/http";
import { applyCors, preflightResponse } from "@/lib/server/cors";

export const dynamic = "force-dynamic";

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

  const input = await readJsonBody(req);
  if (!input.ok) {
    return NextResponse.json({ requestId, error: { code: "NEER_INVALID_INPUT", message: input.message } }, { status: 400, headers });
  }

  const { status, body } = await preflightService(input.value, requestId);
  return NextResponse.json(body, { status, headers });
}

export function OPTIONS(req: NextRequest) {
  return preflightResponse(req, "POST, OPTIONS");
}
