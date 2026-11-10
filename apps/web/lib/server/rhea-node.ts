import "./node-only";
import { z } from "zod";
import type { Token } from "@neer/core";
import {
  NEAR_INTENTS_ROUTERS,
  RheaQuoteInputSchema,
  fromBaseUnits,
  rheaChain,
  toBaseUnits,
  type CheckPrefill,
  type RheaApiError,
  type RheaChainId,
  type RheaQuoteView,
  type RheaToken,
  type RheaTokenDirection,
} from "@/lib/rhea/shared";

/**
 * Read-only client for the RHEA Cross-Chain Swap HTTP API, written against
 * https://github.com/rhea-finance/rhea-sdk-docs/blob/main/CrossChainDexAPI.md.
 *
 * Only the three paths in ALLOWED_PATHS can ever be requested. Swap builds,
 * reports, order submission and history authorization are deliberately absent:
 * Neer never builds, signs or submits a swap.
 */
export const RHEA_BASE_URL = "https://api.rhea.finance";
export const RHEA_TIMEOUT_MS = 8000;
/**
 * Wait RHEA may spend on NEAR Intents and cross-chain providers. Live quotes on
 * 10 Nov 2026 hit RHEA's 3 s default ("quote transport timeout after 3s"); with
 * 5 s a full answer took about 6.2 s, inside RHEA_TIMEOUT_MS.
 */
export const QUOTE_WAIT_MS = 5000;
export const ALLOWED_PATHS = new Set(["/get_chain_prices", "/api/swap/supported_to_tokens", "/api/v2/swap/quote"]);
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const TOKENS_TTL_MS = 10 * 60_000;
const TOKENS_MAX_STALE_MS = 60 * 60_000;
const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

export class RheaError extends Error {
  constructor(readonly code: RheaApiError["code"], readonly status: number, message: string, readonly retryAfterSec?: number) {
    super(message);
    this.name = "RheaError";
  }
  toBody(): { error: RheaApiError } {
    return { error: { code: this.code, message: this.message } };
  }
}

export const NOT_CONFIGURED_MESSAGE =
  "RHEA quotes are not configured on this Neer deployment. It has no RHEA API key, so no quote was requested. Token lists still load.";

/** Same rule as the 1Click upstream: tests may only redirect to loopback. */
export function rheaBaseUrl(): string {
  const test = process.env.NEER_TEST_RHEA_UPSTREAM;
  if (!test) return RHEA_BASE_URL;
  const url = new URL(test);
  if (!LOOPBACK.has(url.hostname)) throw new Error("NEER_TEST_RHEA_UPSTREAM must be a loopback URL (it is for local tests only)");
  return test.replace(/\/$/, "");
}

export function rheaApiKey(): string | null {
  const key = process.env.RHEA_API_KEY?.trim();
  return key ? key : null;
}

export function isRheaConfigured(): boolean {
  return rheaApiKey() !== null;
}

const Envelope = z.object({ code: z.number(), msg: z.string().nullish(), data: z.unknown().optional() }).passthrough();

const cleanMessage = (value: unknown) =>
  typeof value === "string" ? value.replace(/[^\x20-\x7e]/g, " ").replace(/\s+/g, " ").trim().slice(0, 200) : "";

interface RequestOptions {
  method: "GET" | "POST";
  query?: Record<string, string>;
  body?: unknown;
  auth: boolean;
  timeoutMs?: number;
}

