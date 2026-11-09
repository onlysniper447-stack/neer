import { RheaChainIdSchema } from "@/lib/rhea/shared";
import { RheaError, getRheaTokens } from "@/lib/server/rhea";
import { limitOrResponse, newRheaRequestId, rheaErrorResponse, rheaJson, sameOriginCheck } from "@/lib/server/rhea-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/v1/rhea/tokens?direction=from|to&chain=<RHEA chain ID>. Public RHEA token lists, no key needed. */
export async function GET(req: Request) {
  const requestId = newRheaRequestId();
  const forbidden = sameOriginCheck(req);
  if (forbidden) return rheaErrorResponse(requestId, forbidden);
  const limited = await limitOrResponse(req, "rhea-tokens", requestId);
  if (limited) return limited;

  const url = new URL(req.url);
  const keys = [...url.searchParams.keys()];
  const direction = url.searchParams.get("direction");
  const chain = RheaChainIdSchema.safeParse(url.searchParams.get("chain"));
  if (keys.some((k) => k !== "direction" && k !== "chain") || new Set(keys).size !== keys.length || (direction !== "from" && direction !== "to") || !chain.success) {
    return rheaErrorResponse(requestId, new RheaError("RHEA_INVALID_INPUT", 400, "Use direction=from or direction=to and a supported RHEA chain ID."));
  }
  try {
    const result = await getRheaTokens(direction, chain.data);
    return rheaJson(requestId, 200, { requestId, direction, chain: chain.data, fetchedAt: new Date(result.fetchedAt).toISOString(), fresh: result.fresh, tokens: result.tokens });
  } catch (err) {
    return rheaErrorResponse(requestId, err instanceof RheaError ? err : new RheaError("RHEA_UNAVAILABLE", 502, "Neer could not load RHEA's token list."));
  }
}
