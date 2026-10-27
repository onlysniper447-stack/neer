/**
 * Local stand-in for the 1Click API, used only by Playwright. It serves
 * recorded /v0/tokens data (prices restamped to "now") and /v0/status bodies
 * built from @neer/fixtures scenarios, signed with the TEST key. The web app
 * trusts that key only because NEER_TEST_UPSTREAM points at loopback.
 */
import { createServer } from "node:http";
import { E2E_ADDRESSES, TOKENS, mockRegistry } from "@neer/fixtures/scenarios";

const port = Number(process.env.MOCK_PORT ?? 4010);
const registry = mockRegistry();
const calls = new Map<string, number>();

function send(res: import("node:http").ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
  if (req.method === "POST" && url.pathname === "/__reset") {
    calls.clear();
    return send(res, 200, { ok: true });
  }
  if (req.method !== "GET") return send(res, 405, { message: "method not allowed" });

  if (url.pathname === "/v0/tokens") {
    const at = new Date(Date.now() - 60_000).toISOString();
    return send(res, 200, TOKENS.map((t) => ({ ...t, priceUpdatedAt: at })));
  }

  if (url.pathname === "/v0/status") {
    const address = url.searchParams.get("depositAddress") ?? "";
    const memo = url.searchParams.get("depositMemo");
    if (!address) return send(res, 400, { message: "depositAddress should not be empty" });
    const key = address.toLowerCase();
    if (key === E2E_ADDRESSES.upstreamDown.toLowerCase()) return send(res, 502, { message: "Bad gateway" });
    const entry = registry.get(key);
    // Assumption: a memo-mode quote is only found with its memo (not verified live).
    if (!entry || (entry.memo && memo !== entry.memo)) {
      return send(res, 404, { message: `Deposit address ${address} not found`, statusCode: 404 });
    }
    const n = calls.get(key) ?? 0;
    calls.set(key, n + 1);
    const body = entry.respond(new Date(), n);
    if (!body) return send(res, 404, { message: `Deposit address ${address} not found`, statusCode: 404 });
    return send(res, 200, body);
  }
  return send(res, 404, { message: "not found" });
}).listen(port, "127.0.0.1", () => {
  console.log(`mock 1Click listening on http://127.0.0.1:${port}`);
});