async function request(path: string, opts: RequestOptions): Promise<z.infer<typeof Envelope>> {
  if (!ALLOWED_PATHS.has(path)) throw new Error(`RHEA path ${path} is not allowed`);
  const url = new URL(rheaBaseUrl() + path);
  for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.auth) {
    const key = rheaApiKey();
    if (!key) throw new RheaError("RHEA_NOT_CONFIGURED", 503, NOT_CONFIGURED_MESSAGE);
    headers.Authorization = `Bearer ${key}`;
  }
  const timeoutMs = opts.timeoutMs ?? RHEA_TIMEOUT_MS;
  let response: Response;
  try {
    response = await fetch(url, {
      method: opts.method,
      headers,
      ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) }),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
      redirect: "error",
    });
  } catch (err) {
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new RheaError("RHEA_TIMEOUT", 504, `RHEA did not answer within ${Math.round(timeoutMs / 1000)} seconds. Try again.`);
    }
    throw new RheaError("RHEA_UNAVAILABLE", 502, "Neer could not reach the RHEA API. Try again later.");
  }

  let text: string;
  try {
    text = await readLimited(response);
  } catch (err) {
    if (err instanceof RheaError) throw err;
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new RheaError("RHEA_TIMEOUT", 504, `RHEA did not answer within ${Math.round(timeoutMs / 1000)} seconds. Try again.`);
    }
    throw new RheaError("RHEA_UNAVAILABLE", 502, "Neer could not read the RHEA response. Try again later.");
  }
  let json: unknown = null;
  try { json = JSON.parse(text); } catch { /* handled below */ }
  const envelope = Envelope.safeParse(json);

  if (response.status === 401 || response.status === 403 || (envelope.success && (envelope.data.code === 401 || envelope.data.code === 403))) {
    throw new RheaError("RHEA_UNAUTHORIZED", 502, "RHEA rejected the API key configured on this Neer deployment, so no quote is available.");
  }
  if (response.status === 429) {
    const retry = Number(response.headers.get("retry-after"));
    const retryAfterSec = Number.isFinite(retry) && retry > 0 ? Math.min(Math.ceil(retry), 300) : 30;
    throw new RheaError("RHEA_UPSTREAM_RATE_LIMITED", 503, `RHEA is limiting requests. Try again in ${retryAfterSec} seconds.`, retryAfterSec);
  }
  if (!response.ok) throw new RheaError("RHEA_UNAVAILABLE", 502, `RHEA returned HTTP ${response.status}. Try again later.`);
  if (!envelope.success) throw new RheaError("RHEA_BAD_RESPONSE", 502, "RHEA returned a response Neer could not read.");
  return envelope.data;
}

async function readLimited(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    bytes += part.value.byteLength;
    if (bytes > MAX_RESPONSE_BYTES) {
      await reader.cancel().catch(() => {});
      throw new RheaError("RHEA_BAD_RESPONSE", 502, "RHEA returned a response larger than Neer accepts.");
    }
    text += decoder.decode(part.value, { stream: true });
  }
  return text + decoder.decode();
}

// ------------------------------------------------------------------ token lists

const RawFromToken = z.object({
  address: z.string().min(1).max(256),
  decimals: z.number().int().min(0).max(255),
  symbol: z.string().min(1).max(64),
  assetId: z.string().nullish(),
  isNative: z.boolean().nullish(),
}).passthrough();

const RawToToken = z.object({
  address: z.string().nullish(),
  assetId: z.string().nullish(),
  coinType: z.string().nullish(),
  symbol: z.string().min(1).max(64),
  decimals: z.number().int().min(0).max(255),
  isNative: z.boolean().nullish(),
}).passthrough();

const ASSET_ID = /^(nep141|nep245|1cs_v1):[^\s]+$/;
const cleanAssetId = (v: string | null | undefined) => (v && ASSET_ID.test(v) && v.length <= 256 ? v : null);
const cleanSymbol = (v: string) => v.replace(/[^\x20-\x7e]/g, "").trim().slice(0, 32) || "?";

export function normalizeFromTokens(chain: RheaChainId, data: unknown): RheaToken[] {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new RheaError("RHEA_BAD_RESPONSE", 502, "RHEA returned a token list Neer could not read.");
  const out: RheaToken[] = [];
  for (const row of Object.values(data as Record<string, unknown>)) {
    const t = RawFromToken.safeParse(row);
    if (!t.success) continue; // skip unreadable rows rather than rejecting the whole list
    out.push({ chain, address: t.data.address, symbol: cleanSymbol(t.data.symbol), decimals: t.data.decimals, isNative: t.data.isNative === true, assetId: cleanAssetId(t.data.assetId) });
  }
  return dedupe(out);
}

export function normalizeToTokens(chain: RheaChainId, data: unknown): RheaToken[] {
  const parsed = z.object({ tokens: z.array(z.unknown()) }).passthrough().safeParse(data);
  if (!parsed.success) throw new RheaError("RHEA_BAD_RESPONSE", 502, "RHEA returned a token list Neer could not read.");
  const out: RheaToken[] = [];
  for (const row of parsed.data.tokens) {
    const t = RawToToken.safeParse(row);
    if (!t.success) continue;
    const address = t.data.address || t.data.assetId || t.data.coinType;
    if (!address || address.length > 256) continue;
    out.push({ chain, address, symbol: cleanSymbol(t.data.symbol), decimals: t.data.decimals, isNative: t.data.isNative === true, assetId: cleanAssetId(t.data.assetId) });
  }
  return dedupe(out);
}

