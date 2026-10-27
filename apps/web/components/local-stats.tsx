"use client";

import { useSyncExternalStore } from "react";
import { chainName } from "@neer/core";
import { Button } from "@/components/ui/button";
import { EMPTY_STATS, STATS_KEY, clearStats, readStats, type LocalStats } from "@/lib/local-stats";
import { LocalTime } from "./local-time";

let cache: { raw: string | null; value: LocalStats } = { raw: null, value: EMPTY_STATS };

function snapshot(): LocalStats {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STATS_KEY);
  } catch {
    raw = null;
  }
  if (raw !== cache.raw) cache = { raw, value: readStats() };
  return cache.value;
}

function subscribe(cb: () => void) {
  window.addEventListener("neer-stats", cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener("neer-stats", cb);
    window.removeEventListener("storage", cb);
  };
}

/** Counts of the preflights run in this browser. Read from localStorage only. */
export function LocalStatsPanel() {
  const stats = useSyncExternalStore(subscribe, snapshot, () => null);
  if (stats === null) {
    return <div className="h-40 animate-pulse rounded-2xl bg-surface" aria-hidden="true" />;
  }
  const rows: [string, number, string][] = [
    ["Safe to send", stats.safe, "bg-safe"],
    ["Check this", stats.check, "bg-check"],
    ["Don't send", stats.block, "bg-stop"],
  ];
  const networks = Object.entries(stats.byNetwork).sort((a, b) => b[1] - a[1]);
  return (
    <div className="rounded-2xl border border-line p-5 sm:p-6" data-testid="local-stats">
      {stats.total === 0 ? (
        <div className="py-4 text-center">
          <p className="font-medium">No checks from this browser yet</p>
          <p className="mt-1 text-sm text-muted">After you run a preflight, its verdict is counted here. Only on this device.</p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <p className="text-sm text-muted">Preflights run in this browser</p>
            <p className="tabular text-4xl font-semibold tracking-tight" data-testid="local-total">
              {stats.total}
            </p>
            <ul className="mt-4 space-y-2">
              {rows.map(([label, n, cls]) => (
                <li key={label} className="grid grid-cols-[7.5rem_minmax(0,1fr)_2.5rem] items-center gap-3 text-sm">
                  <span>{label}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-surface" aria-hidden="true">
                    <span className={`block h-full rounded-full ${cls}`} style={{ width: `${stats.total ? (n / stats.total) * 100 : 0}%` }} />
                  </span>
                  <span className="tabular text-right font-medium">{n}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-3 text-sm">
            {networks.length ? (
              <div>
                <p className="text-muted">Networks you sent on</p>
                <p className="mt-1">{networks.map(([id, n]) => `${chainName(id)} (${n})`).join(", ")}</p>
              </div>
            ) : null}
            {stats.firstAt && stats.lastAt ? (
              <p className="text-muted">
                From <LocalTime iso={stats.firstAt} className="text-ink" /> to <LocalTime iso={stats.lastAt} className="text-ink" />
              </p>
            ) : null}
          </div>
        </div>
      )}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <p className="text-sm text-muted">Stored in this browser only: verdicts, networks and times. No addresses or amounts. Never sent to Neer.</p>
        <Button variant="outline" onClick={() => clearStats()} disabled={stats.total === 0}>
          Clear these stats
        </Button>
      </div>
    </div>
  );
}
