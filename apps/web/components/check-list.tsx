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
};

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

function factValue(key: string, v: string | number | boolean | null): string {
  if (v === null) return "none";
  if (key === "chain" && typeof v === "string") return `${chainName(v)} (${v})`;
  if (key === "secondsLeft" && typeof v === "number") return v <= 0 ? "none" : humanDuration(v);
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
        <CollapsibleTrigger className="flex min-h-11 w-full items-center gap-3 py-2 text-left">
          <Icon className={cn("size-5 shrink-0", cls)} aria-hidden="true" />
          <span className="sr-only">{word}:</span>
          <span className="font-medium">{check.title}</span>
          <span className="ml-auto truncate pl-2 text-right text-sm text-muted">{check.summary}</span>
          <ChevronDown className={cn("size-4 shrink-0 text-muted transition-transform", open && "rotate-180")} aria-hidden="true" />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 pb-3 pl-8">
          <p>{check.message}</p>
          {mounted && (check.expected || check.actual) ? (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted">Details</summary>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
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

export function CheckList({ checks }: { checks: CheckResult[] }) {
  const problems = checks.filter((c) => c.severity === "block" || c.severity === "warn" || c.severity === "unknown").length;
  const passed = checks.filter((c) => c.severity === "pass").length;
  const notes = checks.filter((c) => c.severity === "info").length;
  const [open, setOpen] = useState(problems > 0);
  const summary = [
    problems === 0 ? "No problems" : `${problems} ${problems === 1 ? "problem" : "problems"}`,
    `${passed} passed`,
    ...(notes ? [`${notes} ${notes === 1 ? "note" : "notes"}`] : []),
  ].join(", ");
  return (
    <section aria-label="Checks" className="rounded-xl border border-line">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex min-h-11 w-full items-center justify-between px-4 py-2 text-left font-medium" data-testid="checks-toggle">
          <span>{summary}</span>
          <span className="flex items-center gap-1 text-sm text-muted">
            {open ? "Hide" : "Show"}
            <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden="true" />
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ul className="px-4">
            {checks.map((c) => (
              <CheckRow key={c.id} check={c} />
            ))}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