function dedupe(tokens: RheaToken[]): RheaToken[] {
  const seen = new Set<string>();
  return tokens
    .filter((t) => { const k = addressKey(t.address); if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => a.symbol.localeCompare(b.symbol) || a.address.localeCompare(b.address));
}

/** EVM hex addresses compare case-insensitively; every other format is exact. */
export function addressKey(address: string): string {
  return /^0x[0-9a-fA-F]+$/.test(address) ? address.toLowerCase() : address;
}

type CacheEntry = { tokens: RheaToken[]; at: number };
const tokenCache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<RheaToken[]>>();

export function resetRheaCaches() {
  tokenCache.clear();
  inflight.clear();
}

export async function getRheaTokens(direction: RheaTokenDirection, chainId: RheaChainId, opts: { timeoutMs?: number } = {}): Promise<{ tokens: RheaToken[]; fetchedAt: number; fresh: boolean }> {
  const chain = rheaChain(chainId);
  if (!chain) throw new RheaError("RHEA_INVALID_INPUT", 400, "Unknown RHEA chain.");
  const key = `${direction}:${chain.id}`;
  const now = Date.now();
  const cached = tokenCache.get(key);
  if (cached && now - cached.at < TOKENS_TTL_MS) return { tokens: cached.tokens, fetchedAt: cached.at, fresh: true };
  let load = inflight.get(key);
  if (!load) {
    load = (async () => {
      try {
        const env = direction === "from"
          ? await request("/get_chain_prices", { method: "GET", query: { chain: String(chain.listId) }, auth: false, timeoutMs: opts.timeoutMs })
          : await request("/api/swap/supported_to_tokens", { method: "GET", query: { chain: String(chain.listId) }, auth: false, timeoutMs: opts.timeoutMs });
        if (env.code !== 0) throw new RheaError("RHEA_UNAVAILABLE", 502, "RHEA did not return a token list for this chain.");
        const tokens = direction === "from" ? normalizeFromTokens(chain.id, env.data) : normalizeToTokens(chain.id, env.data);
        tokenCache.set(key, { tokens, at: Date.now() }); // failures are never cached
        return tokens;
      } finally {
        inflight.delete(key);
      }
    })();
    inflight.set(key, load);
  }
  try {
    const tokens = await load;
    return { tokens, fetchedAt: tokenCache.get(key)?.at ?? Date.now(), fresh: true };
  } catch (err) {
    if (cached && now - cached.at < TOKENS_MAX_STALE_MS) return { tokens: cached.tokens, fetchedAt: cached.at, fresh: false };
    throw err;
  }
}

// ------------------------------------------------------------------ quote

const BASE_UNITS = /^\d{1,78}$/;
const RawBestQuote = z.object({
  router: z.string().trim().min(1).max(64),
  routerName: z.string().nullish(),
  amountOut: z.string().optional(),
  estimatedOut: z.string().optional(),
  minAmountOut: z.string().optional(),
}).passthrough();
const RawQuoteData = z.object({
  bestQuote: RawBestQuote,
  allQuotes: z.array(z.unknown()).nullish(),
}).passthrough();

/** Follows the SDK's route normalizer: amountOut ?? estimatedOut; minAmountOut falls back to amountOut. */
export function parseQuoteData(data: unknown): { router: string; routerName: string | null; amountOut: string; minAmountOut: string; alternatives: number } {
  const parsed = RawQuoteData.safeParse(data);
  if (!parsed.success) throw new RheaError("RHEA_BAD_RESPONSE", 502, "RHEA returned a quote Neer could not read.");
  const best = parsed.data.bestQuote;
  const amountOut = (best.amountOut ?? best.estimatedOut)?.trim();
  const minAmountOut = best.minAmountOut?.trim() || amountOut;
  if (!amountOut || !minAmountOut || !BASE_UNITS.test(amountOut) || !BASE_UNITS.test(minAmountOut)) {
    throw new RheaError("RHEA_BAD_RESPONSE", 502, "RHEA returned a quote without readable output amounts.");
  }
  const router = best.router.replace(/[^a-z0-9._-]/gi, "").toLowerCase();
  if (!router) throw new RheaError("RHEA_BAD_RESPONSE", 502, "RHEA returned a quote without a router.");
  const routerName = best.routerName ? cleanMessage(best.routerName).slice(0, 40) || null : null;
  return { router, routerName, amountOut, minAmountOut, alternatives: parsed.data.allQuotes?.length ?? 0 };
}

const FailureData = z.object({
  errorCode: z.string().nullish(),
  reason: z.string().nullish(),
  retryAfterMs: z.number().nullish(),
  errors: z.array(z.unknown()).nullish(),
}).passthrough();

/**
 * A failed quote arrives as HTTP 200 with code -1. Its msg concatenates every
 * provider's internal error (HTTP codes, correlation IDs), so Neer never shows
 * it. Only RHEA's error code, its retry hint and NEAR Intents' own message are
 * used, e.g. "No liquidity available" or "recipient is not valid".
 */
export function quoteFailure(env: { code: number; msg?: string | null; data?: unknown }): RheaError {
  const top = FailureData.safeParse(env);
  const inner = FailureData.safeParse(env.data);
  const pick = <K extends "errorCode" | "reason" | "retryAfterMs">(k: K) => (inner.success ? inner.data[k] : undefined) ?? (top.success ? top.data[k] : undefined);
  const errors = (inner.success ? inner.data.errors : null) ?? [];
  const intents = nearIntentsMessage(errors);
  const intentsNote = intents ? ` NEAR Intents reported: ${intents}.` : "";
  if (pick("errorCode") === "QUOTE_TIMEOUT" || pick("reason") === "quote_timeout") {
    const ms = pick("retryAfterMs");
    const retryAfterSec = typeof ms === "number" && ms > 0 ? Math.min(Math.ceil(ms / 1000), 300) : 10;
    return new RheaError("RHEA_QUOTE_TIMEOUT", 503, `RHEA's route providers did not return a quote in time.${intentsNote} Try again in ${retryAfterSec} seconds.`, retryAfterSec);
  }
  return new RheaError("RHEA_NO_ROUTE", 422, `RHEA found no route for this request.${intentsNote}`);
}

function nearIntentsMessage(errors: unknown[]): string | null {
  for (const e of errors) {
    if (typeof e !== "string" || !e.startsWith("nearintents:")) continue;
    const m = /"message"\s*:\s*"([^"]{1,80})"/.exec(e);
    const text = m?.[1] ?? (/timeout/i.test(e) ? "quote timed out" : null);
    if (text) return cleanMessage(text);
  }
  return null;
}

