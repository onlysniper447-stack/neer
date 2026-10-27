"use client";

import { getChain } from "@neer/core";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMounted } from "@/hooks/use-mounted";
import { formatClock } from "@/lib/format";
import type { TrackBody } from "@/lib/server/track";
import { AddressChip } from "./address-chip";
import { Countdown } from "./countdown";
import { ReceiptButton } from "./receipt-button";
import { StatusTimeline } from "./status-timeline";
import { VerdictCard } from "./verdict-card";

type ErrorBody = { error: { code: string; message: string }; label?: string; message?: string };

const VISIBLE_MS = 5_000;
const HIDDEN_MS = 30_000;

function shortHash(h: string) {
  return h.length > 16 ? `${h.slice(0, 8)}…${h.slice(-6)}` : h;
}

function TxLinks({ txs }: { txs: { hash: string; explorerUrl: string | null }[] }) {
  if (txs.length === 0) return null;
  return (
    <ul className="space-y-1">
      {txs.map((t) => (
        <li key={t.hash} className="flex items-center gap-2">
          <span className="font-mono">tx {shortHash(t.hash)}</span>
          {t.explorerUrl ? (
            <a href={t.explorerUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand underline-offset-4 hover:underline">
              Open <ExternalLink className="size-3.5" aria-hidden="true" />
              <span className="sr-only">in a block explorer</span>
            </a>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function Tracker({ address, memo }: { address: string; memo: string | null }) {
  const mounted = useMounted();
  const [data, setData] = useState<TrackBody | null>(null);
  const [problem, setProblem] = useState<{ kind: "not_found" | "unavailable" | "offline" | "limited"; message: string } | null>(null);
  const [lastChecked, setLastChecked] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const qs = new URLSearchParams({ address, ...(memo ? { memo } : {}) });

    let inFlight = false;
    async function poll() {
      if (inFlight || stopped) return;
      inFlight = true;
      if (timer) clearTimeout(timer);
      let next = document.visibilityState === "visible" ? VISIBLE_MS : HIDDEN_MS;
      try {
        const res = await fetch(`/api/v1/track?${qs.toString()}`, { cache: "no-store" });
        const json = (await res.json()) as TrackBody | ErrorBody;
        if (res.ok && "status" in json) {
          setData(json);
          setProblem(null);
          setLastChecked(json.serverTime);
          if (json.terminal) stopped = true;
        } else if (res.status === 404) {
          setProblem({ kind: "not_found", message: "We can't find this quote." });
          stopped = true;
        } else if (res.status === 429) {
          setProblem({ kind: "limited", message: "Too many checks. We'll try again shortly." });
          next = HIDDEN_MS;
        } else {
          setProblem({ kind: "unavailable", message: "Can't check right now. NEAR Intents didn't answer. We'll keep trying." });
          next = Math.max(next, 10_000);
        }
      } catch {
        setProblem(
          navigator.onLine
            ? { kind: "unavailable", message: "Can't reach Neer right now. We'll keep trying." }
            : { kind: "offline", message: "You're offline. We'll check again when you're back." },
        );
        next = Math.max(next, 10_000);
      }
      inFlight = false;
      if (!stopped) timer = setTimeout(poll, next);
    }

    const wake = () => {
      if (document.visibilityState === "visible" && !stopped) void poll();
    };
    timer = setTimeout(poll, 0);
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
    };
  }, [address, memo]);

  if (problem?.kind === "not_found") {
    return (
      <div className="space-y-4" data-testid="tracker" data-status="NOT_FOUND">
        <VerdictCard tone="stop" label="Don't send" headline="We can't find this quote" message="Don't send yet. Copy the address again, or ask your swap app for a new quote.">
          <Button asChild size="lg">
            <Link href="/">Paste a different address</Link>
          </Button>
        </VerdictCard>
        <AddressChip address={address} label="You pasted" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4" aria-busy="true">
        {problem ? (
          <div role="alert" className="rounded-lg border border-check bg-check-bg p-3">
            {problem.message}
          </div>
        ) : null}
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }

  const q = data.quote;
  const tone = data.tone === "safe" ? "safe" : data.tone === "stop" ? "stop" : "check";
  const pending = data.status === "PENDING_DEPOSIT";
  const checkHref = `/check?${new URLSearchParams({ address, ...(memo ? { memo } : {}) }).toString()}`;

  const detail = {
    deposit:
      pending && q?.sendBefore && mounted ? (
        <span>Send before {formatClock(q.sendBefore)}</span>
      ) : data.depositedAmountFormatted ? (
        <span>
          {data.depositedAmountFormatted} {q?.originSymbol ?? ""} received
        </span>
      ) : null,
    seen: <TxLinks txs={data.originTxs} />,
    swapping: data.status === "PROCESSING" ? <span>{data.message}</span> : null,
    outcome:
      data.terminal ? (
        <div className="space-y-1">
          <TxLinks txs={data.destinationTxs} />
          {data.refundedAmountFormatted ? (
            <p>
              Refunded {data.refundedAmountFormatted} {q?.originSymbol ?? ""}
              {data.refundReason ? ` (${data.refundReason.toLowerCase().replace(/_/g, " ")})` : ""}
            </p>
          ) : null}
        </div>
      ) : null,
  };

  return (
    <div className="space-y-4" data-testid="tracker" data-status={data.status}>
      <div className="rounded-xl border border-line bg-surface p-4">
        <p className="text-sm text-muted">Tracking</p>
        <p className="font-medium">
          {q ? `${q.amountInFormatted} ${q.originSymbol ?? ""} on ${q.originChainName ?? ""} → ${q.destinationSymbol ?? ""}${q.destinationChainName ? ` on ${q.destinationChainName}` : ""}` : address}
        </p>
      </div>

      {q && !q.verified ? (
        <VerdictCard tone="stop" label="Don't send" headline="Unconfirmed quote" message="We couldn't confirm this quote came from NEAR Intents. Don't send." />
      ) : null}

      {data.terminal ? <VerdictCard tone={tone} label={data.label} headline={data.message} /> : null}

      <section className="rounded-xl border border-line p-4" aria-labelledby="status-label">
        <p id="status-label" className="text-lg font-semibold" aria-live="polite" data-testid="status-label">
          {data.terminal ? "How it went" : data.label}
        </p>
        {data.status !== "PROCESSING" && !data.terminal ? <p className="mt-1 text-muted">{data.message}</p> : null}
        <div className="mt-4">
          <StatusTimeline steps={data.timeline} detail={detail} />
        </div>
      </section>

      {problem ? (
        <div role="alert" className="rounded-lg border border-check bg-check-bg p-3" data-testid="tracker-problem">
          {problem.message}
        </div>
      ) : null}

      {pending && q?.sendBefore ? (
        <Countdown key={data.serverTime} sendBefore={q.sendBefore} serverTime={data.serverTime} startedAt={data.signedQuote?.timestamp} budgetSec={q.originChain ? getChain(q.originChain).confirmBudgetSec : 600} />
      ) : null}

      <AddressChip address={q?.depositAddress ?? address} verified={Boolean(q?.verified)} label="Deposit address" />

      <div className="flex flex-wrap items-center gap-2">
        {pending ? (
          <Button asChild size="lg">
            <Link href={checkHref}>Run preflight</Link>
          </Button>
        ) : null}
        <ReceiptButton
          signedQuote={data.signedQuote}
          record={{ requestId: data.requestId, status: data.status, label: data.label, statusUpdatedAt: data.updatedAt, checkedAt: data.serverTime }}
        />
      </div>

      <p className="text-xs text-muted" data-testid="last-checked">
        {data.terminal ? "Final status. " : "Updates every 5 seconds while this tab is open. "}
        {lastChecked && mounted ? `Last checked ${formatClock(lastChecked, true)}.` : ""}
        {q?.correlationId ? ` 1Click correlation ID ${q.correlationId}.` : ""}
      </p>
    </div>
  );
}
