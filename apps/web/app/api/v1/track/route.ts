import { NextResponse, type NextRequest } from "next/server";
import { TrackQuerySchema } from "@/lib/inputs";
import { clientIp, rateLimit } from "@/lib/server/rate-limit";
import { newRequestId, zodIssues } from "@/lib/server/service";
import { trackService } from "@/lib/server/track";
import { apiHeaders } from "@/lib/server/http";
import { applyCors, preflightResponse } from "@/lib/server/cors";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const requestId = newRequestId();
  const headers = apiHeaders(requestId);
  applyCors(req, headers, "GET, OPTIONS");

  const limit = await rateLimit("track", clientIp(req.headers));
  if (!limit.ok) {
    headers.set("Retry-After", String(limit.retryAfterSec));
    return NextResponse.json(
      { requestId, error: { code: "NEER_RATE_LIMITED", message: `Too many checks. Try again in ${limit.retryAfterSec} seconds.` } },
      { status: 429, headers },
    );
  }

  const q = TrackQuerySchema.safeParse({
    address: req.nextUrl.searchParams.get("address") ?? "",
    memo: req.nextUrl.searchParams.get("memo") || undefined,
  });
  if (!q.success) {
    return NextResponse.json(
      { requestId, error: { code: "NEER_INVALID_INPUT", message: "Pass ?address= (and &memo= if your swap has one).", issues: zodIssues(q.error) } },
      { status: 400, headers },
    );
  }
  const { status, body } = await trackService(q.data.address, q.data.memo ?? null, requestId);
  return NextResponse.json(body, { status, headers });
}

export function OPTIONS(req: NextRequest) {
  return preflightResponse(req, "GET, OPTIONS");
}
