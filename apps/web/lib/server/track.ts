import "server-only";
import { DeclaredTransferSchema, describeStatus, preflight, type QuoteResponse, type QuoteSummary, type StatusView } from "@neer/core";
import { getStatus, getTokens, quotePublicKeyOverride } from "./upstream";
import type { ApiErrorBody } from "./service";

export interface TrackBody extends Omit<StatusView, "status"> {
  requestId: string;
  address: string;
  status: StatusView["status"];
  updatedAt: string;
  serverTime: string;
  estimateSeconds: number | null;
  originTxs: { hash: string; explorerUrl: string | null }[];
  destinationTxs: { hash: string; explorerUrl: string | null }[];
  depositedAmountFormatted: string | null;
  amountOutFormatted: string | null;
  refundedAmountFormatted: string | null;
  refundReason: string | null;
  quote: QuoteSummary | null;
  signedQuote: QuoteResponse | null;
}

export type TrackApiBody = TrackBody | { requestId: string; error: ApiErrorBody; label: string; message: string };

/** GET /api/v1/track. Polled by the tracker; upstream calls are shared per address for 5 s. */
export async function trackService(address: string, memo: string | null, requestId: string): Promise<{ status: number; body: TrackApiBody }> {
  const [lookup, tokenState] = await Promise.all([getStatus(address, memo, { dedupe: true }), getTokens()]);
  if (lookup.kind === "not_found") {
    return {
      status: 404,
      body: {
        requestId,
        error: { code: "NEER_QUOTE_NOT_FOUND", message: "1Click has no quote for this address and memo." },
        label: "We can't find this quote",
        message: "Don't send yet. Copy the address again, or ask your swap app for a new quote.",
      },
    };
  }
  if (lookup.kind === "error") {
    return {
      status: 503,
      body: {
        requestId,
        error: { code: "NEER_UPSTREAM_UNAVAILABLE", message: `NEAR Intents didn't answer (${lookup.reason}).` },
        label: "Can't check right now",
        message: "NEAR Intents didn't answer. We'll keep trying.",
      },
    };
  }
  const s = lookup.status;
  const view = describeStatus(s, tokenState.tokens);
  const summary = preflight({
    depositAddress: address,
    depositMemo: memo,
    lookup,
    transfer: DeclaredTransferSchema.parse({ source: "unknown" }),
    tokens: tokenState.tokens,
    now: new Date(),
    quotePublicKey: quotePublicKeyOverride,
  });
  const d = s.swapDetails;
  return {
    status: 200,
    body: {
      requestId,
      address,
      ...view,
      updatedAt: s.updatedAt,
      serverTime: new Date().toISOString(),
      estimateSeconds: s.quoteResponse.quote.timeEstimate ?? null,
      originTxs: (d?.originChainTxHashes ?? []).map((t) => ({ hash: t.hash, explorerUrl: safeUrl(t.explorerUrl) })),
      destinationTxs: (d?.destinationChainTxHashes ?? []).map((t) => ({ hash: t.hash, explorerUrl: safeUrl(t.explorerUrl) })),
      depositedAmountFormatted: d?.depositedAmountFormatted ?? null,
      amountOutFormatted: d?.amountOutFormatted ?? null,
      refundedAmountFormatted: d?.refundedAmountFormatted && d.refundedAmountFormatted !== "0" ? d.refundedAmountFormatted : null,
      refundReason: d?.refundReason ?? null,
      quote: summary.quote,
      signedQuote: summary.signedQuote,
    },
  };
}

/** Only https explorer links are rendered as links. */
function safeUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  try {
    return new URL(u).protocol === "https:" ? u : null;
  } catch {
    return null;
  }
}
