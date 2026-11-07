import "./node-only";
import { VerifyInputError } from "@neer/verify";
import { clientIp, rateLimit } from "./rate-limit-node";
import { readJsonBody } from "./read-json-body";
import { logVerification, verifyHeaders, verifyInternalErrorResponse, verifyMethodResponse } from "./verify-http";
import { verifyService } from "./verify-service";

export type VerifyHttpRequest = Pick<Request, "method" | "headers" | "body">;

export async function handleVerifyRequest(request: VerifyHttpRequest): Promise<Response> {
  const methodResponse = verifyMethodResponse(request.method);
  if (methodResponse) return methodResponse;
  const headers = verifyHeaders();
  const invalid = (details: { path: string; message: string }[]) => {
    logVerification(400);
    return Response.json({ error: "invalid_input", details }, { status: 400, headers });
  };
  try {
    const limit = await rateLimit("verify", clientIp(request.headers));
    if (!limit.ok) {
      headers.set("Retry-After", String(limit.retryAfterSec));
      logVerification(429);
      return Response.json({ error: "rate_limited" }, { status: 429, headers });
    }
    if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
      return invalid([{ path: "", message: "Send an application/json body." }]);
    }
    const body = await readJsonBody(request);
    if (!body.ok) return invalid([{ path: "", message: body.message }]);
    const result = await verifyService(body.value);
    logVerification(200, result.findings.map((finding) => finding.code));
    return Response.json(result, { status: 200, headers });
  } catch (error) {
    if (error instanceof VerifyInputError) return invalid(error.issues);
    // Never let framework error logging receive request/upstream exception details.
    return verifyInternalErrorResponse(headers);
  }
}
