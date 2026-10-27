"use client";

import { AmountError, parseAmount, type QuoteSummary } from "@neer/core";
import { ArrowRight, ChevronDown, Loader2 } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { recordCheck } from "@/lib/local-stats";
import { cn } from "@/lib/utils";
import { AddressChip } from "./address-chip";
import { QuoteDetails } from "./quote-details";
import { ResultView, type ApiResult } from "./result-view";

export interface ChainOption {
  id: string;
  name: string;
}
export interface TokenOption {
  assetId: string;
  symbol: string;
  decimals: number;
  contract: string | null;
}

/** Common networks first; the rest sit behind "More networks". */
const POPULAR = ["eth", "base", "arb", "bsc", "pol", "op", "avax", "sol", "tron", "ton", "stellar", "xrp", "btc", "near"];

type Phase = { kind: "form" } | { kind: "loading" } | { kind: "result"; result: ApiResult; sendSummary: string } | { kind: "error"; message: string };

function shortContract(c: string) {
  return c.length > 14 ? `${c.slice(0, 6)}…${c.slice(-4)}` : c;
}

export function PreflightFlow({
  address,
  pastedMemo,
  quote,
  chains,
  tokensByChain,
}: {
  address: string;
  pastedMemo: string | null;
  quote: QuoteSummary;
  chains: ChainOption[];
  tokensByChain: Record<string, TokenOption[]>;
}) {
  const [chain, setChain] = useState<string | null>(null);
  const [assetId, setAssetId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [source, setSource] = useState<"wallet" | "exchange" | null>(null);
  const needsMemo = Boolean(quote.depositMemo) || Boolean(pastedMemo);
  const [memo, setMemo] = useState(pastedMemo ?? "");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [moreChains, setMoreChains] = useState(false);
  const [moreDetails, setMoreDetails] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<Phase>({ kind: "form" });
  const ids = { token: useId(), amount: useId(), memo: useId(), from: useId(), to: useId() };

  const popular = chains.filter((c) => POPULAR.includes(c.id)).sort((a, b) => POPULAR.indexOf(a.id) - POPULAR.indexOf(b.id));
  const rest = chains.filter((c) => !POPULAR.includes(c.id)).sort((a, b) => a.name.localeCompare(b.name));
  const showRest = moreChains || (chain !== null && rest.some((c) => c.id === chain));
  const tokens = chain ? (tokensByChain[chain] ?? []) : [];
  const token = tokens.find((t) => t.assetId === assetId);

  function pickChain(id: string) {
    setChain(id);
    setAssetId("");
    setErrors((e) => ({ ...e, chain: "" }));
  }

  async function run(e?: React.FormEvent) {
    e?.preventDefault();
    const errs: Record<string, string> = {};
    if (!chain) errs.chain = "Pick the network you'll send on.";
    if (!token) errs.token = "Pick the token you'll send.";
    let units: bigint | null = null;
    if (token) {
      try {
        units = parseAmount(amount, token.decimals);
        if (units === 0n) errs.amount = "Enter the amount you'll send.";
      } catch (err) {
        errs.amount = err instanceof AmountError ? err.message : "Enter an amount like 0.17";
      }
    } else if (!amount) {
      errs.amount = "Enter the amount you'll send.";
    }
    if (!source) errs.source = "Tell us where you're sending from.";
    setErrors(errs);
    if (Object.values(errs).some(Boolean) || !chain || !token || units === null || !source) return;

    setPhase({ kind: "loading" });
    const body = {
      deposit: { address, memo: pastedMemo },
      transfer: {
        chain,
        asset: token.assetId,
        amount: units.toString(),
        source,
        ...(needsMemo ? { memo: memo.trim() || null } : {}),
        ...(from.trim() ? { from: from.trim() } : {}),
        ...(to.trim() ? { to: to.trim() } : {}),
      },
    };
    const sendSummary = `${amount.trim()} ${token.symbol} on ${chains.find((c) => c.id === chain)?.name ?? chain}`;
    try {
      const res = await fetch("/api/v1/preflight", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const json = (await res.json()) as Partial<ApiResult> & { error?: { code: string; message: string; issues?: { path: string; message: string }[] } };
      if (json.verdict && json.checks) {
        setPhase({ kind: "result", result: json as ApiResult, sendSummary });
        recordCheck({ verdict: json.verdict, network: chain });
      } else if (res.status === 429) {
        setPhase({ kind: "error", message: json.error?.message ?? "Too many checks. Try again in 30 seconds." });
      } else if (res.status === 400) {
        const first = json.error?.issues?.[0];
        setPhase({ kind: "error", message: first ? `${first.path}: ${first.message}` : (json.error?.message ?? "Something in the form isn't valid.") });
      } else {
        setPhase({ kind: "error", message: json.error?.message ?? "We couldn't finish the checks. Wait a minute and try again before you send." });
      }
    } catch {
      setPhase({
        kind: "error",
        message: typeof navigator !== "undefined" && !navigator.onLine ? "You're offline. Check again when you're back." : "We couldn't reach Neer. Wait a minute and try again before you send.",
      });
    }
    window.scrollTo({ top: 0 }); // the swap title sits right above the result or form
  }

  function edit(nextChain?: string) {
    if (nextChain) pickChain(nextChain);
    setPhase({ kind: "form" });
    window.scrollTo({ top: 0 }); // the swap title sits right above the result or form
  }

  return (
    <div>
      {phase.kind === "result" ? (
        <ResultView result={phase.result} pastedAddress={address} pastedMemo={pastedMemo} onEdit={edit} sendSummary={phase.sendSummary} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(340px,400px)] lg:gap-x-8 xl:gap-x-10">
        <form onSubmit={run} className="space-y-7 rounded-2xl border border-line p-5 sm:p-7" noValidate aria-busy={phase.kind === "loading"} aria-labelledby="send-form-title">
          <div>
            <h2 id="send-form-title" className="text-xl font-semibold tracking-tight">How will you send it?</h2>
            <p className="mt-1 text-muted">Neer compares your answers with the signed quote. Nothing is sent or signed.</p>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-base font-semibold">Which network will you send on?</legend>
            <p className="text-sm text-muted">Pick the one your wallet or exchange shows. We don&apos;t pre-select it on purpose.</p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Network">
              {[...popular, ...(showRest ? rest : [])].map((c) => (
                <label key={c.id} className="cursor-pointer">
                  <input type="radio" name="chain" value={c.id} checked={chain === c.id} onChange={() => pickChain(c.id)} className="peer sr-only" />
                  <span
                    className={cn(
                      "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring",
                      chain === c.id ? "border-brand bg-brand text-brand-ink" : "border-line hover:bg-surface",
                    )}
                  >
                    {c.name}
                  </span>
                </label>
              ))}
              {rest.length > 0 && !showRest ? (
                <button type="button" className="inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-sm font-medium text-brand" onClick={() => setMoreChains(true)}>
                  More networks <ChevronDown className="size-4" aria-hidden="true" />
                </button>
              ) : null}
            </div>
            {errors.chain ? <p className="text-sm font-medium text-stop" role="alert">{errors.chain}</p> : null}
          </fieldset>

          <div className="space-y-2">
            <Label htmlFor={ids.token} className="text-base font-semibold">
              Token
            </Label>
            <select
              id={ids.token}
              value={assetId}
              onChange={(e) => setAssetId(e.target.value)}
              disabled={!chain}
              className="h-12 w-full rounded-md border border-input bg-bg px-3 text-base text-ink focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-surface disabled:text-muted"
              aria-invalid={errors.token ? true : undefined}
            >
              <option value="">{chain ? "Choose a token" : "Pick a network first"}</option>
              {tokens.map((t) => (
                <option key={t.assetId} value={t.assetId}>
                  {t.symbol} {t.contract ? `· ${shortContract(t.contract)}` : "· native"}
                </option>
              ))}
            </select>
            {errors.token ? <p className="text-sm font-medium text-stop" role="alert">{errors.token}</p> : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor={ids.amount} className="text-base font-semibold">
              Amount you&apos;ll send
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id={ids.amount}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                className="tabular h-12 font-mono text-base"
                aria-invalid={errors.amount ? true : undefined}
              />
              <span className="min-w-14 font-medium text-muted">{token?.symbol ?? ""}</span>
            </div>
            {errors.amount ? <p className="text-sm font-medium text-stop" role="alert">{errors.amount}</p> : null}
          </div>

          {needsMemo ? (
            <div className="space-y-2">
              <Label htmlFor={ids.memo} className="text-base font-semibold">
                Memo you&apos;ll add
              </Label>
              <Input id={ids.memo} value={memo} onChange={(e) => setMemo(e.target.value)} autoComplete="off" spellCheck={false} className="h-12 font-mono text-base" />
              <p className="text-sm text-muted">Leave it empty if your wallet or exchange has no memo field. We&apos;ll tell you if that&apos;s a problem.</p>
            </div>
          ) : null}

          <fieldset className="space-y-2">
            <legend className="text-base font-semibold">Sending from</legend>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["wallet", "My own wallet"],
                  ["exchange", "An exchange"],
                ] as const
              ).map(([v, label]) => (
                <label key={v} className="cursor-pointer">
                  <input type="radio" name="source" value={v} checked={source === v} onChange={() => setSource(v)} className="peer sr-only" />
                  <span
                    className={cn(
                      "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring",
                      source === v ? "border-brand bg-brand text-brand-ink" : "border-line hover:bg-surface",
                    )}
                  >
                    {label}
                  </span>
                </label>
              ))}
            </div>
            {errors.source ? <p className="text-sm font-medium text-stop" role="alert">{errors.source}</p> : null}
          </fieldset>

          <Collapsible open={moreDetails} onOpenChange={setMoreDetails}>
            <CollapsibleTrigger className="flex min-h-11 items-center gap-1 font-medium text-brand">
              Extra checks (optional) <ChevronDown className={cn("size-4 transition-transform", moreDetails && "rotate-180")} aria-hidden="true" />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor={ids.from}>Your address (the one you send from)</Label>
                <Input id={ids.from} value={from} onChange={(e) => setFrom(e.target.value)} autoComplete="off" spellCheck={false} className="h-12 font-mono" />
                <p className="text-sm text-muted">We compare it with the quote&apos;s refund address.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor={ids.to}>Address on your wallet&apos;s send screen</Label>
                <Input id={ids.to} value={to} onChange={(e) => setTo(e.target.value)} autoComplete="off" spellCheck={false} className="h-12 font-mono" />
                <p className="text-sm text-muted">Paste it from the confirm screen to catch clipboard swaps and lookalike addresses.</p>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {phase.kind === "error" ? (
            <div role="alert" className="rounded-lg border border-check bg-check-bg p-3 text-ink" data-testid="flow-error">
              {phase.message}
            </div>
          ) : null}

          <Button type="submit" size="lg" className="w-full" disabled={phase.kind === "loading"}>
            {phase.kind === "loading" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {phase.kind === "loading" ? "Running checks…" : "Run checks"}
            {phase.kind === "loading" ? null : <ArrowRight className="size-4" aria-hidden="true" />}
          </Button>
        </form>
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start" aria-label="Deposit and quote">
          <AddressChip address={quote.depositAddress ?? address} verified={quote.verified} label="Deposit address" />
          {quote.depositMemo ? (
            <div className="rounded-xl border border-line bg-surface p-4">
              <p className="text-sm font-medium text-muted">Memo (required)</p>
              <p className="font-mono text-lg break-all">{quote.depositMemo}</p>
            </div>
          ) : null}
          <QuoteDetails quote={quote} />
        </aside>
        </div>
      )}
    </div>
  );
}
