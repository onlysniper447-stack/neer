import { shortAddress, type QuoteSummary } from "@neer/core";
import { BadgeCheck, ShieldAlert } from "lucide-react";

/** The page title on /check: the swap this address expects. */
export function RouteHeader({ quote }: { quote: QuoteSummary }) {
  const from = `${quote.amountInFormatted} ${quote.originSymbol ?? "?"} on ${quote.originChainName ?? "?"}`;
  const to = `${quote.amountOutFormatted} ${quote.destinationSymbol ?? "?"}${quote.destinationChainName ? ` on ${quote.destinationChainName}` : ""}`;
  return (
    <div className="mb-8 space-y-2 lg:mb-10">
      <p className="text-sm font-semibold tracking-wide text-brand">Deposit preflight · this address expects a swap</p>
      <h1 className="text-2xl leading-snug font-semibold tracking-tight text-balance sm:text-3xl lg:text-4xl" data-testid="route">
        {from} <span className="text-muted">→</span> {to}
      </h1>
    </div>
  );
}

function Row({ k, v, mono }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-sm text-muted">{k}</dt>
      <dd className={mono ? "min-w-0 truncate text-right font-mono text-sm" : "min-w-0 text-right text-[15px] font-medium"}>{v}</dd>
    </div>
  );
}

const SWAP_TYPE: Record<string, string> = {
  EXACT_INPUT: "Exact input",
  EXACT_OUTPUT: "Exact output",
  FLEX_INPUT: "Flexible input",
  ANY_INPUT: "Any input",
};

/** Key facts from the signed quote, for the side column. */
export function QuoteDetails({ quote }: { quote: QuoteSummary }) {
  return (
    <section aria-labelledby="quote-details-title" className="rounded-xl border border-line p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 id="quote-details-title" className="font-semibold">
          Quote details
        </h2>
        {quote.verified ? (
          <span className="inline-flex items-center gap-1 text-sm font-medium text-safe">
            <BadgeCheck className="size-4" aria-hidden="true" /> Signed by NEAR Intents
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-sm font-medium text-stop">
            <ShieldAlert className="size-4" aria-hidden="true" /> Signature not confirmed
          </span>
        )}
      </div>
      <dl className="mt-2 divide-y divide-line">
        <Row k="You send" v={`${quote.amountInFormatted} ${quote.originSymbol ?? ""}`} />
        <Row k="On" v={quote.originChainName ?? quote.originChain ?? "Unknown"} />
        <Row k="You receive" v={`${quote.amountOutFormatted} ${quote.destinationSymbol ?? ""}`} />
        {quote.destinationChainName ? <Row k="On" v={quote.destinationChainName} /> : null}
        {quote.swapType ? <Row k="Swap type" v={SWAP_TYPE[quote.swapType] ?? quote.swapType} /> : null}
        {quote.recipient ? <Row k="Recipient" v={<span title={quote.recipient}>{shortAddress(quote.recipient)}</span>} mono /> : null}
        {quote.refundTo ? <Row k="Refunds to" v={<span title={quote.refundTo}>{shortAddress(quote.refundTo)}</span>} mono /> : null}
      </dl>
    </section>
  );
}
