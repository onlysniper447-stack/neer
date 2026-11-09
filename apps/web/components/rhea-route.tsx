"use client";

import { ArrowRight, Info } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useMemo, useState } from "react";
import { ExternalLink } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RHEA_CHAINS, RHEA_TRADE_URL, checkHref, rheaChain, type RheaApiError, type RheaChainId, type RheaQuoteView, type RheaToken } from "@/lib/rhea/shared";

type TokenState = { status: "loading" } | { status: "ready"; tokens: RheaToken[] } | { status: "error"; message: string };

const selectCls = "min-h-11 w-full rounded-md border border-line bg-bg p-2";
const SLIPPAGE = [
  { bps: 50, label: "0.5%" },
  { bps: 100, label: "1%" },
  { bps: 200, label: "2%" },
];

function useTokens(direction: "from" | "to", chain: RheaChainId): TokenState {
  const key = `${direction}:${chain}`;
  const [loaded, setLoaded] = useState<{ key: string; state: TokenState } | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/v1/rhea/tokens?${new URLSearchParams({ direction, chain })}`, { signal: ctrl.signal })
      .then(async (res) => {
        const body = (await res.json()) as { tokens?: RheaToken[]; error?: RheaApiError };
        if (!res.ok || !body.tokens) throw new Error(body.error?.message ?? "Neer could not load RHEA's token list.");
        setLoaded({ key, state: { status: "ready", tokens: body.tokens } });
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        setLoaded({ key, state: { status: "error", message: err instanceof Error ? err.message : "Neer could not load RHEA's token list." } });
      });
    return () => ctrl.abort();
  }, [key, direction, chain]);
  return loaded?.key === key ? loaded.state : { status: "loading" };
}

/** The user's pick when it is in the current list, else a default from the list. */
function effective(state: TokenState, pick: string): string {
  if (state.status !== "ready") return "";
  return state.tokens.some((t) => t.address === pick) ? pick : preferred(state.tokens);
}

function preferred(tokens: RheaToken[]): string {
  const withId = tokens.filter((t) => t.assetId);
  return (withId.find((t) => t.symbol === "USDC") ?? withId[0] ?? tokens[0])?.address ?? "";
}

function TokenSelect({ id, label, state, value, onChange }: { id: string; label: string; state: TokenState; value: string; onChange: (v: string) => void }) {
  const groups = useMemo(() => {
    if (state.status !== "ready") return null;
    return { intents: state.tokens.filter((t) => t.assetId), other: state.tokens.filter((t) => !t.assetId) };
  }, [state]);
  return (
    <div className="space-y-1">
      <label className="block font-medium" htmlFor={id}>{label}</label>
      <select id={id} className={selectCls} value={value} onChange={(e) => onChange(e.target.value)} disabled={!groups} aria-describedby={state.status === "error" ? `${id}-error` : undefined}>
        {!groups ? <option value="">{state.status === "loading" ? "Loading RHEA token list…" : "Token list unavailable"}</option> : null}
        {groups && groups.intents.length ? (
          <optgroup label="Listed with a NEAR Intents asset ID">
            {groups.intents.map((t) => <option key={t.address} value={t.address}>{t.symbol} · {short(t.address)}</option>)}
          </optgroup>
        ) : null}
        {groups && groups.other.length ? (
          <optgroup label="Other RHEA tokens">
            {groups.other.map((t) => <option key={t.address} value={t.address}>{t.symbol} · {short(t.address)}</option>)}
          </optgroup>
        ) : null}
      </select>
      {state.status === "error" ? <p id={`${id}-error`} className="text-sm text-stop">{state.message}</p> : null}
    </div>
  );
}

function short(address: string): string {
  return address.length > 18 ? `${address.slice(0, 8)}…${address.slice(-6)}` : address;
}

export function RheaRoute({ configured }: { configured: boolean }) {
  const id = useId();
  const [fromChain, setFromChain] = useState<RheaChainId>("8453");
  const [toChain, setToChain] = useState<RheaChainId>("near");
  const fromTokens = useTokens("from", fromChain);
  const toTokens = useTokens(fromChain === toChain ? "from" : "to", toChain);
  const [tokenInPick, setTokenIn] = useState("");
  const [tokenOutPick, setTokenOut] = useState("");
  const tokenIn = effective(fromTokens, tokenInPick);
  const tokenOut = effective(toTokens, tokenOutPick);
  const [amount, setAmount] = useState("");
  const [slippageBps, setSlippageBps] = useState(50);
  const [sender, setSender] = useState("");
  const [recipient, setRecipient] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [quote, setQuote] = useState<RheaQuoteView | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setQuote(null);
    if (!sender.trim()) {
      setError("Enter the public address you would send from. RHEA needs it to quote a route, and Neer does not fill one in for you.");
      return;
    }
    if (!tokenIn || !tokenOut) { setError("Pick both tokens first."); return; }
    if (!/^\d+(\.\d+)?$/.test(amount.trim())) { setError("Enter an amount such as 1.5."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/v1/rhea/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromChain, toChain, tokenIn, tokenOut, amount: amount.trim(), slippageBps, sender: sender.trim(), ...(recipient.trim() ? { recipient: recipient.trim() } : {}) }),
      });
      const body = (await res.json().catch(() => ({}))) as { quote?: RheaQuoteView; error?: RheaApiError };
      if (!res.ok || !body.quote) setError(body.error?.message ?? `The request failed with HTTP ${res.status}.`);
      else setQuote(body.quote);
    } catch {
      setError("Neer could not reach its own server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <form onSubmit={submit} noValidate className="space-y-4 rounded-2xl border border-line p-5 sm:p-6" aria-busy={busy} data-testid="rhea-form">
        {!configured ? (
          <p role="status" className="rounded-lg border border-check p-3 text-sm" data-testid="rhea-not-configured">
            RHEA quotes are not configured on this Neer deployment. It has no RHEA API key, so no quote can be requested. Token lists still load.
          </p>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="block font-medium" htmlFor={`${id}-from-chain`}>From chain</label>
            <select id={`${id}-from-chain`} className={selectCls} value={fromChain} onChange={(e) => setFromChain(e.target.value as RheaChainId)}>
              {RHEA_CHAINS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <TokenSelect id={`${id}-token-in`} label="Token you send" state={fromTokens} value={tokenIn} onChange={setTokenIn} />
          <div className="space-y-1">
            <label className="block font-medium" htmlFor={`${id}-to-chain`}>To chain</label>
            <select id={`${id}-to-chain`} className={selectCls} value={toChain} onChange={(e) => setToChain(e.target.value as RheaChainId)}>
              {RHEA_CHAINS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <TokenSelect id={`${id}-token-out`} label="Token you receive" state={toTokens} value={tokenOut} onChange={setTokenOut} />
          <div className="space-y-1">
            <label className="block font-medium" htmlFor={`${id}-amount`}>Amount you send</label>
            <Input id={`${id}-amount`} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" autoComplete="off" placeholder="0.00" maxLength={64} />
          </div>
          <div className="space-y-1">
            <label className="block font-medium" htmlFor={`${id}-slippage`}>Slippage limit</label>
            <select id={`${id}-slippage`} className={selectCls} value={slippageBps} onChange={(e) => setSlippageBps(Number(e.target.value))}>
              {SLIPPAGE.map((s) => <option key={s.bps} value={s.bps}>{s.label}</option>)}
            </select>
          </div>
        </div>
        <div className="space-y-1">
          <label className="block font-medium" htmlFor={`${id}-sender`}>Your source address (public, optional)</label>
          <Input id={`${id}-sender`} value={sender} onChange={(e) => setSender(e.target.value)} autoComplete="off" spellCheck={false} maxLength={128} aria-describedby={`${id}-sender-help`} />
          <p id={`${id}-sender-help`} className="text-sm text-muted">
            RHEA needs the address you would send from to quote a route. Neer sends it to RHEA with this request only. Never enter a private key or seed phrase.
          </p>
        </div>
        <div className="space-y-1">
          <label className="block font-medium" htmlFor={`${id}-recipient`}>Destination address (public, optional)</label>
          <Input id={`${id}-recipient`} value={recipient} onChange={(e) => setRecipient(e.target.value)} autoComplete="off" spellCheck={false} maxLength={128} />
        </div>
        {error ? <p role="alert" className="rounded-lg border border-stop p-3" data-testid="rhea-error">{error}</p> : null}
        <Button type="submit" disabled={busy || !configured}>{busy ? "Requesting estimate…" : "Get RHEA estimate"}</Button>
        <p className="text-xs text-muted">Independent project, not affiliated with RHEA Finance or NEAR Foundation.</p>
      </form>

      <section aria-labelledby={`${id}-result`} className="space-y-4" aria-live="polite">
        <h2 id={`${id}-result`} className="text-xl font-semibold">Estimate</h2>
        {quote ? <QuoteResult quote={quote} /> : (
          <p className="text-muted">Pick a route and request an estimate. RHEA returns a router and expected amounts. The deposit address comes from RHEA&apos;s own app.</p>
        )}
      </section>
    </div>
  );
}

function QuoteResult({ quote }: { quote: RheaQuoteView }) {
  const from = rheaChain(quote.fromChain)?.name ?? quote.fromChain;
  const to = rheaChain(quote.toChain)?.name ?? quote.toChain;
  const time = new Date(quote.receivedAt).toLocaleTimeString();
  return (
    <div className="space-y-4 rounded-2xl border border-line p-5 sm:p-6" data-testid="rhea-quote">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2">
        <dt className="text-muted">Router</dt><dd className="font-mono" data-testid="rhea-router">{quote.router}</dd>
        <dt className="text-muted">You send</dt><dd data-testid="rhea-amount-in">{quote.amountIn} {quote.tokenIn.symbol} on {from}</dd>
        <dt className="text-muted">Estimated output</dt><dd data-testid="rhea-estimated">{quote.estimatedOut} {quote.tokenOut.symbol} on {to}</dd>
        <dt className="text-muted">Minimum output</dt><dd data-testid="rhea-minimum">{quote.minAmountOut} {quote.tokenOut.symbol}</dd>
        <dt className="text-muted">Other quotes returned</dt><dd>{quote.alternatives}</dd>
      </dl>
      <p className="text-sm text-muted">
        RHEA returned this estimate at {time}. It can change or expire before you swap. The minimum output reflects the slippage limit you picked.
      </p>
      <ol className="list-decimal space-y-2 pl-5">
        <li>Open <ExternalLink href={RHEA_TRADE_URL}>RHEA&apos;s trade app</ExternalLink> and request the same swap to get its deposit address.</li>
        <li>Check that deposit address in Neer before you send anything.</li>
      </ol>
      {quote.check ? (
        <div className="space-y-2">
          <Button asChild size="lg">
            <Link href={checkHref(quote.check)} data-testid="rhea-check-link">
              Check this deposit in Neer <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
          <p className="text-sm text-muted">This opens Neer&apos;s check with network, token and amount filled in. Paste the deposit address from RHEA into the Deposit address field, then run checks.</p>
        </div>
      ) : null}
      {quote.checkNote ? (
        <p className="flex gap-2 rounded-lg border border-line p-3 text-sm" data-testid="rhea-check-note">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> {quote.checkNote}
        </p>
      ) : null}
    </div>
  );
}
