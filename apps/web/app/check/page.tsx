import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { AddressChip } from "@/components/address-chip";
import { PreflightFlow, type ChainOption, type TokenOption } from "@/components/preflight-flow";
import { ResultView } from "@/components/result-view";
import { Button } from "@/components/ui/button";
import { RouteHeader } from "@/components/quote-details";
import { VerdictCard } from "@/components/verdict-card";
import { MemoSchema, PastedAddressSchema } from "@/lib/inputs";
import { clientIp, rateLimit } from "@/lib/server/rate-limit";
import { chainLabel, loadCheckPage } from "@/lib/server/service";
import { first, type SearchParams } from "@/lib/search-params";

export const metadata: Metadata = { title: "Preflight", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function CheckPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const addr = PastedAddressSchema.safeParse(first(sp.address) ?? "");
  const memoRaw = first(sp.memo);
  const memo = memoRaw ? MemoSchema.safeParse(memoRaw) : null;

  if (!addr.success || (memo && !memo.success)) {
    const msg = !addr.success ? addr.error.issues[0]?.message : memo && !memo.success ? memo.error.issues[0]?.message : undefined;
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="sr-only">Deposit preflight</h1>
        <VerdictCard tone="stop" label="Don't send" headline="This doesn't look like a deposit address" message={msg ?? "Copy it again from your swap app."}>
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link href="/">Paste it again</Link>
          </Button>
        </VerdictCard>
      </div>
    );
  }
  const address = addr.data;
  const pastedMemo = memo?.success && memo.data ? memo.data : null;
  const retryHref = `/check?${new URLSearchParams({ address, ...(pastedMemo ? { memo: pastedMemo } : {}) }).toString()}`;

  const limit = await rateLimit("check-page", clientIp(await headers()));
  if (!limit.ok) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="sr-only">Deposit preflight</h1>
        <VerdictCard tone="check" label="Please wait" headline={`Too many checks. Try again in ${limit.retryAfterSec} seconds.`}>
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link href={retryHref}>Try again</Link>
          </Button>
        </VerdictCard>
      </div>
    );
  }

  const { result, tokens, hardStop, unavailable } = await loadCheckPage(address, pastedMemo);

  if (result.outcome === "not_found") {
    return (
      <div className="mx-auto max-w-2xl space-y-4" data-testid="result" data-verdict="block">
        <h1 className="sr-only">Deposit preflight</h1>
        <VerdictCard tone="stop" label="Don't send" headline={result.headline} message={result.message}>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button asChild size="lg">
              <Link href={retryHref}>Try again</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/">Paste a different address</Link>
            </Button>
          </div>
        </VerdictCard>
        <AddressChip address={address} label="You pasted" />
        {pastedMemo ? <p className="text-muted">With memo <span className="font-mono">{pastedMemo}</span>. If the swap has no memo, try without it.</p> : null}
        <p className="text-sm text-muted">
          A deposit address only exists after your swap app requests a quote. If you copied it from a message or an old screenshot, don&apos;t use it.
        </p>
      </div>
    );
  }

  if (unavailable || (!hardStop && tokens.length === 0)) {
    const headline = unavailable ? result.headline : "We couldn't load the token list";
    const message = unavailable
      ? result.message
      : "Neer needs the NEAR Intents token list to check what you'll send. Wait a minute and retry before you send.";
    return (
      <div className="mx-auto max-w-2xl space-y-4" data-testid="result" data-verdict="check">
        <h1 className="sr-only">Deposit preflight</h1>
        <VerdictCard tone="check" label="Can't check right now" headline={headline} message={message}>
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link href={retryHref}>Retry</Link>
          </Button>
        </VerdictCard>
        <AddressChip address={address} label="You pasted" />
      </div>
    );
  }

  if (hardStop || !result.quote) {
    return (
      <>
        {result.quote ? <RouteHeader quote={result.quote} /> : <h1 className="sr-only">Deposit preflight</h1>}
        <ResultView result={result} pastedAddress={address} pastedMemo={pastedMemo} />
      </>
    );
  }

  const chainIds = [...new Set(tokens.map((t) => t.blockchain))];
  const chains: ChainOption[] = chainIds.map((id) => ({ id, name: chainLabel(id) }));
  const tokensByChain: Record<string, TokenOption[]> = {};
  for (const t of tokens) {
    (tokensByChain[t.blockchain] ??= []).push({ assetId: t.assetId, symbol: t.symbol, decimals: t.decimals, contract: t.contractAddress ?? null });
  }
  for (const list of Object.values(tokensByChain)) list.sort((a, b) => a.symbol.localeCompare(b.symbol));

  return (
    <>
      <RouteHeader quote={result.quote} />
      <PreflightFlow address={address} pastedMemo={pastedMemo} quote={result.quote} chains={chains} tokensByChain={tokensByChain} />
    </>
  );
}
