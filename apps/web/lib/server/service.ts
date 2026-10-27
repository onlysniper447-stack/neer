import "server-only";
import { DeclaredTransferSchema, getChain, isKnownChain, preflight, type Lookup, type PreflightResult, type Token } from "@neer/core";
import type { z } from "zod";
import { PreflightRequestSchema } from "./request-schemas";
import { getStatus, getTokens, quotePublicKeyOverride } from "./upstream";

export type ErrorCode =
  | "NEER_INVALID_INPUT"
  | "NEER_UNSUPPORTED_CHAIN"
  | "NEER_QUOTE_NOT_FOUND"
  | "NEER_QUOTE_UNVERIFIED"
  | "NEER_RATE_LIMITED"
  | "NEER_UPSTREAM_UNAVAILABLE";

export interface ApiErrorBody {
  code: ErrorCode;
  message: string;
  issues?: { path: string; message: string }[];
}

export type PreflightApiBody = (PreflightResult & { requestId: string; error?: ApiErrorBody }) | { requestId: string; error: ApiErrorBody };

export function newRequestId(): string {
  return `req_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

export function zodIssues(err: z.ZodError): { path: string; message: string }[] {
  return err.issues.slice(0, 20).map((i) => ({ path: i.path.join("."), message: i.message }));
}

function chainKnown(chain: string, tokens: Token[]): boolean {
  return isKnownChain(chain) || tokens.some((t) => t.blockchain === chain);
}

/** POST /api/v1/preflight. Returns the HTTP status and JSON body. Never returns "safe" on any error path. */
export async function preflightService(raw: unknown, requestId: string): Promise<{ status: number; body: PreflightApiBody }> {
  const parsed = PreflightRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      status: 400,
      body: { requestId, error: { code: "NEER_INVALID_INPUT", message: "The request body is not valid.", issues: zodIssues(parsed.error) } },
    };
  }
  const { deposit, transfer, quote } = parsed.data;
  const [lookup, tokenState] = await Promise.all([getStatus(deposit.address, deposit.memo, { dedupe: false }), getTokens()]);

  if (transfer.chain && !chainKnown(transfer.chain, tokenState.tokens) && tokenState.tokens.length > 0) {
    return {
      status: 422,
      body: { requestId, error: { code: "NEER_UNSUPPORTED_CHAIN", message: `Neer doesn't know the network "${transfer.chain}".` } },
    };
  }

  const result = preflight({
    depositAddress: deposit.address,
    depositMemo: deposit.memo ?? null,
    lookup,
    quote: quote ?? null,
    transfer,
    tokens: tokenState.tokens,
    now: new Date(),
    quotePublicKey: quotePublicKeyOverride,
  });

  return { status: httpStatusFor(result), body: { requestId, ...result, ...errorFor(result, lookup) } };
}

function httpStatusFor(result: PreflightResult): number {
  if (result.outcome === "not_found") return 404;
  if (result.outcome === "unavailable") return 503;
  const sig = result.checks.find((c) => c.id === "signature");
  if (sig?.severity === "block" && sig.headline === "Unconfirmed quote") return 422;
  return 200;
}

function errorFor(result: PreflightResult, lookup: Lookup): { error?: ApiErrorBody } {
  if (result.outcome === "not_found") {
    return { error: { code: "NEER_QUOTE_NOT_FOUND", message: "1Click has no quote for this address and memo." } };
  }
  if (result.outcome === "unavailable") {
    const why = lookup.kind === "error" ? lookup.reason : "unknown";
    return { error: { code: "NEER_UPSTREAM_UNAVAILABLE", message: `NEAR Intents didn't answer (${why}). Do not treat this as safe.` } };
  }
  const sig = result.checks.find((c) => c.id === "signature");
  if (sig?.severity === "block" && sig.headline === "Unconfirmed quote") {
    return { error: { code: "NEER_QUOTE_UNVERIFIED", message: "The quote signature did not verify." } };
  }
  return {};
}

/** Data for the /check page: the quote for this address plus transfer-independent checks. */
export async function loadCheckPage(address: string, memo: string | null) {
  const [lookup, tokenState] = await Promise.all([getStatus(address, memo, { dedupe: false }), getTokens()]);
  const result = preflight({
    depositAddress: address,
    depositMemo: memo,
    lookup,
    transfer: DeclaredTransferSchema.parse({ source: "unknown" }),
    tokens: tokenState.tokens,
    now: new Date(),
    quotePublicKey: quotePublicKeyOverride,
  });
  /** Problems that no choice of network, token or amount can fix. */
  const TRANSFER_INDEPENDENT = new Set(["quote", "signature", "used", "time", "format", "refund", "xrp", "minimum"]);
  const hardStop = result.verdict === "block" && result.checks.some((c) => c.severity === "block" && TRANSFER_INDEPENDENT.has(c.id));
  const unavailable = result.outcome === "unavailable";
  return { result, tokens: tokenState.tokens, hardStop, unavailable };
}

export function chainLabel(id: string): string {
  return getChain(id).name;
}
