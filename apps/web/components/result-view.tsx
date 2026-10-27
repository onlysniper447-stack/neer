"use client";

import { SAFE_DEFINITION, getChain, type CheckResult, type PreflightResult } from "@neer/core";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AddressChip } from "./address-chip";
import { CheckList } from "./check-list";
import { Countdown } from "./countdown";
import { CopyButton } from "./copy-button";
import { ReceiptButton } from "./receipt-button";
import { VerdictCard, toneForVerdict } from "./verdict-card";

export type ApiResult = PreflightResult & { requestId?: string };

export function trackHref(address: string, memo: string | null | undefined): string {
  const qs = new URLSearchParams({ address });
  if (memo) qs.set("memo", memo);
  return `/track?${qs.toString()}`;
}

function primaryAction(checks: CheckResult[]): CheckResult["action"] | undefined {
  return checks.find((c) => (c.severity === "block" || c.severity === "warn" || c.severity === "unknown") && c.action)?.action;
}

export function ResultView({
  result,
  pastedAddress,
  pastedMemo,
  onEdit,
  sendSummary,
}: {
  result: ApiResult;
  pastedAddress: string;
  pastedMemo: string | null;
  /** Return to the "how will you send" form; optionally pre-select a network. */
  onEdit?: (chain?: string) => void;
  /** What the user said they'd send, e.g. "5 USDC on Arbitrum". */
  sendSummary?: string;
}) {
  const q = result.quote;
  const tone = toneForVerdict(result.verdict);
  const action = primaryAction(result.checks);
  const lookalike = result.checks.find((c) => c.id === "lookalike");
  const depositAddress = q?.depositAddress ?? pastedAddress;
  const track = trackHref(pastedAddress, pastedMemo);
  const memo = q?.depositMemo ?? null;
  const pending = q?.status === "PENDING_DEPOSIT";

  let primary: React.ReactNode = null;
  if (result.verdict === "safe") {
    primary = (
      <Button asChild size="lg" className="w-full sm:w-auto">
        <Link href={track}>Track this deposit</Link>
      </Button>
    );
  } else if (action?.kind === "switch-network" && onEdit) {
    primary = (
      <Button size="lg" className="w-full sm:w-auto" onClick={() => onEdit(action.chain)}>
        {action.label}
      </Button>
    );
  } else if (action?.kind === "new-quote") {
    primary = (
      <Button asChild size="lg" className="w-full sm:w-auto">
        <Link href="/">Check a new address</Link>
      </Button>
    );
  } else if (onEdit) {
    primary = (
      <Button size="lg" className="w-full sm:w-auto" onClick={() => onEdit()}>
        {action?.kind === "edit-send" ? action.label : "Change details"}
      </Button>
    );
  } else {
    primary = (
      <Button asChild size="lg" className="w-full sm:w-auto">
        <Link href="/">Check another address</Link>
      </Button>
    );
  }

  return (
    <div className="space-y-4" data-testid="result" data-verdict={result.verdict}>
      <VerdictCard tone={tone} label={result.label} headline={result.headline} message={result.verdict === "safe" ? undefined : result.message}>
        {result.verdict === "safe" && q ? (
          <div className="space-y-1">
            <p className="font-medium">Send exactly:</p>
            <p className="font-mono text-lg tabular" data-testid="send-exactly">
              {sendSummary ?? `${q.amountInFormatted} ${q.originSymbol ?? ""} on ${q.originChainName ?? ""}`}
            </p>
          </div>
        ) : null}
        {action?.kind === "new-quote" ? <p className="text-sm">Get a new quote from your swap app, then check the new address here.</p> : null}
        <div className="flex flex-wrap gap-2">
          {primary}
          {result.verdict === "check" && pending ? (
            <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
              <Link href={track}>Track this deposit</Link>
            </Button>
          ) : null}
        </div>
      </VerdictCard>

      {result.verdict === "safe" ? <p className="text-sm text-muted">{SAFE_DEFINITION}</p> : null}

      <AddressChip address={depositAddress} verified={Boolean(q?.verified && lookalike?.severity === "pass")} label="Deposit address" />

      {memo ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface p-3">
          <div>
            <p className="text-sm text-muted">Memo (required)</p>
            <p className="font-mono text-lg">{memo}</p>
          </div>
          <CopyButton value={memo} />
        </div>
      ) : null}

      {q?.sendBefore && pending ? (
        <Countdown
          key={result.serverTime}
          sendBefore={q.sendBefore}
          serverTime={result.serverTime}
          startedAt={result.signedQuote?.timestamp}
          budgetSec={q.originChain ? getChain(q.originChain).confirmBudgetSec : 600}
        />
      ) : null}

      <CheckList checks={result.checks} />

      <div className="flex flex-wrap items-center gap-2">
        <ReceiptButton
          signedQuote={result.signedQuote}
          record={{
            requestId: result.requestId ?? null,
            verdict: result.verdict,
            label: result.label,
            headline: result.headline,
            rulesVersion: result.rulesVersion,
            checksHash: result.checksHash,
            checkedAt: result.serverTime,
            checks: result.checks.map((c) => ({ id: c.id, severity: c.severity, message: c.message })),
          }}
        />
        {onEdit ? (
          <Button variant="ghost" onClick={() => onEdit()}>
            Change how I&apos;ll send
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted">
        Rules {result.rulesVersion} · checks {result.checksHash.slice(0, 12)}
        {result.requestId ? ` · ${result.requestId}` : ""}
        {q?.correlationId ? ` · 1Click ${q.correlationId}` : ""}
      </p>
    </div>
  );
}
