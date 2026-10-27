import "server-only";

/** Headers for every API response: no caching of verdicts, no sniffing, request id for support. */
export function apiHeaders(requestId: string): Headers {
  return new Headers({
    "Cache-Control": "no-store",
    "X-Request-Id": requestId,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  });
}
