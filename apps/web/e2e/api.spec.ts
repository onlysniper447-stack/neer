import { expect, test } from "@playwright/test";
import { ASSETS, E2E_ADDRESSES } from "@neer/fixtures/scenarios";
import { API_EXAMPLE_BODY } from "../lib/api-example";

const preflight = (address: string, transfer: Record<string, unknown>) => ({
  data: { deposit: { address }, transfer: { source: "wallet", ...transfer } },
});

test("POST /api/v1/preflight returns a signed-quote verdict", async ({ request }) => {
  const res = await request.post("/api/v1/preflight", preflight(E2E_ADDRESSES.issue382, { chain: "base", asset: ASSETS.baseEth, amount: "170000000000000000" }));
  expect(res.status()).toBe(200);
  expect(res.headers()["cache-control"]).toContain("no-store");
  expect(res.headers()["x-request-id"]).toBeTruthy();
  const body = await res.json();
  expect(body.verdict).toBe("block");
  expect(body.checks.find((c: { id: string }) => c.id === "network").severity).toBe("block");
  expect(body.quote.verified).toBe(true);
  expect(body.signedQuote.signature).toMatch(/^ed25519:/);
  expect(body.checksHash).toMatch(/^[0-9a-f]{64}$/);
});

test("/v1/preflight alias works", async ({ request }) => {
  const res = await request.post("/v1/preflight", preflight(E2E_ADDRESSES.safe, { chain: "arb", asset: ASSETS.arbUsdc, amount: "5000000" }));
  expect(res.status()).toBe(200);
  expect((await res.json()).verdict).toBe("safe");
});

test("bad input is a 400 with field issues", async ({ request }) => {
  const res = await request.post("/api/v1/preflight", { data: { deposit: { address: "" }, transfer: {} } });
  expect(res.status()).toBe(400);
  const body = await res.json();
  expect(body.error.code).toBe("NEER_INVALID_INPUT");
  expect(body.error.issues.length).toBeGreaterThan(0);
});

test("non-JSON body is a 400", async ({ request }) => {
  const res = await request.post("/api/v1/preflight", { data: "not json", headers: { "content-type": "application/json" } });
  expect(res.status()).toBe(400);
});

test("unknown quote is a 404 with a Don't send verdict", async ({ request }) => {
  const res = await request.post("/api/v1/preflight", preflight(E2E_ADDRESSES.notFound, { chain: "arb", asset: ASSETS.arbUsdc, amount: "5000000" }));
  expect(res.status()).toBe(404);
  const body = await res.json();
  expect(body.verdict).toBe("block");
});

test("upstream failure is a 503 that never says safe", async ({ request }) => {
  const res = await request.post("/api/v1/preflight", preflight(E2E_ADDRESSES.upstreamDown, { chain: "arb", asset: ASSETS.arbUsdc, amount: "5000000" }));
  expect(res.status()).toBe(503);
  const body = await res.json();
  expect(body.verdict).not.toBe("safe");
});

test("GET /api/v1/track returns status and timeline", async ({ request }) => {
  const res = await request.get(`/api/v1/track?address=${E2E_ADDRESSES.used}`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.status).toBe("SUCCESS");
  expect(body.terminal).toBe(true);
  expect(body.timeline.length).toBeGreaterThan(0);
});

test("pages send CSP with a nonce and the security headers", async ({ request }) => {
  const res = await request.get("/");
  const h = res.headers();
  expect(h["content-security-policy"]).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["referrer-policy"]).toBe("strict-origin");
});

test("the curl example on the landing page works as shown", async ({ request, page }) => {
  await page.goto("/");
  await expect(page.locator("pre")).toContainText(`"address": "${API_EXAMPLE_BODY.deposit.address}"`);
  await expect(page.locator("pre")).toContainText("curl -X POST http://127.0.0.1:3100/api/v1/preflight");
  const res = await request.post("/api/v1/preflight", { data: API_EXAMPLE_BODY });
  expect(res.status()).toBe(200);
  expect((await res.json()).verdict).toBe("block");
});
