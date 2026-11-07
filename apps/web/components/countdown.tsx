"use client";

import { useServerNow } from "@/hooks/use-server-now";
import { useMounted } from "@/hooks/use-mounted";
import { formatClock } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Send-before countdown: absolute time first, then a bar and the time left.
 * Uses server time and elapsed time; a device clock rollback cannot extend it.
 * Announces only at 15, 5 and 1 minutes.
 */
export function Countdown({ sendBefore, serverTime, startedAt, budgetSec }: { sendBefore: string; serverTime: string; startedAt?: string; budgetSec: number }) {
  const mounted = useMounted();
  const serverNow = useServerNow(serverTime);

  if (!mounted) {
    return <div className="h-[104px] animate-pulse rounded-xl bg-surface" aria-hidden="true" />;
  }

  const end = new Date(sendBefore).getTime();
  const left = Math.max(0, Math.floor((end - serverNow) / 1000));
  const start = startedAt ? new Date(startedAt).getTime() : end - 30 * 60_000;
  const fraction = Math.min(1, Math.max(0, (end - serverNow) / Math.max(1, end - start)));

  const state = left === 0 ? "expired" : left < budgetSec ? "stop" : left <= 15 * 60 ? "check" : "ok";
  const min = Math.floor(left / 60);
  const sec = left % 60;
  const relative =
    state === "expired"
      ? `Expired at ${formatClock(sendBefore)}`
      : state === "stop"
        ? "Too close. Get a fresh quote."
        : state === "check"
          ? `${min}:${String(sec).padStart(2, "0")} left`
          : min >= 120
            ? `${Math.floor(min / 60)} h ${min % 60} min left`
            : `${min} min left`;
  const announcement = left === 0 ? "Quote expired" : min < 1 ? "1 minute left" : min < 5 ? "5 minutes left" : min < 15 ? "15 minutes left" : "";

  return (
    <div className="rounded-xl border border-line p-4 sm:p-5" data-testid="countdown" data-state={state}>
      <p className="text-sm text-muted">Deposit deadline</p>
      <p className="tabular text-2xl font-semibold tracking-tight">{formatClock(sendBefore)}</p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface" aria-hidden="true">
        <div
          className={cn("h-full rounded-full", state === "ok" ? "bg-brand" : state === "check" ? "bg-check" : "bg-stop")}
          style={{ width: `${(fraction * 100).toFixed(1)}%` }}
        />
      </div>
      <p className={cn("tabular mt-2 text-sm font-medium", state === "ok" ? "text-muted" : state === "check" ? "text-check" : "text-stop")}>{relative}</p>
      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
    </div>
  );
}
