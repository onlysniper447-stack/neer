import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Lookup } from "@neer/core";
import { ASSETS, E2E_ADDRESSES, TEST_PUBLIC_KEY, TOKENS, arbUsdc, issue382, makeStatus } from "@neer/fixtures/scenarios";

const lookups = new Map<string, () => Lookup>();
let tokens = TOKENS;

vi.mock("@/lib/server/upstream", () => ({
  quotePublicKeyOverride: TEST_PUBLIC_KEY,
  getTokens: async () => ({ tokens: tokens.map((t) => ({ ...t, priceUpdatedAt: new Date().toISOString() })), fresh: true }),
  getStatus: async (address: string) => (lookups.get(address.toLowerCase()) ?? (() => ({ kind: "not_found" }) as Lookup))(),
}));

const { preflightService, loadCheckPage } = await import("@/lib/server/service");
const { trackService } = await import("@/lib/server/track");

const found = (status: ReturnType<typeof makeStatus>): Lookup => ({ kind: "found", status, fetchedAt: new Date() });

beforeEach(() => {
  tokens = TOKENS;
  lookups.clear();
  lookups.set(E2E_ADDRESSES.issue382.toLowerCase(), () => found(makeStatus(issue382(new Date()), "PENDING_DEPOSIT", new Date())));
  lookups.set(E2E_ADDRESSES.safe.toLowerCase(), () =>
    found(makeStatus(arbUsdc(new Date(), { depositAddress: E2E_ADDRESSES.safe }), "PENDING_DEPOSIT", new Date())),
  );
  lookups.set(E2E_ADDRESSES.upstreamDown.toLowerCase(), () => ({ kind: "error", reason: "timeout" }) as Lookup);
});
afterEach(() => vi.useRealTimers());

const body = (address: string, transfer: Record<string, unknown>) => ({ deposit: { address }, transfer: { source: "wallet", ...transfer } });

describe("preflightService", () => {
  it("400 with issues for a bad body", async () => {
    const r = await preflightService({ deposit: {} }, "req_1");
    expect(r.status).toBe(400);
    expect("error" in r.body && r.body.error?.code).toBe("NEER_INVALID_INPUT");
  });

  it("422 for a network Neer doesn't know", async () => {
    const r = await preflightService(body(E2E_ADDRESSES.safe, { chain: "notachain", asset: "native", amount: "1" }), "req_2");
    expect(r.status).toBe(422);
    expect("error" in r.body && r.body.error?.code).toBe("NEER_UNSUPPORTED_CHAIN");
  });

  it("200 safe for a matching send", async () => {
    const r = await preflightService(body(E2E_ADDRESSES.safe, { chain: "arb", asset: ASSETS.arbUsdc, amount: "5000000" }), "req_3");
    expect(r.status).toBe(200);
    expect("verdict" in r.body && r.body.verdict).toBe("safe");
    expect(r.body.requestId).toBe("req_3");
  });

  it("200 block for the #382 replay", async () => {
    const r = await preflightService(body(E2E_ADDRESSES.issue382, { chain: "base", asset: "native", amount: "170000000000000000" }), "req_4");
    expect(r.status).toBe(200);
    expect("verdict" in r.body && r.body.verdict).toBe("block");
  });

  it("404 block for an unknown address", async () => {
    const r = await preflightService(body(E2E_ADDRESSES.notFound, { chain: "arb", asset: ASSETS.arbUsdc, amount: "5000000" }), "req_5");
    expect(r.status).toBe(404);
    expect("verdict" in r.body && r.body.verdict).toBe("block");
    expect("error" in r.body && r.body.error?.code).toBe("NEER_QUOTE_NOT_FOUND");
  });

  it("503 and never safe when 1Click times out", async () => {
    const r = await preflightService(body(E2E_ADDRESSES.upstreamDown, { chain: "arb", asset: ASSETS.arbUsdc, amount: "5000000" }), "req_6");
    expect(r.status).toBe(503);
    expect("verdict" in r.body && r.body.verdict).not.toBe("safe");
    expect("error" in r.body && r.body.error?.code).toBe("NEER_UPSTREAM_UNAVAILABLE");
  });

  it("without a token list the verdict can't be safe", async () => {
    tokens = [];
    const r = await preflightService(body(E2E_ADDRESSES.safe, { chain: "arb", asset: ASSETS.arbUsdc, amount: "5000000" }), "req_7");
    expect("verdict" in r.body && r.body.verdict).not.toBe("safe");
  });
});

describe("loadCheckPage", () => {
  it("expired quotes are a hard stop before asking how you'll send", async () => {
    lookups.set(E2E_ADDRESSES.expired.toLowerCase(), () =>
      found(makeStatus(arbUsdc(new Date(), { depositAddress: E2E_ADDRESSES.expired, requestDeadlineMin: -5 }), "PENDING_DEPOSIT", new Date())),
    );
    const page = await loadCheckPage(E2E_ADDRESSES.expired, null);
    expect(page.hardStop).toBe(true);
    expect(page.result.verdict).toBe("block");
  });

  it("a live quote asks how you'll send (no hard stop)", async () => {
    const page = await loadCheckPage(E2E_ADDRESSES.safe, null);
    expect(page.hardStop).toBe(false);
    expect(page.unavailable).toBe(false);
    expect(page.result.quote?.originChain).toBe("arb");
  });
});

describe("trackService", () => {
  it("returns status, timeline and https explorer links only", async () => {
    const qr = arbUsdc(new Date(), { depositAddress: E2E_ADDRESSES.used });
    const st = makeStatus(qr, "SUCCESS", new Date());
    st.swapDetails!.originChainTxHashes = [
      { hash: "0xaa", explorerUrl: "javascript:alert(1)" },
      { hash: "0xbb", explorerUrl: "https://arbiscan.io/tx/0xbb" },
    ];
    lookups.set(E2E_ADDRESSES.used.toLowerCase(), () => found(st));
    const r = await trackService(E2E_ADDRESSES.used, null, "req_8");
    expect(r.status).toBe(200);
    const b = r.body as { status: string; terminal: boolean; originTxs: { hash: string; explorerUrl: string | null }[] };
    expect(b.status).toBe("SUCCESS");
    expect(b.terminal).toBe(true);
    expect(b.originTxs).toEqual([
      { hash: "0xaa", explorerUrl: null },
      { hash: "0xbb", explorerUrl: "https://arbiscan.io/tx/0xbb" },
    ]);
  });

  it("404 for unknown, 503 when 1Click is down", async () => {
    expect((await trackService(E2E_ADDRESSES.notFound, null, "r")).status).toBe(404);
    expect((await trackService(E2E_ADDRESSES.upstreamDown, null, "r")).status).toBe(503);
  });
});
