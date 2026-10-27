import { describe, expect, it, vi } from "vitest";
import { EMPTY_STATS, STATS_KEY, clearStats, readStats, recordCheck } from "../lib/local-stats";

function memory() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
}

vi.stubGlobal("window", { dispatchEvent: () => true });

describe("local stats", () => {
  it("counts verdicts and networks, and stores no addresses", () => {
    const s = memory();
    recordCheck({ verdict: "safe", network: "arb", at: new Date("2026-10-27T10:00:00Z") }, s);
    recordCheck({ verdict: "block", network: "base", at: new Date("2026-10-27T11:00:00Z") }, s);
    const r = readStats(s);
    expect(r).toMatchObject({ total: 2, safe: 1, block: 1, check: 0, byNetwork: { arb: 1, base: 1 }, firstAt: "2026-10-27T10:00:00.000Z", lastAt: "2026-10-27T11:00:00.000Z" });
    expect(s.m.get(STATS_KEY)).not.toMatch(/0x/);
  });

  it("ignores corrupt data and clears", () => {
    const s = memory();
    s.setItem(STATS_KEY, "{not json");
    expect(readStats(s)).toEqual(EMPTY_STATS);
    s.setItem(STATS_KEY, JSON.stringify({ total: -1 }));
    expect(readStats(s)).toEqual(EMPTY_STATS);
    recordCheck({ verdict: "check", network: "<script>" }, s);
    expect(readStats(s).byNetwork).toEqual({});
    clearStats(s);
    expect(readStats(s)).toEqual(EMPTY_STATS);
  });
});
