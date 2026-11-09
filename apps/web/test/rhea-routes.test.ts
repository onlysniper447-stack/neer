import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TOKENS } from "@neer/fixtures/scenarios";
import { BASE_USDC, OK_ROUTES, fakeFetch, quoteInput } from "./fixtures/rhea";

vi.mock("@/lib/server/upstream-node", () => ({
  getTokens: vi.fn(async () => ({ tokens: TOKENS, fresh: true, fetchedAt: Date.now() })),
  getStatus: vi.fn(),
  quotePublicKeyOverride: undefined,
}));

const quoteRoute = await import("@/app/api/v1/rhea/quote/route");
const tokensRoute = await import("@/app/api/v1/rhea/tokens/route");
const { resetRheaCaches, ALLOWED_PATHS } = await import("@/lib/server/rhea-node");
const { resetRheaLimits, RHEA_LIMITS } = await import("@/lib/server/rhea-rate-limit");

let ipCounter = 0;
let ip = "";
beforeEach(() => {
  resetRheaCaches();
  resetRheaLimits();
  ip = `198.51.100.${++ipCounter}`;
  vi.stubEnv("RHEA_API_KEY", "fake-test-key");
  vi.stubEnv("NEER_TEST_RHEA_UPSTREAM", "");
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://neer.test/api/v1/rhea/quote", {
    method: "POST",
    headers: { "Content-Type": "application/json", host: "neer.test", "x-forwarded-for": ip, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
function get(query: string, headers: Record<string, string> = {}) {
  return new Request(`https://neer.test/api/v1/rhea/tokens?${query}`, { headers: { host: "neer.test", "x-forwarded-for": ip, ...headers } });
}
function assertApiHeaders(res: Response) {
  expect(res.headers.get("Cache-Control")).toBe("no-store");
  expect(res.headers.get("Content-Security-Policy")).toBe("default-src 'none'; frame-ancestors 'none'");
  expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  expect(res.headers.get("X-Request-Id")).toMatch(/^rhea_/);
}

describe("GET /api/v1/rhea/tokens", () => {
  it("returns RHEA's public list without sending the API key", async () => {
    const f = fakeFetch(OK_ROUTES());
    vi.stubGlobal("fetch", f.fn);
    const res = await tokensRoute.GET(get("direction=from&chain=8453"));
    expect(res.status).toBe(200);
    assertApiHeaders(res);
    const body = await res.json();
    expect(body).toMatchObject({ direction: "from", chain: "8453", fresh: true });
    expect(body.tokens.map((t: { symbol: string }) => t.symbol)).toEqual(["ETH", "FAKE", "USDC"]);
    expect(f.calls[0]!.headers.authorization).toBeUndefined();
  });

  it("works without a RHEA key", async () => {
    vi.stubEnv("RHEA_API_KEY", "");
    vi.stubGlobal("fetch", fakeFetch(OK_ROUTES()).fn);
    expect((await tokensRoute.GET(get("direction=to&chain=near"))).status).toBe(200);
  });

  it.each(["", "direction=from", "direction=sideways&chain=8453", "direction=from&chain=99", "direction=from&chain=8453&extra=1", "direction=from&chain=8453&chain=1"])("rejects %s", async (q) => {
    vi.stubGlobal("fetch", fakeFetch(OK_ROUTES()).fn);
    const res = await tokensRoute.GET(get(q));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("RHEA_INVALID_INPUT");
  });

  it("reports an upstream failure as 502", async () => {
    vi.stubGlobal("fetch", fakeFetch({ "/get_chain_prices": { status: 500, text: "down" } }).fn);
    const res = await tokensRoute.GET(get("direction=from&chain=8453"));
    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe("RHEA_UNAVAILABLE");
  });

  it("has its own rate limit", async () => {
    vi.stubGlobal("fetch", fakeFetch(OK_ROUTES()).fn);
    for (let i = 0; i < RHEA_LIMITS["rhea-tokens"].max; i++) expect((await tokensRoute.GET(get("direction=from&chain=8453"))).status).toBe(200);
    const res = await tokensRoute.GET(get("direction=from&chain=8453"));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect((await res.json()).error.code).toBe("RHEA_RATE_LIMITED");
  });
});

describe("POST /api/v1/rhea/quote", () => {
  it("returns the estimate and a /check prefill", async () => {
    const f = fakeFetch(OK_ROUTES());
    vi.stubGlobal("fetch", f.fn);
    const res = await quoteRoute.POST(post(quoteInput()));
    expect(res.status).toBe(200);
    assertApiHeaders(res);
    const { quote } = await res.json();
    expect(quote).toMatchObject({ router: "nearintents", amountIn: "10", estimatedOut: "9.95", minAmountOut: "9.90025", check: { network: "base", token: `nep141:base-${BASE_USDC}.omft.near`, amount: "10" } });
    for (const c of f.calls) expect(ALLOWED_PATHS.has(c.url.pathname)).toBe(true);
  });

  it("returns a factual 503 when no key is configured, without calling RHEA", async () => {
    vi.stubEnv("RHEA_API_KEY", "");
    const f = fakeFetch(OK_ROUTES());
    vi.stubGlobal("fetch", f.fn);
    const res = await quoteRoute.POST(post(quoteInput()));
    expect(res.status).toBe(503);
    assertApiHeaders(res);
    expect((await res.json()).error).toEqual({ code: "RHEA_NOT_CONFIGURED", message: "RHEA quotes are not configured on this Neer deployment. It has no RHEA API key, so no quote was requested. Token lists still load." });
    expect(f.calls).toHaveLength(0);
  });

  it("maps RHEA's 401 to 502 RHEA_UNAUTHORIZED and never echoes the key", async () => {
    vi.stubGlobal("fetch", fakeFetch({ ...OK_ROUTES(), "/api/v2/swap/quote": { status: 401, body: { code: 401, msg: "Authorization header is required (format: Bearer <jwt>)" } } }).fn);
    const res = await quoteRoute.POST(post(quoteInput()));
    expect(res.status).toBe(502);
    const text = await res.text();
    expect(JSON.parse(text).error.code).toBe("RHEA_UNAUTHORIZED");
    expect(text).not.toContain("fake-test-key");
  });

  it("maps a timeout to 504", async () => {
    vi.stubGlobal("fetch", fakeFetch({ ...OK_ROUTES(), "/api/v2/swap/quote": { reject: new DOMException("The operation was aborted due to timeout", "TimeoutError") } }).fn);
    const res = await quoteRoute.POST(post(quoteInput()));
    expect(res.status).toBe(504);
    expect((await res.json()).error).toEqual({ code: "RHEA_TIMEOUT", message: "RHEA did not answer within 8 seconds. Try again." });
  });

  it("maps a malformed response to 502", async () => {
    vi.stubGlobal("fetch", fakeFetch({ ...OK_ROUTES(), "/api/v2/swap/quote": { text: "not json" } }).fn);
    const res = await quoteRoute.POST(post(quoteInput()));
    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe("RHEA_BAD_RESPONSE");
  });

  it("passes RHEA's 429 on as 503 with Retry-After", async () => {
    vi.stubGlobal("fetch", fakeFetch({ ...OK_ROUTES(), "/api/v2/swap/quote": { status: 429, text: "{}", headers: { "retry-after": "7" } } }).fn);
    const res = await quoteRoute.POST(post(quoteInput()));
    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("7");
    expect((await res.json()).error.code).toBe("RHEA_UPSTREAM_RATE_LIMITED");
  });

  it("applies its own rate limit before reading the body or calling RHEA", async () => {
    const f = fakeFetch(OK_ROUTES());
    vi.stubGlobal("fetch", f.fn);
    for (let i = 0; i < RHEA_LIMITS["rhea-quote"].max; i++) expect((await quoteRoute.POST(post(quoteInput()))).status).toBe(200);
    const before = f.calls.length;
    const res = await quoteRoute.POST(post(quoteInput()));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toMatch(/^\d+$/);
    expect((await res.json()).error.code).toBe("RHEA_RATE_LIMITED");
    expect(f.calls.length).toBe(before);
  });

  it("rejects bodies over 4 KiB with 413", async () => {
    vi.stubGlobal("fetch", fakeFetch(OK_ROUTES()).fn);
    const res = await quoteRoute.POST(post({ ...quoteInput(), pad: "x".repeat(5000) }));
    expect(res.status).toBe(413);
  });

  it("rejects invalid JSON and invalid fields with 400", async () => {
    vi.stubGlobal("fetch", fakeFetch(OK_ROUTES()).fn);
    expect((await quoteRoute.POST(post("{"))).status).toBe(400);
    const res = await quoteRoute.POST(post(quoteInput({ amount: "1e3" })));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("RHEA_INVALID_INPUT");
  });

  it("returns 400 RHEA_SENDER_REQUIRED without a sender", async () => {
    const f = fakeFetch(OK_ROUTES());
    vi.stubGlobal("fetch", f.fn);
    const res = await quoteRoute.POST(post(quoteInput({ sender: "" })));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("RHEA_SENDER_REQUIRED");
    expect(f.calls).toHaveLength(0);
  });

  it("refuses cross-site browser requests and sends no CORS headers", async () => {
    vi.stubGlobal("fetch", fakeFetch(OK_ROUTES()).fn);
    const cases: Record<string, string>[] = [{ origin: "https://evil.example" }, { "sec-fetch-site": "cross-site" }, { origin: "null" }];
    for (const headers of cases) {
      const res = await quoteRoute.POST(post(quoteInput(), headers));
      expect(res.status).toBe(403);
      assertApiHeaders(res);
    }
    expect((await quoteRoute.POST(post(quoteInput(), { origin: "https://neer.test", "sec-fetch-site": "same-origin" }))).status).toBe(200);
  });

  it("exports no other HTTP methods", () => {
    expect(Object.keys(quoteRoute).filter((k) => /^[A-Z]+$/.test(k))).toEqual(["POST"]);
    expect(Object.keys(tokensRoute).filter((k) => /^[A-Z]+$/.test(k))).toEqual(["GET"]);
  });
});
