"use client";

import { chainName, humanDuration, type CheckResult } from "@neer/core";
import { useMounted } from "@/hooks/use-mounted";
import { formatDateTime } from "@/lib/format";
import { ChevronDown, CircleAlert, CircleCheck, CircleHelp, CircleX, Info } from "lucide-react";
import { useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

const ICON = {
  block: { Icon: CircleX, cls: "text-stop", word: "Problem" },
  warn: { Icon: CircleAlert, cls: "text-check", word: "Check" },
  unknown: { Icon: CircleHelp, cls: "text-check", word: "Not confirmed" },
  info: { Icon: Info, cls: "text-muted", word: "Note" },
  pass: { Icon: CircleCheck, cls: "text-safe", word: "Passed" },
} as const;

const FACT_LABEL: Record<string, string> = {
  chain: "Network",
  chainId: "Chain ID",
  sendBefore: "Send before",
  secondsLeft: "Time left",
  address: "Address",
  status: "Status",
  asset: "Asset ID",
  symbol: "Token",
  contract: "Contract",
  memo: "Memo",
  swapType: "Swap type",
  amountIn: "Amount in (base units)",
  minAmountIn: "Minimum in (base units)",
  amount: "Amount (base units)",
  minUsd: "Minimum (USD)",
  usd: "Value (USD)",
  refundTo: "Refund to",
  from: "Your address",
  method: "Method",
  selector: "Function selector",
  refundFee: "Refund fee (base units)",
  reason: "Reason",
  ageSec: "Read",
  priceAgeSec: "Price age",
};

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

function factValue(key: string, v: string | number | boolean | null): string {
  if (v === null) return "none";
  if (key === "chain" && typeof v === "string") return `${chainName(v)} (${v})`;
  if (key === "secondsLeft" && typeof v === "number") return v <= 0 ? "none" : humanDuration(v);
  if (key === "ageSec" && typeof v === "number") return `${humanDuration(v)} ago`;
  if (key === "priceAgeSec" && typeof v === "number") return humanDuration(v);
  if (typeof v === "string" && ISO.test(v)) return formatDateTime(v);
  return String(v);
}

function Facts({ title, facts }: { title: string; facts?: Record<string, string | number | boolean | null> }) {
  if (!facts) return null;
  const entries = Object.entries(facts);
  if (entries.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-medium tracking-wide text-muted uppercase">{title}</p>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
        {entries.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{FACT_LABEL[k] ?? k}</dt>
            <dd className="font-mono break-all">{factValue(k, v)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function CheckRow({ check }: { check: CheckResult }) {
  // Problems open by default: the full sentence is the point, not the summary.
  const [open, setOpen] = useState(check.severity === "block" || check.severity === "warn" || check.severity === "unknown");
  const { Icon, cls, word } = ICON[check.severity];
  const mounted = useMounted(); // dates render in the device's time zone
  return (
    <li className="border-b border-line last:border-b-0" data-testid={`check-${check.id}`} data-severity={check.severity}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="-mx-2 grid min-h-12 w-[calc(100%+1rem)] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
          <Icon className={cn("size-5 shrink-0", cls)} aria-hidden="true" />
          <span className="flex min-w-0 flex-col gap-x-3 sm:flex-row sm:items-baseline sm:justify-between">
            <span className="font-medium">
              <span className="sr-only">{word}: </span>
              {check.title}
            </span>
            <span className="text-sm text-muted sm:truncate sm:text-right">{check.summary}</span>
          </span>
          <ChevronDown className={cn("size-4 shrink-0 text-muted transition-transform", open && "rotate-180")} aria-hidden="true" />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 pr-2 pb-4 pl-8">
          <p className="max-w-prose">{check.message}</p>
          {mounted && (check.expected || check.actual) ? (
            <details className="group text-sm">
              <summary className="inline-flex min-h-9 cursor-pointer items-center rounded-md text-muted underline-offset-4 hover:text-ink hover:underline">Details</summary>
              <div className="mt-2 grid gap-4 rounded-lg bg-surface p-3 sm:grid-cols-2">
                <Facts title="Quote expects" facts={check.expected} />
                <Facts title="You" facts={check.actual} />
              </div>
            </details>
          ) : null}
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

function Count({ n, label, cls }: { n: number; label: string; cls: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span className={cn("size-2 rounded-full", cls)} aria-hidden="true" />
      <span className="tabular font-semibold text-ink">{n}</span>
      <span className="text-muted">{label}</span>
    </span>
  );
}

export function CheckList({ checks }: { checks: CheckResult[] }) {
  const problems = checks.filter((c) => c.severity === "block" || c.severity === "warn" || c.severity === "unknown").length;
  const passed = checks.filter((c) => c.severity === "pass").length;
  const notes = checks.filter((c) => c.severity === "info").length;
  // Open by default: every check is visible without a click; it can be collapsed.
  const [open, setOpen] = useState(true);
  // Problems first, then notes, then passes; engine order within each group.
  const RANK = { block: 0, warn: 1, unknown: 2, info: 3, pass: 4 } as const;
  const ordered = [...checks].sort((a, b) => RANK[a.severity] - RANK[b.severity]);
  return (
    <section aria-labelledby="checks-heading" className="rounded-2xl border border-line">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 pt-4 pb-3 sm:px-5">
          <div className="space-y-1.5">
            <h2 id="checks-heading" className="text-lg font-semibold">
              {checks.length} {checks.length === 1 ? "check" : "checks"}
            </h2>
            <p className="flex flex-wrap gap-x-4 gap-y-1">
              <Count n={problems} label={problems === 1 ? "problem" : "problems"} cls={problems ? "bg-stop" : "bg-line"} />
              <Count n={passed} label="passed" cls="bg-safe" />
              {notes ? <Count n={notes} label={notes === 1 ? "note" : "notes"} cls="bg-muted" /> : null}
            </p>
          </div>
          <CollapsibleTrigger
            className="inline-flex min-h-11 items-center gap-1 rounded-lg px-3 text-sm font-medium text-brand transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:outline-ring"
            data-testid="checks-toggle"
          >
            {open ? "Hide checks" : "Show all checks"}
            <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden="true" />
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          <ul className="border-t border-line px-4 sm:px-5">
            {ordered.map((c) => (
              <CheckRow key={c.id} check={c} />
            ))}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
