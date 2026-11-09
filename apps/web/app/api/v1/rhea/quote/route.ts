import { RheaError, rheaQuote } from "@/lib/server/rhea";
import { getTokens } from "@/lib/server/upstream";
import { limitOrResponse, newRheaRequestId, readSmallJson, rheaErrorResponse, rheaJson, sameOriginCheck } from "@/lib/server/rhea-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/v1/rhea/quote. Requests one RHEA estimate (POST /api/v2/swap/quote) with
 * the server-held RHEA_API_KEY. It never builds, signs, submits or reports a swap.
 */
export async function POST(req: Request) {
  const requestId = newRheaRequestId();
  const forbidden = sameOriginCheck(req);
  if (forbidden) return rheaErrorResponse(requestId, forbidden);
  const limited = await limitOrResponse(req, "rhea-quote", requestId);
  if (limited) return limited;

  const body = await readSmallJson(req);
  if (!body.ok) return rheaErrorResponse(requestId, new RheaError("RHEA_INVALID_INPUT", body.status, body.message));
  try {
    const quote = await rheaQuote(body.value, { oneClickTokens: async () => (await getTokens()).tokens });
    return rheaJson(requestId, 200, { requestId, quote });
  } catch (err) {
    return rheaErrorResponse(requestId, err instanceof RheaError ? err : new RheaError("RHEA_UNAVAILABLE", 502, "Neer could not get a RHEA estimate."));
  }
}
