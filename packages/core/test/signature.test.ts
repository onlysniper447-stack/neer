import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { verifyQuoteSignature as sdkVerify } from "@defuse-protocol/one-click-sdk-typescript";
import { QuoteResponseSchema, StatusResponseSchema, quoteMessage, stableStringify, verifyQuoteSignature } from "../src/index.js";
import liveStatus from "../../../fixtures/recorded/status_arb_usdc_live.json" with { type: "json" };
import liveQuote from "../../../fixtures/recorded/quote_arb_usdc_live.json" with { type: "json" };
import dryQuote from "../../../fixtures/recorded/quote_eth_dry.json" with { type: "json" };
import { TEST_PUBLIC_KEY, issue382, stellarMemo } from "../../../fixtures/src/scenarios.js";

const require = createRequire(import.meta.url);
const jsonStableStringify = require("json-stable-stringify") as (v: unknown) => string;

describe("1Click quote signatures (recorded live data, real 1Click key)", () => {
  it("verifies the quoteResponse inside a live /v0/status response", () => {
    const status = StatusResponseSchema.parse(liveStatus);
    expect(verifyQuoteSignature(status.quoteResponse)).toBe(true);
  });

  it("verifies a live POST /v0/quote response", () => {
    expect(verifyQuoteSignature(QuoteResponseSchema.parse(liveQuote))).toBe(true);
  });

  it("verifies a live dry quote", () => {
    expect(verifyQuoteSignature(QuoteResponseSchema.parse(dryQuote))).toBe(true);
  });

  it("rejects a tampered deposit address", () => {
    const q = QuoteResponseSchema.parse(liveQuote);
    q.quote.depositAddress = "0x4A650577B8032721277998f3A1480335DDFCFe94";
    expect(verifyQuoteSignature(q)).toBe(false);
  });

  it("rejects a tampered refund address and amount", () => {
    const a = QuoteResponseSchema.parse(liveQuote);
    a.quoteRequest.refundTo = "0x0000000000000000000000000000000000000001";
    expect(verifyQuoteSignature(a)).toBe(false);
    const b = QuoteResponseSchema.parse(liveQuote);
    b.quote.amountIn = "5000001";
    expect(verifyQuoteSignature(b)).toBe(false);
  });

  it("rejects garbage signatures and keys without throwing", () => {
    const q = QuoteResponseSchema.parse(liveQuote);
    expect(verifyQuoteSignature({ ...q, signature: "ed25519:notbase58!!" })).toBe(false);
    expect(verifyQuoteSignature({ ...q, signature: "" })).toBe(false);
    expect(verifyQuoteSignature(q, "ed25519:111")).toBe(false);
  });

  it("matches the official SDK on every recorded payload", () => {
    for (const raw of [liveQuote, dryQuote, (liveStatus as { quoteResponse: unknown }).quoteResponse]) {
      const parsed = QuoteResponseSchema.parse(raw);
      expect(verifyQuoteSignature(parsed)).toBe(sdkVerify(raw as never));
    }
  });

  it("matches the official SDK for locally signed fixtures (test key)", () => {
    for (const q of [issue382(new Date()), stellarMemo(new Date())]) {
      expect(verifyQuoteSignature(q, TEST_PUBLIC_KEY)).toBe(true);
      expect(sdkVerify(q as never, TEST_PUBLIC_KEY)).toBe(true);
      expect(verifyQuoteSignature(q)).toBe(false); // not signed by 1Click
    }
  });

  it("builds a stable message", () => {
    const q = QuoteResponseSchema.parse(liveQuote);
    expect(quoteMessage(q)).toBe(quoteMessage(QuoteResponseSchema.parse(JSON.parse(JSON.stringify(liveQuote)))));
  });
});

describe("stableStringify", () => {
  it("is byte-identical to json-stable-stringify on recorded payloads", () => {
    for (const raw of [liveQuote, dryQuote, liveStatus]) {
      expect(stableStringify(raw)).toBe(jsonStableStringify(raw));
    }
  });
  it("omits undefined, sorts keys, keeps null", () => {
    const v = { b: 1, a: undefined, c: null, d: [undefined, 2], e: { z: "x", y: true } };
    expect(stableStringify(v)).toBe(jsonStableStringify(v));
    expect(stableStringify(v)).toBe('{"b":1,"c":null,"d":[null,2],"e":{"y":true,"z":"x"}}');
  });
});