function findToken(list: RheaToken[], address: string): RheaToken | undefined {
  const k = addressKey(address);
  return list.find((t) => addressKey(t.address) === k);
}

/**
 * Map the token being sent to NEAR Intents' own token list, so the /check
 * prefill uses a canonical network ID and asset ID. Matching uses the asset ID
 * RHEA provides, else chain alias plus contract address. Never symbols alone.
 */
export function checkPrefill(fromChain: RheaChainId, token: RheaToken, amount: string, oneClick: Token[]): CheckPrefill | null {
  const byAsset = token.assetId ? oneClick.find((t) => t.assetId === token.assetId) : undefined;
  const alias = rheaChain(fromChain)?.alias;
  const byContract = !byAsset && !token.isNative && alias
    ? oneClick.find((t) => t.blockchain === alias && t.contractAddress && addressKey(t.contractAddress) === addressKey(token.address))
    : undefined;
  const match = byAsset ?? byContract;
  if (!match) return null;
  return { network: match.blockchain, token: match.assetId, amount };
}

export interface QuoteDeps {
  oneClickTokens: () => Promise<Token[]>;
  timeoutMs?: number;
  now?: () => Date;
}

export async function rheaQuote(raw: unknown, deps: QuoteDeps): Promise<RheaQuoteView> {
  const parsed = RheaQuoteInputSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new RheaError("RHEA_INVALID_INPUT", 400, issue ? `${issue.path.join(".") || "body"}: ${issue.message}` : "Invalid quote request.");
  }
  const input = parsed.data;
  if (!input.sender) {
    throw new RheaError("RHEA_SENDER_REQUIRED", 400, "RHEA needs the public address you would send from to quote a route. Neer does not fill one in for you.");
  }
  if (!/^[A-Za-z0-9:_\-.]{2,128}$/.test(input.sender)) throw new RheaError("RHEA_INVALID_INPUT", 400, "sender: Use a public address without spaces.");
  if (input.recipient && !/^[A-Za-z0-9:_\-.]{2,128}$/.test(input.recipient)) throw new RheaError("RHEA_INVALID_INPUT", 400, "recipient: Use a public address without spaces.");
  if (!rheaApiKey()) throw new RheaError("RHEA_NOT_CONFIGURED", 503, NOT_CONFIGURED_MESSAGE);

  const sameChain = input.fromChain === input.toChain;
  const [fromList, toList] = await Promise.all([
    getRheaTokens("from", input.fromChain, { timeoutMs: deps.timeoutMs }),
    getRheaTokens(sameChain ? "from" : "to", input.toChain, { timeoutMs: deps.timeoutMs }),
  ]);
  const tokenIn = findToken(fromList.tokens, input.tokenIn);
  const tokenOut = findToken(toList.tokens, input.tokenOut);
  if (!tokenIn || !tokenOut) throw new RheaError("RHEA_TOKEN_UNKNOWN", 400, "That token is not in RHEA's current token list for this chain. Reload the list and pick it again.");
  const amountIn = toBaseUnits(input.amount, tokenIn.decimals);
  if (amountIn === null) throw new RheaError("RHEA_INVALID_INPUT", 400, `amount: ${tokenIn.symbol} has ${tokenIn.decimals} decimals. Use fewer decimal places.`);
  if (amountIn === "0") throw new RheaError("RHEA_INVALID_INPUT", 400, "amount: Enter an amount above zero.");

  const env = await request("/api/v2/swap/quote", {
    method: "POST",
    auth: true,
    timeoutMs: deps.timeoutMs,
    body: {
      fromChain: input.fromChain,
      toChain: input.toChain,
      tokenIn: tokenIn.address,
      tokenOut: tokenOut.address,
      amountIn,
      slippage: input.slippageBps,
      quoteWaitingTimeMs: QUOTE_WAIT_MS,
      sameChainTimeoutMs: 500,
      crossChainTimeoutMs: QUOTE_WAIT_MS,
      sender: input.sender,
      ...(input.recipient ? { recipient: input.recipient } : {}),
    },
  });
  if (env.code !== 0) throw quoteFailure(env);
  const quote = parseQuoteData(env.data);
  const viaNearIntents = NEAR_INTENTS_ROUTERS.has(quote.router);
  const amountHuman = fromBaseUnits(amountIn, tokenIn.decimals);
  let check: CheckPrefill | null = null;
  let checkNote: string | null = null;
  if (!viaNearIntents) {
    checkNote = `RHEA selected the ${quote.router} route. Neer checks NEAR Intents deposit addresses only, so a Neer check does not apply to this route.`;
  } else {
    let oneClick: Token[] = [];
    try { oneClick = await deps.oneClickTokens(); } catch { oneClick = []; }
    check = checkPrefill(input.fromChain, tokenIn, amountHuman, oneClick);
    if (!check) checkNote = oneClick.length
      ? `${tokenIn.symbol} on this chain has no matching entry in the NEAR Intents token list, so Neer cannot prefill a check.`
      : "The NEAR Intents token list is unavailable right now, so Neer cannot prefill a check. Try again shortly.";
  }
  return {
    router: quote.router,
    routerName: quote.routerName,
    viaNearIntents,
    fromChain: input.fromChain,
    toChain: input.toChain,
    tokenIn: { symbol: tokenIn.symbol, decimals: tokenIn.decimals, address: tokenIn.address },
    tokenOut: { symbol: tokenOut.symbol, decimals: tokenOut.decimals, address: tokenOut.address },
    amountIn: amountHuman,
    estimatedOut: fromBaseUnits(quote.amountOut, tokenOut.decimals),
    minAmountOut: fromBaseUnits(quote.minAmountOut, tokenOut.decimals),
    alternatives: quote.alternatives,
    receivedAt: (deps.now?.() ?? new Date()).toISOString(),
    check,
    checkNote,
  };
}
