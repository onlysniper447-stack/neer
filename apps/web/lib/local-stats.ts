/**
 * Local-only counts of the preflights this browser ran. Stored in localStorage,
 * never sent anywhere. Only verdicts, network ids and times: no addresses,
 * amounts or quotes.
 */
export const STATS_KEY = "neer:local-stats:v1";

export interface LocalStats {
  total: number;
  safe: number;
  check: number;
  block: number;
  /** Count per origin network id, e.g. { arb: 3 } */
  byNetwork: Record<string, number>;
  firstAt: string | null;
  lastAt: string | null;
}

export const EMPTY_STATS: LocalStats = { total: 0, safe: 0, check: 0, block: 0, byNetwork: {}, firstAt: null, lastAt: null };

function isStats(x: unknown): x is LocalStats {
  if (!x || typeof x !== "object") return false;
  const s = x as Record<string, unknown>;
  return ["total", "safe", "check", "block"].every((k) => typeof s[k] === "number" && Number.isFinite(s[k]) && (s[k] as number) >= 0) && typeof s.byNetwork === "object" && s.byNetwork !== null;
}

export function readStats(storage: Pick<Storage, "getItem"> | undefined = globalThis.localStorage): LocalStats {
  try {
    const raw = storage?.getItem(STATS_KEY);
    if (!raw) return EMPTY_STATS;
    const parsed: unknown = JSON.parse(raw);
    return isStats(parsed) ? parsed : EMPTY_STATS;
  } catch {
    return EMPTY_STATS;
  }
}

export function recordCheck(
  entry: { verdict: "safe" | "check" | "block"; network: string | null; at?: Date },
  storage: Pick<Storage, "getItem" | "setItem"> | undefined = globalThis.localStorage,
): LocalStats | null {
  try {
    if (!storage) return null;
    const prev = readStats(storage);
    const at = (entry.at ?? new Date()).toISOString();
    const network = entry.network && /^[a-z0-9_-]{1,32}$/.test(entry.network) ? entry.network : null;
    const next: LocalStats = {
      ...prev,
      total: prev.total + 1,
      [entry.verdict]: prev[entry.verdict] + 1,
      byNetwork: network ? { ...prev.byNetwork, [network]: (prev.byNetwork[network] ?? 0) + 1 } : prev.byNetwork,
      firstAt: prev.firstAt ?? at,
      lastAt: at,
    };
    storage.setItem(STATS_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event("neer-stats"));
    return next;
  } catch {
    return null; // storage full or blocked: stats are optional
  }
}

export function clearStats(storage: Pick<Storage, "removeItem"> | undefined = globalThis.localStorage): void {
  try {
    storage?.removeItem(STATS_KEY);
    window.dispatchEvent(new Event("neer-stats"));
  } catch {
    // ignore
  }
}
