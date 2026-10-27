import "server-only";
import { ONE_CLICK_BASE_URL, OneClickClient } from "@neer/oneclick";
import type { Lookup, Token } from "@neer/core";

const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

/**
 * The upstream is pinned to the public 1Click host. Tests may point it at a
 * local mock with NEER_TEST_UPSTREAM, and only a loopback URL is accepted, so a
 * stray env var can never send production traffic (or trust) elsewhere.
 */
function resolveUpstream(): { baseUrl: string; testPublicKey?: string } {
  const test = process.env.NEER_TEST_UPSTREAM;
  if (!test) return { baseUrl: ONE_CLICK_BASE_URL };
  const url = new URL(test);
  if (!LOOPBACK.has(url.hostname)) {
    throw new Error("NEER_TEST_UPSTREAM must be a loopback URL (it is for local tests only)");
  }
  return { baseUrl: test, testPublicKey: process.env.NEER_TEST_QUOTE_PUBKEY || undefined };
}

const upstream = resolveUpstream();

/** Only set when running against a loopback test upstream. */
export const quotePublicKeyOverride = upstream.testPublicKey;

const client = new OneClickClient({
  baseUrl: upstream.baseUrl,
  jwt: process.env.ONECLICK_JWT || undefined,
  timeoutMs: 8000,
});

// ------------------------------------------------------------------ tokens: 5 min cache, stale on error

const TOKENS_TTL_MS = 5 * 60_000;
const TOKENS_MAX_STALE_MS = 60 * 60_000;
let tokensCache: { tokens: Token[]; at: number } | null = null;
let tokensInflight: Promise<Token[]> | null = null;

/** `fetchedAt` is when 1Click last returned the list (ms since epoch), null if never. */
export type TokensState = { tokens: Token[]; fresh: boolean; fetchedAt: number | null };

export async function getTokens(): Promise<TokensState> {
  const now = Date.now();
  if (tokensCache && now - tokensCache.at < TOKENS_TTL_MS) return { tokens: tokensCache.tokens, fresh: true, fetchedAt: tokensCache.at };
  tokensInflight ??= (async () => {
    try {
      const res = await client.getTokens();
      if (res.ok) {
        tokensCache = { tokens: res.tokens, at: Date.now() };
        return res.tokens;
      }
      throw new Error(res.reason);
    } finally {
      tokensInflight = null;
    }
  })();
  try {
    const tokens = await tokensInflight;
    return { tokens, fresh: true, fetchedAt: tokensCache?.at ?? Date.now() };
  } catch {
    if (tokensCache && now - tokensCache.at < TOKENS_MAX_STALE_MS) return { tokens: tokensCache.tokens, fresh: false, fetchedAt: tokensCache.at };
    // No token list: dependent checks report "unknown", so the verdict can't be Safe.
    return { tokens: [], fresh: false, fetchedAt: null };
  }
}

// ------------------------------------------------------------------ status

const STATUS_DEDUPE_MS = 5_000;
const statusCache = new Map<string, { at: number; value: Promise<Lookup> }>();

/**
 * Status lookup. Preflight always reads fresh (`dedupe: false`); the tracker
 * shares one upstream call per address per 5 s across all viewers.
 */
export function getStatus(address: string, memo: string | null | undefined, opts: { dedupe: boolean }): Promise<Lookup> {
  if (!opts.dedupe) return client.getStatus(address, memo);
  const key = `${address.toLowerCase()}|${memo ?? ""}`;
  const now = Date.now();
  const hit = statusCache.get(key);
  if (hit && now - hit.at < STATUS_DEDUPE_MS) return hit.value;
  const value = client.getStatus(address, memo);
  statusCache.set(key, { at: now, value });
  if (statusCache.size > 5_000) {
    for (const [k, v] of statusCache) if (now - v.at >= STATUS_DEDUPE_MS) statusCache.delete(k);
  }
  return value;
}
