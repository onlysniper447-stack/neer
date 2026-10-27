import { DEFAULT_RULES, getChain, isKnownChain, type RulesConfig, type Token } from "@neer/core";

export interface NetworkRow {
  id: string;
  name: string;
  tokens: number;
  /** Neer validates addresses (format and checksum) for this network. */
  validated: boolean;
  /** Minimum Neer enforces for swaps touching this network, if any. */
  minimum: string | null;
  confirmBudgetSec: number;
}

export interface Overview {
  networks: number;
  tokens: number;
  validatedNetworks: number;
  /** Newest token price timestamp in the list, ISO. */
  newestPrice: string | null;
  rows: NetworkRow[];
}

export function minimumFor(id: string, rules: RulesConfig = DEFAULT_RULES): string | null {
  const usd = (n: string) => `$${Number(n).toLocaleString("en-US")}`;
  if (rules.minimums.usd1000Chains.includes(id)) return `${usd(rules.minimums.usd1000)} (from or to)`;
  if (id === "tron") return `${usd(rules.minimums.tronOriginUsd)} (from Tron)`;
  return null;
}

/** Counts and per-network rows from the live 1Click token list. Pure, so it's unit-tested. */
export function overviewFromTokens(tokens: Token[], rules: RulesConfig = DEFAULT_RULES): Overview {
  const byChain = new Map<string, number>();
  let newest: number | null = null;
  for (const t of tokens) {
    byChain.set(t.blockchain, (byChain.get(t.blockchain) ?? 0) + 1);
    const ts = t.priceUpdatedAt ? Date.parse(t.priceUpdatedAt) : NaN;
    if (Number.isFinite(ts) && (newest === null || ts > newest)) newest = ts;
  }
  const rows: NetworkRow[] = [...byChain.entries()]
    .map(([id, count]) => {
      const c = getChain(id);
      return {
        id,
        name: isKnownChain(id) ? c.name : id.toUpperCase(),
        tokens: count,
        validated: c.family !== "unsupported",
        minimum: minimumFor(id, rules),
        confirmBudgetSec: c.confirmBudgetSec,
      };
    })
    .sort((a, b) => b.tokens - a.tokens || a.name.localeCompare(b.name));
  return {
    networks: rows.length,
    tokens: tokens.length,
    validatedNetworks: rows.filter((r) => r.validated).length,
    newestPrice: newest === null ? null : new Date(newest).toISOString(),
    rows,
  };
}

/** Date after which Neer treats its copy of the minimums as unconfirmed. */
export function minimumsExpireAt(rules: RulesConfig = DEFAULT_RULES): string {
  return new Date(Date.parse(rules.minimums.checkedAt) + rules.minimumsMaxAgeDays * 86_400_000).toISOString();
}
