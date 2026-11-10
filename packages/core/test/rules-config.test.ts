import { describe, expect, it } from "vitest";
import { DEFAULT_RULES } from "../src/index.js";

/**
 * Rule data freshness at a fixed date. Bump FIXED_DATE together with the
 * next minimums refresh (re-check the sources, then update checkedAt and version).
 */
const FIXED_DATE = new Date("2026-11-10T12:00:00Z");
const DAY_MS = 86_400_000;

describe("DEFAULT_RULES minimums", () => {
  const m = DEFAULT_RULES.minimums;
  const checked = new Date(m.checkedAt);

  it("keeps the 14-day staleness rule", () => {
    expect(DEFAULT_RULES.minimumsMaxAgeDays).toBe(14);
  });

  it("are not stale at the fixed test date", () => {
    expect(Number.isFinite(checked.getTime())).toBe(true);
    expect(checked.getTime()).toBeLessThanOrEqual(FIXED_DATE.getTime());
    const ageDays = (FIXED_DATE.getTime() - checked.getTime()) / DAY_MS;
    expect(ageDays).toBeLessThan(DEFAULT_RULES.minimumsMaxAgeDays);
  });

  it("has a version in the YYYY.MM.N form matching the checkedAt month", () => {
    const match = /^(\d{4})\.(\d{2})\.(\d+)$/.exec(DEFAULT_RULES.version);
    expect(match).not.toBeNull();
    expect(`${match![1]}-${match![2]}`).toBe(m.checkedAt.slice(0, 7));
  });

  it("matches the published NEAR Intents minimums it cites", () => {
    expect(m.sources).toContain("https://docs.near-intents.org/changelog/entries/2026-09-09-temporary-1000-minimum");
    expect(m.sources).toContain("https://docs.near-intents.org/changelog/entries/2026-09-14-temporary-tron-100-minimum");
    expect([...m.usd1000Chains].sort()).toEqual(["adi", "avax", "bsc", "monad", "op", "pol", "stellar", "ton", "xlayer"]);
    expect(m.usd1000).toBe("1000");
    expect(m.tronOriginUsd).toBe("100");
  });
});
