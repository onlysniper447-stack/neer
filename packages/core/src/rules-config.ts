/**
 * Versioned, dated rules config. The chain minimums are temporary 1Click rules
 * that change; `checkedAt` is when a human last confirmed them against the docs.
 */
export interface RulesConfig {
  version: string;
  minimums: {
    checkedAt: string;
    sources: string[];
    /** Origin->origin swaps below this USD amount do not fill when either side is on one of these chains. */
    usd1000Chains: string[];
    usd1000: string;
    /** Origin->origin swaps with a Tron deposit below this USD amount are rejected. */
    tronOriginUsd: string;
  };
  /** After this many days without re-checking, the minimum check says so (Warn). */
  minimumsMaxAgeDays: number;
  /** Status data older than this at verdict time is stale. */
  statusMaxAgeSec: number;
  /** Token price older than this makes USD-based checks approximate. */
  priceMaxAgeSec: number;
  /** Warn when time left is below max(2 x chain budget, this). */
  nearExpiryWarnSec: number;
}

export const DEFAULT_RULES: RulesConfig = {
  version: "2026.10.0",
  minimums: {
    checkedAt: "2026-10-27T10:30:00Z",
    sources: [
      "https://docs.near-intents.org/changelog/entries/2026-09-09-temporary-1000-minimum",
      "https://docs.near-intents.org/changelog/entries/2026-09-14-temporary-tron-100-minimum",
    ],
    usd1000Chains: ["bsc", "pol", "ton", "op", "avax", "stellar", "monad", "xlayer", "adi"],
    usd1000: "1000",
    tronOriginUsd: "100",
  },
  minimumsMaxAgeDays: 14,
  statusMaxAgeSec: 60,
  priceMaxAgeSec: 15 * 60,
  nearExpiryWarnSec: 10 * 60,
};
