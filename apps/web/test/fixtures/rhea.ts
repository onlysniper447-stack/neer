/** Fake RHEA API bodies shaped like CrossChainDexAPI.md and the public token lists (fake data only). */
export const BASE_USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
export const NEAR_USDC = "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";
export const FAKE_SENDER = "0x000000000000000000000000000000000000dEaD";
export const FAKE_RECIPIENT = "neer-demo.near";

export const fromBase = () => ({
  code: 0,
  msg: "success",
  data: {
    [BASE_USDC]: { address: BASE_USDC, assetId: `nep141:base-${BASE_USDC}.omft.near`, blockchain: "base", chainId: 8453, contractAddress: BASE_USDC, decimals: 6, logoURI: "https://logo.invalid/usdc.png", platform: "nearIntents", price: "0.9995", symbol: "USDC", updated_at: 1794252699 },
    "0x0000000000000000000000000000000000000000": { address: "0x0000000000000000000000000000000000000000", assetId: null, blockchain: "Base", chainId: 8453, decimals: 18, isNative: true, logoURI: "https://logo.invalid/eth.png", platform: "lifi", price: "2122.07", symbol: "ETH" },
    "0x1111111111111111111111111111111111111111": { address: "0x1111111111111111111111111111111111111111", assetId: "", chainId: 8453, decimals: 18, symbol: "FAKE" },
    broken: { address: 7, symbol: "BROKEN" },
  },
});

export const toNear = () => ({
  code: 0,
  data: {
    blockchain: "near",
    toChain: "near",
    tokens: [
      { address: "wrap.near", assetId: "nep141:wrap.near", coinType: "", decimals: 24, isNative: true, logoURI: "https://logo.invalid/near.jpg", symbol: "wNEAR", sources: ["nearintents"] },
      { address: NEAR_USDC, assetId: `nep141:${NEAR_USDC}`, coinType: "", decimals: 6, isNative: false, symbol: "USDC", sources: ["nearintents", "rhea"] },
      { symbol: "NOADDR", decimals: 6 },
    ],
  },
});

export const quoteOk = (router = "nearintents") => ({
  code: 0,
  msg: "ok",
  data: {
    isCrossChain: true,
    chainType: "cross-chain",
    bestQuote: { router, amountOut: "9950000", minAmountOut: "9900250", preSwap: null, bridge: { route: "intents" } },
    allQuotes: [{ router: "lifi", amountOut: "9900000" }],
    errors: null,
  },
});

export const quoteInput = (over: Record<string, unknown> = {}) => ({
  fromChain: "8453",
  toChain: "near",
  tokenIn: BASE_USDC,
  tokenOut: NEAR_USDC,
  amount: "10",
  slippageBps: 50,
  sender: FAKE_SENDER,
  recipient: FAKE_RECIPIENT,
  ...over,
});

export type Route = { status?: number; body?: unknown; text?: string; headers?: Record<string, string>; hang?: boolean; reject?: Error };

/** A fetch stub keyed by URL path. Records every URL, method and header set it receives. */
export function fakeFetch(routes: Record<string, Route | (() => Route)>) {
  const calls: { url: URL; method: string; headers: Record<string, string>; body: unknown }[] = [];
  const fn = async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const headers = Object.fromEntries(new Headers(init.headers).entries());
    calls.push({ url, method: init.method ?? "GET", headers, body: typeof init.body === "string" ? JSON.parse(init.body) : undefined });
    const entry = routes[url.pathname];
    const r = typeof entry === "function" ? entry() : entry;
    if (!r) return new Response(JSON.stringify({ code: 404, msg: "not found" }), { status: 404 });
    if (r.reject) throw r.reject;
    if (r.hang) {
      return new Promise<Response>((_, reject) => {
        init.signal?.addEventListener("abort", () => reject(init.signal!.reason ?? new DOMException("aborted", "AbortError")));
      });
    }
    return new Response(r.text ?? JSON.stringify(r.body), { status: r.status ?? 200, headers: { "content-type": "application/json", ...(r.headers ?? {}) } });
  };
  return { fn, calls };
}

export const OK_ROUTES = () => ({
  "/get_chain_prices": { body: fromBase() },
  "/api/swap/supported_to_tokens": { body: toNear() },
  "/api/v2/swap/quote": { body: quoteOk() },
});
