import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_RULES, TokenSchema } from "@neer/core";
import { minimumsAreCurrent, minimumFor, minimumsExpireAt, overviewFromTokens } from "../lib/analytics";

const live = TokenSchema.array().parse(JSON.parse(readFileSync(new URL("../../../fixtures/recorded/tokens_live.json", import.meta.url), "utf8")));

describe("overviewFromTokens", () => {
  it("counts networks and tokens from the recorded live list", () => {
    const o = overviewFromTokens(live);
    expect(o.tokens).toBe(live.length);
    expect(o.networks).toBe(new Set(live.map((t) => t.blockchain)).size);
    expect(o.rows.reduce((n, r) => n + r.tokens, 0)).toBe(live.length);
    expect(o.validatedNetworks).toBeLessThanOrEqual(o.networks);
    expect(o.rows.find((r) => r.id === "eth")?.validated).toBe(true);
  });

  it("is empty, not invented, when the list is empty", () => {
    expect(overviewFromTokens([])).toEqual({ networks: 0, tokens: 0, validatedNetworks: 0, newestPrice: null, rows: [] });
  });
});

describe("minimums", () => {
  it("matches the rules config", () => {
    expect(minimumFor("bsc")).toBe("$1,000 (from or to)");
    expect(minimumFor("tron")).toBe("$100 (from Tron)");
    expect(minimumFor("arb")).toBeNull();
    const expires = Date.parse(minimumsExpireAt());
    expect(minimumsAreCurrent(DEFAULT_RULES, expires - 1)).toBe(true);
    expect(minimumsAreCurrent(DEFAULT_RULES, expires)).toBe(false);
    expect(minimumsExpireAt()).toBe(new Date(Date.parse(DEFAULT_RULES.minimums.checkedAt) + DEFAULT_RULES.minimumsMaxAgeDays * 86_400_000).toISOString());
  });
});
