import "server-only";

/**
 * CORS for the /v1 API, so apps can call it from the browser (e.g. <NeerGuard/>).
 * Only exact origins listed in NEER_CORS_ORIGINS (comma-separated) are allowed.
 * Server-to-server calls send no Origin and don't need this.
 */
function allowedOrigins(): Set<string> {
  return new Set(
    (process.env.NEER_CORS_ORIGINS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => /^https?:\/\/[a-z0-9.-]+(:\d{1,5})?$/i.test(s)),
  );
}

export function applyCors(req: Request, headers: Headers, methods: string): void {
  headers.append("Vary", "Origin");
  const origin = req.headers.get("origin");
  if (!origin || !allowedOrigins().has(origin)) return;
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Methods", methods);
  headers.set("Access-Control-Allow-Headers", "content-type");
  headers.set("Access-Control-Expose-Headers", "X-Request-Id, Retry-After");
  headers.set("Access-Control-Max-Age", "600");
}

export function preflightResponse(req: Request, methods: string): Response {
  const headers = new Headers({ "Cache-Control": "no-store" });
  applyCors(req, headers, methods);
  return new Response(null, { status: 204, headers });
}
