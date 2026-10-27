import { describe, expect, it } from "vitest";
import { verifyQuoteSignature } from "@neer/core";
import { OneClickClient } from "../src/index.js";
import liveStatus from "../../../fixtures/recorded/status_arb_usdc_live.json" with { type: "json" };
import liveTokens from "../../../fixtures/recorded/tokens_live.json" with { type: "json" };

function fakeFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init)) as typeof fetch;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("OneClickClient.getStatus", () => {
  it("parses a recorded live status and keeps the signature verifiable", async () => {
    let seen = "";
    const client = new OneClickClient({ fetch: fakeFetch((url) => ((seen = url), json(liveStatus))) });
    const res = await client.getStatus("0x4A650577B8032721277998f3A1480335DDFCFe93");
    expect(seen).toBe("https://1click.chaindefuser.com/v0/status?depositAddress=0x4A650577B8032721277998f3A1480335DDFCFe93");
    expect(res.kind).toBe("found");
    if (res.kind === "found") {
      expect(res.status.status).toBe("PENDING_DEPOSIT");
      expect(verifyQuoteSignature(res.status.quoteResponse)).toBe(true);
    }
  });

  it("sends the memo when given", async () => {
    let seen = "";
    const client = new OneClickClient({ fetch: fakeFetch((url) => ((seen = url), json({}, 404))) });
    await client.getStatus("GABC", "12345");
    expect(seen).toContain("depositMemo=12345");
  });

  it("maps 404 to not_found (recorded body)", async () => {
    const body = { message: "Deposit address 0xDF7A93d400159d0f8f40AAe42576d01285EA9e39 not found", error: "Not Found", statusCode: 404 };
    const client = new OneClickClient({ fetch: fakeFetch(() => json(body, 404)) });
    expect(await client.getStatus("0xDF7A93d400159d0f8f40AAe42576d01285EA9e39")).toEqual({ kind: "not_found" });
  });

  it("maps 429 and 5xx to errors", async () => {
    expect(await new OneClickClient({ fetch: fakeFetch(() => json({}, 429)) }).getStatus("x")).toEqual({ kind: "error", reason: "rate_limited" });
    expect(await new OneClickClient({ fetch: fakeFetch(() => json({}, 503)) }).getStatus("x")).toMatchObject({ kind: "error", reason: "bad_status" });
  });

  it("maps a schema mismatch to invalid_response", async () => {
    const client = new OneClickClient({ fetch: fakeFetch(() => json({ status: "WHATEVER" })) });
    expect(await client.getStatus("x")).toMatchObject({ kind: "error", reason: "invalid_response" });
  });

  it("maps non-JSON to invalid_response", async () => {
    const client = new OneClickClient({ fetch: fakeFetch(() => new Response("<html>", { status: 200 })) });
    expect(await client.getStatus("x")).toMatchObject({ kind: "error", reason: "invalid_response" });
  });

  it("times out", async () => {
    const hang = fakeFetch((_url, init) => new Promise<Response>((_res, rej) => init?.signal?.addEventListener("abort", () => rej(new Error("aborted")))));
    const client = new OneClickClient({ fetch: hang, timeoutMs: 20 });
    expect(await client.getStatus("x")).toEqual({ kind: "error", reason: "timeout" });
  });

  it("maps network failures", async () => {
    const client = new OneClickClient({ fetch: fakeFetch(() => { throw new TypeError("fetch failed"); }) });
    expect(await client.getStatus("x")).toMatchObject({ kind: "error", reason: "network" });
  });

  it("attaches a partner JWT only when configured", async () => {
    let auth: string | null = "unset";
    const f = fakeFetch((_u, init) => ((auth = new Headers(init?.headers).get("authorization")), json(liveStatus)));
    await new OneClickClient({ fetch: f }).getStatus("x");
    expect(auth).toBeNull();
    await new OneClickClient({ fetch: f, jwt: "abc" }).getStatus("x");
    expect(auth).toBe("Bearer abc");
  });
});

describe("OneClickClient.getTokens", () => {
  it("parses the recorded live token list", async () => {
    const res = await new OneClickClient({ fetch: fakeFetch(() => json(liveTokens)) }).getTokens();
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.tokens.length).toBe(208);
  });
  it("fails closed on bad data", async () => {
    expect(await new OneClickClient({ fetch: fakeFetch(() => json([{ nope: 1 }])) }).getTokens()).toEqual({ ok: false, reason: "invalid_response" });
  });
});
