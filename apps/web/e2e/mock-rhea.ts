/**
 * Local stand-in for the RHEA Cross-Chain Swap API, used only by Playwright.
 * It serves the three read-only paths Neer uses and records every request.
 * Any other path (for example a swap build) is answered with 404 and recorded,
 * so the spec can assert it was never requested.
 */
import { createServer } from "node:http";

const port = Number(process.env.RHEA_MOCK_PORT ?? 4011);
const calls: { method: string; path: string; auth: boolean }[] = [];
const BASE_USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const NEAR_USDC = "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";

function send(res: import("node:http").ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

const fromLists: Record<string, Record<string, unknown>> = {
  "8453": {
    [BASE_USDC]: { address: BASE_USDC, assetId: `nep141:base-${BASE_USDC}.omft.near`, chainId: 8453, decimals: 6, symbol: "USDC", logoURI: "https://logo.invalid/usdc.png" },
    "0x1111111111111111111111111111111111111111": { address: "0x1111111111111111111111111111111111111111", assetId: null, chainId: 8453, decimals: 18, symbol: "FAKE" },
  },
  "900001": { [NEAR_USDC]: { address: NEAR_USDC, assetId: `nep141:${NEAR_USDC}`, chainId: 900001, decimals: 6, symbol: "USDC" } },
};

createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
  if (url.pathname === "/__calls") return send(res, 200, calls);
  if (url.pathname === "/__reset") { calls.length = 0; return send(res, 200, { ok: true }); }
  calls.push({ method: req.method ?? "", path: url.pathname, auth: Boolean(req.headers.authorization) });

  if (req.method === "GET" && url.pathname === "/get_chain_prices") {
    return send(res, 200, { code: 0, msg: "success", data: fromLists[url.searchParams.get("chain") ?? ""] ?? {} });
  }
  if (req.method === "GET" && url.pathname === "/api/swap/supported_to_tokens") {
    const list = fromLists[url.searchParams.get("chain") ?? ""] ?? {};
    return send(res, 200, { code: 0, data: { tokens: Object.values(list) } });
  }
  if (req.method === "POST" && url.pathname === "/api/v2/swap/quote") {
    if (req.headers.authorization !== "Bearer fake-e2e-key") return send(res, 401, { code: 401, msg: "Authorization header is required (format: Bearer <jwt>)" });
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = JSON.parse(raw) as { amountIn: string; sender: string };
      const router = body.sender.toLowerCase().endsWith("1111") ? "lifi" : "nearintents";
      const out = (BigInt(body.amountIn) * 995n) / 1000n;
      send(res, 200, { code: 0, msg: "ok", data: { isCrossChain: true, chainType: "cross-chain", bestQuote: router === "lifi"
      ? { router, routerName: "LI.FI", routeLabel: "LI.FI", amountOut: out.toString(), estimatedOut: out.toString(), minAmountOut: ((out * 995n) / 1000n).toString(), executionType: "transaction" }
      // Live NEAR Intents quotes carry estimatedOut and no amountOut.
      : { router, routerName: "Near Intents", routeLabel: router, routeId: router, estimatedOut: out.toString(), guaranteedOut: ((out * 995n) / 1000n).toString(), minAmountOut: ((out * 995n) / 1000n).toString(), executionType: "transaction", requiresExternalPreSwap: false }, allQuotes: [], errors: null } });
    });
    return;
  }
  return send(res, 404, { code: 404, msg: "not found" });
}).listen(port, "127.0.0.1", () => {
  console.log(`mock RHEA listening on http://127.0.0.1:${port}`);
});
