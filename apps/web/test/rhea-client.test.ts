import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { TOKENS } from "@neer/fixtures/scenarios";
import { RHEA_CHAINS, checkHref, fromBaseUnits, toBaseUnits, type RheaToken } from "@/lib/rhea/shared";
import {
  ALLOWED_PATHS, NOT_CONFIGURED_MESSAGE, RheaError, checkPrefill, getRheaTokens, normalizeFromTokens, normalizeToTokens,
  parseQuoteData, resetRheaCaches, rheaBaseUrl, rheaQuote,
} from "@/lib/server/rhea-node";
import { BASE_USDC, FAKE_SENDER, NEAR_USDC, OK_ROUTES, fakeFetch, fromBase, quoteInput, quoteOk, toNear } from "./fixtures/rhea";

const deps = { oneClickTokens: async () => TOKENS, now: () => new Date("2026-11-09T19:00:00.000Z") };

async function rejection(p: Promise<unknown>): Promise<RheaError> {
  try { await p; } catch (err) { if (err instanceof RheaError) return err; throw err; }
  throw new Error("expected a RheaError");
}

beforeEach(() => {
  resetRheaCaches();
  vi.stubEnv("RHEA_API_KEY", "fake-test-key");
  vi.stubEnv("NEER_TEST_RHEA_UPSTREAM", "");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("amount conversion", () => {
  it("converts human decimals to base units exactly", () => {
    expect(toBaseUnits("10", 6)).toBe("10000000");
    expect(toBaseUnits("0.000001", 6)).toBe("1");
    expect(toBaseUnits("1.5", 24)).toBe("1500000000000000000000000");
    expect(toBaseUnits("0", 6)).toBe("0");
    expect(toBaseUnits("1.0000001", 6)).toBeNull();
  });
  it("formats base units without losing precision", () => {
    expect(fromBaseUnits("9950000", 6)).toBe("9.95");
    expect(fromBaseUnits("1", 24)).toBe("0.000000000000000000000001");
    expect(fromBaseUnits("123", 0)).toBe("123");
    expect(fromBaseUnits("1000000", 6)).toBe("1");
  });
});

describe("token list normalization", () => {
  it("keeps only readable rows and drops logos, prices and other remote fields", () => {
    const tokens = normalizeFromTokens("8453", fromBase().data);
    expect(tokens.map((t) => t.symbol)).toEqual(["ETH", "FAKE", "USDC"]);
    for (const t of tokens) expect(Object.keys(t).sort()).toEqual(["address", "assetId", "chain", "decimals", "isNative", "symbol"]);
    expect(tokens.find((t) => t.symbol === "USDC")?.assetId).toBe(`nep141:base-${BASE_USDC}.omft.near`);
    expect(tokens.find((t) => t.symbol === "FAKE")?.assetId).toBeNull();
    expect(tokens.find((t) => t.symbol === "ETH")?.isNative).toBe(true);
    expect(JSON.stringify(tokens)).not.toContain("logo");
  });
  it("reads the cross-chain list from data.tokens", () => {
    const tokens = normalizeToTokens("near", toNear().data);
    expect(tokens.map((t) => [t.symbol, t.address])).toEqual([["USDC", NEAR_USDC], ["wNEAR", "wrap.near"]]);
  });
  it("rejects a list that is not in the documented shape", () => {
    expect(() => normalizeFromTokens("8453", [])).toThrow(RheaError);
    expect(() => normalizeToTokens("near", { list: [] })).toThrow(RheaError);
  });
  it("lists the 27 documented chains with unique IDs", () => {
    expect(RHEA_CHAINS).toHaveLength(27);
    expect(new Set(RHEA_CHAINS.map((c) => c.id)).size).toBe(27);
    expect(new Set(RHEA_CHAINS.map((c) => c.listId)).size).toBe(27);
  });
});

describe("quote parsing", () => {
  it("follows the SDK route rules", () => {
    expect(parseQuoteData(quoteOk().data)).toEqual({ router: "nearintents", routerName: null, amountOut: "9950000", minAmountOut: "9900250", alternatives: 1 });
    expect(parseQuoteData({ bestQuote: { router: "nearintents", estimatedOut: "5" } })).toEqual({ router: "nearintents", routerName: null, amountOut: "5", minAmountOut: "5", alternatives: 0 });
  });
  it("rejects missing routers and non-integer amounts", () => {
    expect(() => parseQuoteData({ bestQuote: { amountOut: "5" } })).toThrow(RheaError);
    expect(() => parseQuoteData({ bestQuote: { router: "nearintents", amountOut: "1.5" } })).toThrow(RheaError);
    expect(() => parseQuoteData({ bestQuote: { router: "nearintents" } })).toThrow(RheaError);
    expect(() => parseQuoteData(null)).toThrow(RheaError);
  });
});

describe("check prefill mapping", () => {
  const usdc: RheaToken = { chain: "8453", address: BASE_USDC, symbol: "USDC", decimals: 6, isNative: false, assetId: `nep141:base-${BASE_USDC}.omft.near` };
  it("matches by the NEAR Intents asset ID", () => {
    expect(checkPrefill("8453", usdc, "10", TOKENS)).toEqual({ network: "base", token: `nep141:base-${BASE_USDC}.omft.near`, amount: "10" });
  });
  it("falls back to chain alias plus contract address, case-insensitively for EVM", () => {
    expect(checkPrefill("8453", { ...usdc, assetId: null, address: BASE_USDC.toUpperCase().replace("0X", "0x") }, "1", TOKENS)?.token).toBe(`nep141:base-${BASE_USDC}.omft.near`);
  });
  it("never matches by symbol alone or for unlisted native tokens", () => {
    expect(checkPrefill("8453", { ...usdc, assetId: null, address: "0x2222222222222222222222222222222222222222" }, "1", TOKENS)).toBeNull();
    expect(checkPrefill("8453", { chain: "8453", address: "0x0000000000000000000000000000000000000000", symbol: "ETH", decimals: 18, isNative: true, assetId: null }, "1", TOKENS)).toBeNull();
    expect(checkPrefill("8453", usdc, "1", [])).toBeNull();
  });
  it("builds a /check link with network, token and amount only", () => {
    const href = checkHref({ network: "base", token: "nep141:x", amount: "10" });
    expect([...new URL(href, "https://neer.test").searchParams.keys()]).toEqual(["network", "token", "amount"]);
  });
});

describe("rheaQuote", () => {
  it("returns RHEA's estimate and a check prefill, calling only allowed read-only paths", async () => {
    const f = fakeFetch(OK_ROUTES());
    vi.stubGlobal("fetch", f.fn);
    const view = await rheaQuote(quoteInput(), deps);
    expect(view).toEqual({
      router: "nearintents", routerName: null, viaNearIntents: true, fromChain: "8453", toChain: "near",
      tokenIn: { symbol: "USDC", decimals: 6, address: BASE_USDC }, tokenOut: { symbol: "USDC", decimals: 6, address: NEAR_USDC },
      amountIn: "10", estimatedOut: "9.95", minAmountOut: "9.90025", alternatives: 1, receivedAt: "2026-11-09T19:00:00.000Z",
      check: { network: "base", token: `nep141:base-${BASE_USDC}.omft.near`, amount: "10" }, checkNote: null,
    });
    expect(f.calls.map((c) => `${c.method} ${c.url.origin}${c.url.pathname}?${c.url.searchParams}`)).toEqual([
      "GET https://api.rhea.finance/get_chain_prices?chain=8453",
      "GET https://api.rhea.finance/api/swap/supported_to_tokens?chain=900001",
      "POST https://api.rhea.finance/api/v2/swap/quote?",
    ]);
    for (const c of f.calls) expect(ALLOWED_PATHS.has(c.url.pathname)).toBe(true);
    expect(f.calls[0]!.headers.authorization).toBeUndefined();
    expect(f.calls[1]!.headers.authorization).toBeUndefined();
    expect(f.calls[2]!.headers.authorization).toBe("Bearer fake-test-key");
    expect(f.calls[2]!.body).toEqual({
      fromChain: "8453", toChain: "near", tokenIn: BASE_USDC, tokenOut: NEAR_USDC, amountIn: "10000000", slippage: 50,
      quoteWaitingTimeMs: 5000, sameChainTimeoutMs: 500, crossChainTimeoutMs: 5000, sender: FAKE_SENDER, recipient: "neer-demo.near",
    });
  });

  it("uses the from-list for a same-chain destination and omits an empty recipient", async () => {
    const f = fakeFetch(OK_ROUTES());
    vi.stubGlobal("fetch", f.fn);
    await rheaQuote(quoteInput({ toChain: "8453", tokenOut: "0x1111111111111111111111111111111111111111", recipient: "" }), deps);
    expect(f.calls.map((c) => c.url.pathname)).toEqual(["/get_chain_prices", "/api/v2/swap/quote"]);
    expect(f.calls[1]!.body).not.toHaveProperty("recipient");
  });

  it("refuses to quote without a key and makes no upstream call", async () => {
    vi.stubEnv("RHEA_API_KEY", "");
    const f = fakeFetch(OK_ROUTES());
    vi.stubGlobal("fetch", f.fn);
    const err = await rejection(rheaQuote(quoteInput(), deps));
    expect([err.code, err.status, err.message]).toEqual(["RHEA_NOT_CONFIGURED", 503, NOT_CONFIGURED_MESSAGE]);
    expect(f.calls).toHaveLength(0);
  });

  it("asks for a sender instead of inventing one", async () => {
    const f = fakeFetch(OK_ROUTES());
    vi.stubGlobal("fetch", f.fn);
    for (const sender of [undefined, "", "   "]) {
      const err = await rejection(rheaQuote(quoteInput({ sender }), deps));
      expect(err.code).toBe("RHEA_SENDER_REQUIRED");
      expect(err.message).toContain("does not fill one in");
    }
    expect(f.calls).toHaveLength(0);
  });

  it.each([
    ["unknown field", { quoteId: "x" }],
    ["unknown chain", { fromChain: "999999" }],
    ["exponent amount", { amount: "1e6" }],
    ["negative amount", { amount: "-1" }],
    ["sender with spaces", { sender: "0x12 34" }],
    ["slippage too high", { slippageBps: 5000 }],
  ])("rejects invalid input: %s", async (_name, over) => {
    vi.stubGlobal("fetch", fakeFetch(OK_ROUTES()).fn);
    expect((await rejection(rheaQuote(quoteInput(over), deps))).code).toBe("RHEA_INVALID_INPUT");
  });

  it("rejects too many decimals and zero amounts", async () => {
    vi.stubGlobal("fetch", fakeFetch(OK_ROUTES()).fn);
    expect((await rejection(rheaQuote(quoteInput({ amount: "1.0000001" }), deps))).message).toContain("6 decimals");
    expect((await rejection(rheaQuote(quoteInput({ amount: "0" }), deps))).message).toContain("above zero");
  });

  it("rejects tokens that are not in RHEA's list", async () => {
    vi.stubGlobal("fetch", fakeFetch(OK_ROUTES()).fn);
    expect((await rejection(rheaQuote(quoteInput({ tokenIn: "0x9999999999999999999999999999999999999999" }), deps))).code).toBe("RHEA_TOKEN_UNKNOWN");
  });

  it("maps HTTP 401 and an in-body 401 to RHEA_UNAUTHORIZED", async () => {
    vi.stubGlobal("fetch", fakeFetch({ ...OK_ROUTES(), "/api/v2/swap/quote": { status: 401, body: { code: 401, msg: "Authorization header is required (format: Bearer <jwt>)", reason: "missing_authorization" } } }).fn);
    const err = await rejection(rheaQuote(quoteInput(), deps));
    expect([err.code, err.status]).toEqual(["RHEA_UNAUTHORIZED", 502]);
    resetRheaCaches();
    vi.stubGlobal("fetch", fakeFetch({ ...OK_ROUTES(), "/api/v2/swap/quote": { status: 200, body: { code: 401, msg: "bad token" } } }).fn);
    expect((await rejection(rheaQuote(quoteInput(), deps))).code).toBe("RHEA_UNAUTHORIZED");
  });

  it("times out after the configured budget", async () => {
    vi.stubGlobal("fetch", fakeFetch({ ...OK_ROUTES(), "/api/v2/swap/quote": { hang: true } }).fn);
    const started = Date.now();
    const err = await rejection(rheaQuote(quoteInput(), { ...deps, timeoutMs: 60 }));
    expect([err.code, err.status]).toEqual(["RHEA_TIMEOUT", 504]);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("uses an 8 second timeout by default", () => {
    const src = readFileSync(new URL("../lib/server/rhea-node.ts", import.meta.url), "utf8");
    expect(src).toContain("export const RHEA_TIMEOUT_MS = 8000;");
  });

  it.each([
    ["non-JSON body", { text: "<html>oops</html>" }],
    ["missing envelope", { body: { data: {} } }],
    ["missing bestQuote", { body: { code: 0, data: { allQuotes: [] } } }],
    ["decimal amountOut", { body: { code: 0, data: { bestQuote: { router: "nearintents", amountOut: "9.5" } } } }],
  ])("reports a malformed quote response: %s", async (_name, route) => {
    vi.stubGlobal("fetch", fakeFetch({ ...OK_ROUTES(), "/api/v2/swap/quote": route }).fn);
    const err = await rejection(rheaQuote(quoteInput(), deps));
    expect([err.code, err.status]).toEqual(["RHEA_BAD_RESPONSE", 502]);
  });

  it("passes RHEA's rate limit on with its Retry-After", async () => {
    vi.stubGlobal("fetch", fakeFetch({ ...OK_ROUTES(), "/api/v2/swap/quote": { status: 429, body: { code: 429, msg: "slow down" }, headers: { "retry-after": "12" } } }).fn);
    const err = await rejection(rheaQuote(quoteInput(), deps));
    expect([err.code, err.status, err.retryAfterSec]).toEqual(["RHEA_UPSTREAM_RATE_LIMITED", 503, 12]);
  });

  it("reports a business error as no route without echoing RHEA's provider internals", async () => {
    vi.stubGlobal("fetch", fakeFetch({ ...OK_ROUTES(), "/api/v2/swap/quote": { body: { code: 1001, msg: "no route\u0000 found\n<b> correlationId 123", data: null } } }).fn);
    const err = await rejection(rheaQuote(quoteInput(), deps));
    expect([err.code, err.status, err.message]).toEqual(["RHEA_NO_ROUTE", 422, "RHEA found no route for this request."]);
  });

  it("reports 5xx and network failures as unavailable", async () => {
    vi.stubGlobal("fetch", fakeFetch({ ...OK_ROUTES(), "/api/v2/swap/quote": { status: 503, text: "down" } }).fn);
    expect((await rejection(rheaQuote(quoteInput(), deps))).code).toBe("RHEA_UNAVAILABLE");
    vi.stubGlobal("fetch", fakeFetch({ ...OK_ROUTES(), "/api/v2/swap/quote": { reject: new TypeError("fetch failed") } }).fn);
    expect((await rejection(rheaQuote(quoteInput(), deps))).code).toBe("RHEA_UNAVAILABLE");
  });

  it("offers no Neer check for routes that are not NEAR Intents", async () => {
    vi.stubGlobal("fetch", fakeFetch({ ...OK_ROUTES(), "/api/v2/swap/quote": { body: quoteOk("lifi") } }).fn);
    const view = await rheaQuote(quoteInput(), deps);
    expect(view.viaNearIntents).toBe(false);
    expect(view.check).toBeNull();
    expect(view.checkNote).toContain("Neer checks NEAR Intents deposit addresses only");
  });

  it("says so when the NEAR Intents token list is unavailable", async () => {
    vi.stubGlobal("fetch", fakeFetch(OK_ROUTES()).fn);
    const view = await rheaQuote(quoteInput(), { ...deps, oneClickTokens: async () => { throw new Error("down"); } });
    expect(view.check).toBeNull();
    expect(view.checkNote).toContain("token list is unavailable");
  });
});

describe("token cache", () => {
  it("caches successful lists and never caches failures", async () => {
    let fail = true;
    const f = fakeFetch({ "/get_chain_prices": () => (fail ? { status: 500, text: "err" } : { body: fromBase() }) });
    vi.stubGlobal("fetch", f.fn);
    await expect(getRheaTokens("from", "8453")).rejects.toThrow(RheaError);
    fail = false;
    await getRheaTokens("from", "8453");
    await getRheaTokens("from", "8453");
    expect(f.calls).toHaveLength(2);
  });
});

describe("safety boundaries", () => {
  it("allows exactly the three documented read-only paths", () => {
    expect([...ALLOWED_PATHS].sort()).toEqual(["/api/swap/supported_to_tokens", "/api/v2/swap/quote", "/get_chain_prices"]);
  });
  it("only accepts loopback test upstreams", () => {
    vi.stubEnv("NEER_TEST_RHEA_UPSTREAM", "https://evil.example");
    expect(() => rheaBaseUrl()).toThrow(/loopback/);
    vi.stubEnv("NEER_TEST_RHEA_UPSTREAM", "http://127.0.0.1:4011/");
    expect(rheaBaseUrl()).toBe("http://127.0.0.1:4011");
  });
  it("contains no swap-building, reporting, signing or SDK code", () => {
    const files = [
      "../lib/server/rhea-node.ts", "../lib/server/rhea.ts", "../lib/server/rhea-http.ts", "../lib/server/rhea-rate-limit.ts", "../lib/rhea/shared.ts",
      "../components/rhea-route.tsx", "../app/(product)/tools/rhea-route/page.tsx", "../app/api/v1/rhea/quote/route.ts", "../app/api/v1/rhea/tokens/route.ts",
    ];
    for (const file of files) {
      const src = readFileSync(new URL(file, import.meta.url), "utf8");
      for (const banned of ["/swap/swap", "/api/swap/report", "order-submit", "history/auth", "signMessage", "signTypedData", "sendTransaction", "@rhea-finance", "executors"]) {
        expect(`${file}: ${src.includes(banned)}`).toBe(`${file}: false`);
      }
    }
    expect(readdirSync(new URL("../app/api/v1/rhea", import.meta.url)).sort()).toEqual(["quote", "tokens"]);
    const pkg = readFileSync(new URL("../package.json", import.meta.url), "utf8");
    expect(pkg).not.toContain("@rhea-finance");
  });
});

describe("live RHEA quote shapes (recorded 10 Nov 2026, redacted)", () => {
  const live = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/rhea-live/${name}.json`, import.meta.url), "utf8")) as { httpStatus: number; body: { code: number; msg?: string; data?: unknown } };

  it("parses a real successful quote", () => {
    const { httpStatus, body } = live("success-lifi");
    expect([httpStatus, body.code]).toEqual([200, 0]);
    expect(parseQuoteData(body.data)).toEqual({ router: "lifi", routerName: "LI.FI", amountOut: "19950000", minAmountOut: "19950000", alternatives: 0 });
  });

  it("shows a real non-NEAR Intents route without a Neer check", async () => {
    const { body } = live("success-lifi");
    vi.stubGlobal("fetch", fakeFetch({ ...OK_ROUTES(), "/api/v2/swap/quote": { body } }).fn);
    const view = await rheaQuote(quoteInput(), deps);
    expect([view.router, view.routerName, view.estimatedOut, view.minAmountOut, view.check]).toEqual(["lifi", "LI.FI", "19.95", "19.95", null]);
  });

  it.each([
    ["fail-recipient-invalid", "RHEA_NO_ROUTE", 422, "RHEA found no route for this request. NEAR Intents reported: recipient is not valid.", undefined],
    ["fail-internal-error", "RHEA_NO_ROUTE", 422, "RHEA found no route for this request. NEAR Intents reported: Internal server error.", undefined],
    ["fail-timeout-3s", "RHEA_QUOTE_TIMEOUT", 503, "RHEA's route providers did not return a quote in time. NEAR Intents reported: quote timed out. Try again in 6 seconds.", 6],
    ["fail-timeout-no-liquidity", "RHEA_QUOTE_TIMEOUT", 503, "RHEA's route providers did not return a quote in time. NEAR Intents reported: No liquidity available. Try again in 7 seconds.", 7],
  ])("maps real failure %s (HTTP 200, code -1)", async (name, code, status, message, retry) => {
    const { httpStatus, body } = live(name);
    expect([httpStatus, body.code]).toEqual([200, -1]);
    vi.stubGlobal("fetch", fakeFetch({ ...OK_ROUTES(), "/api/v2/swap/quote": { body } }).fn);
    const err = await rejection(rheaQuote(quoteInput(), deps));
    expect([err.code, err.status, err.message, err.retryAfterSec]).toEqual([code, status, message, retry]);
    expect(err.message).not.toMatch(/correlationId|StableFlow|HTTP 403|OpenOcean/);
  });

  it("the mocks carry the same success fields Neer reads", () => {
    const real = live("success-lifi").body.data as { bestQuote: Record<string, unknown> };
    for (const k of ["router", "amountOut", "minAmountOut"]) {
      expect(typeof real.bestQuote[k]).toBe("string");
      expect(typeof (quoteOk().data.bestQuote as Record<string, unknown>)[k]).toBe("string");
    }
  });
});
