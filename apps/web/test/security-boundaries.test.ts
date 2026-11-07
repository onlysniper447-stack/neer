import { describe, expect, it, vi } from "vitest";
import { DeclaredTransferSchema, preflight, type Lookup } from "@neer/core";
import { ASSETS, TEST_PUBLIC_KEY, TOKENS, arbUsdc, makeStatus } from "@neer/fixtures/scenarios";
import { readJsonBody } from "@/lib/server/read-json-body";
import { StatusCache } from "@/lib/server/status-cache";
import { isFreshSafe } from "@/lib/result-freshness";

const missing = (): Promise<Lookup> => Promise.resolve({ kind: "not_found" });

describe("tracker cache boundaries", () => {
  it("keeps case-sensitive addresses separate, with structured memo keys", async () => {
    const cache = new StatusCache();
    const load = vi.fn(missing);
    await cache.get("AbCd", "1", load, 0);
    await cache.get("abcd", "1", load, 0);
    await cache.get("AbCd", "1", load, 1);
    await cache.get("a|b", "c", load, 1);
    await cache.get("a", "b|c", load, 1);
    expect(load).toHaveBeenCalledTimes(4);
  });

  it("expires at the TTL and enforces the hard entry cap even when all entries are fresh", async () => {
    const cache = new StatusCache(1_000, 2);
    const load = vi.fn(missing);
    await cache.get("a", null, load, 0);
    await cache.get("a", null, load, 999);
    expect(load).toHaveBeenCalledTimes(1);
    await cache.get("a", null, load, 1_000);
    await cache.get("b", null, load, 1_001);
    await cache.get("c", null, load, 1_002);
    await cache.get("a", null, load, 1_003);
    expect(load).toHaveBeenCalledTimes(5);
  });
});

describe("streamed API body limit", () => {
  it("accepts a small JSON body", async () => {
    expect(await readJsonBody(new Request("https://neer.test", { method: "POST", body: '{"ok":true}' }))).toEqual({ ok: true, value: { ok: true } });
  });

  it("counts UTF-8 bytes rather than JavaScript characters", async () => {
    const result = await readJsonBody(new Request("https://neer.test", { method: "POST", body: JSON.stringify("é".repeat(33_000)) }));
    expect(result).toEqual({ ok: false, message: "Request body is too large." });
  });

  it("cancels a chunked oversized stream despite a false Content-Length", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ pull(controller) { controller.enqueue(new Uint8Array(40_000)); }, cancel });
    const request = new Request("https://neer.test", { method: "POST", headers: { "content-length": "1" }, body: stream, duplex: "half" } as RequestInit);
    expect(await readJsonBody(request)).toMatchObject({ ok: false });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("rejects invalid JSON and read failures without throwing", async () => {
    expect(await readJsonBody(new Request("https://neer.test", { method: "POST", body: "{" }))).toMatchObject({ ok: false });
    const stream = new ReadableStream<Uint8Array>({ start(c) { c.error(new Error("aborted")); } });
    const request = new Request("https://neer.test", { method: "POST", body: stream, duplex: "half" } as RequestInit);
    expect(await readJsonBody(request)).toMatchObject({ ok: false });
  });
});

describe("web Safe expiry", () => {
  it("does not leave a previous Safe live after age or its timing boundary", () => {
    const now = new Date();
    const qr = arbUsdc(now);
    const result = preflight({ depositAddress: qr.quote.depositAddress!, transfer: DeclaredTransferSchema.parse({ chain: "arb", asset: ASSETS.arbUsdc, amount: "5000000", source: "wallet" }), lookup: { kind: "found", status: makeStatus(qr, "PENDING_DEPOSIT", now), fetchedAt: now }, tokens: TOKENS.map((t) => ({ ...t, priceUpdatedAt: now.toISOString() })), quotePublicKey: TEST_PUBLIC_KEY, now });
    expect(isFreshSafe(result, now.getTime())).toBe(true);
    expect(isFreshSafe(result, now.getTime() + 60_000)).toBe(false);
    result.checks.find((c) => c.id === "time")!.expected!.safeUntil = new Date(now.getTime() + 10_000).toISOString();
    expect(isFreshSafe(result, now.getTime() + 10_000)).toBe(false);
    expect(isFreshSafe(result, NaN)).toBe(false);
  });
});
