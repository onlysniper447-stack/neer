import { DEFAULT_RULES, REQUIRED_CHECKS, RULE_CATALOG, chainName, humanDuration } from "@neer/core";
import { Check, Minus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { LocalStatsPanel } from "@/components/local-stats";
import { LocalTime } from "@/components/local-time";
import { ExternalLink, PageHeader, Section } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { minimumsExpireAt, overviewFromTokens } from "@/lib/analytics";
import { getTokens } from "@/lib/server/upstream";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Analytics", description: "Live NEAR Intents networks and tokens, the minimums Neer enforces and its rules catalog." };
export const dynamic = "force-dynamic";

const SEVERITY = {
  block: { word: "Can block", cls: "border-stop/40 bg-stop-bg text-stop" },
  warn: { word: "Can warn", cls: "border-check/40 bg-check-bg text-check" },
  info: { word: "Note only", cls: "border-line bg-surface text-muted" },
} as const;

function Stat({ label, value, note, testId }: { label: string; value: string; note: string; testId?: string }) {
  return (
    <div className="rounded-2xl border border-line p-5">
      <p className="text-sm font-medium text-muted">{label}</p>
      <p className="tabular mt-1 text-4xl font-semibold tracking-tight" data-testid={testId}>
        {value}
      </p>
      <p className="mt-2 text-sm text-muted">{note}</p>
    </div>
  );
}

export default async function AnalyticsPage() {
  const state = await getTokens();
  const o = overviewFromTokens(state.tokens);
  const live = o.tokens > 0;
  const m = DEFAULT_RULES.minimums;

  return (
    <>
      <PageHeader eyebrow="Analytics" title="Live numbers, no estimates">
        Counts come from the NEAR Intents 1Click token list, read by Neer&apos;s server and cached for 5 minutes. The rest is the exact rules this deployment runs.
      </PageHeader>

      <div className="space-y-16">
        <Section id="live" title="Supported by NEAR Intents right now">
          {live ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Stat label="Networks" value={String(o.networks)} note="Distinct networks in /v0/tokens" testId="stat-networks" />
                <Stat label="Tokens" value={String(o.tokens)} note="Assets you can swap through 1Click" testId="stat-tokens" />
                <Stat label="Address formats Neer validates" value={`${o.validatedNetworks} of ${o.networks}`} note="Networks where Neer checks format and checksum" />
                <Stat label="Checks in the rules engine" value={String(RULE_CATALOG.length)} note={`Each runs when it applies; ${REQUIRED_CHECKS.length} must pass for Safe`} />
              </div>
              <p className="mt-4 text-sm text-muted">
                {state.fetchedAt ? (
                  <>
                    Token list fetched <LocalTime iso={new Date(state.fetchedAt).toISOString()} className="text-ink" />
                    {state.fresh ? "" : " (1Click didn't answer since, so this is the last good copy)"}.
                  </>
                ) : null}
                {o.newestPrice ? (
                  <>
                    {" "}
                    Newest token price: <LocalTime iso={o.newestPrice} className="text-ink" />.
                  </>
                ) : null}
              </p>
            </>
          ) : (
            <div role="alert" className="rounded-2xl border border-check/50 bg-check-bg p-5 sm:p-6" data-testid="analytics-unavailable">
              <p className="text-lg font-semibold text-check">Can&apos;t load live data right now</p>
              <p className="mt-1 text-ink">NEAR Intents didn&apos;t return its token list, so there are no counts to show. Neer won&apos;t guess them.</p>
              <Button asChild className="mt-4">
                <Link href="/analytics">Try again</Link>
              </Button>
            </div>
          )}
        </Section>

        {live ? (
          <Section id="networks" title="Networks" lede="Every network in the live token list, with the minimum Neer enforces and the time it budgets for a deposit to confirm.">
            <div className="overflow-hidden rounded-2xl border border-line">
              <table className="w-full text-left text-[15px]">
                <caption className="sr-only">Networks in the 1Click token list</caption>
                <thead className="bg-surface text-sm text-muted">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Network
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">
                      Tokens
                    </th>
                    <th scope="col" className="hidden px-4 py-3 font-medium sm:table-cell">
                      Address check
                    </th>
                    <th scope="col" className="hidden px-4 py-3 font-medium md:table-cell">
                      Minimum
                    </th>
                    <th scope="col" className="hidden px-4 py-3 font-medium lg:table-cell">
                      Confirm budget
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {o.rows.map((r) => (
                    <tr key={r.id} data-testid={`network-${r.id}`}>
                      <td className="px-4 py-2.5">
                        <span className="font-medium">{r.name}</span> <span className="font-mono text-sm text-muted">{r.id}</span>
                        <span className="mt-0.5 block text-sm text-muted sm:hidden">
                          {r.validated ? "Address validated" : "Address not validated"}
                          {r.minimum ? ` · Min ${r.minimum}` : ""}
                        </span>
                      </td>
                      <td className="tabular px-4 py-3 text-right">{r.tokens}</td>
                      <td className="hidden px-4 py-3 sm:table-cell">
                        {r.validated ? (
                          <span className="inline-flex items-center gap-1.5 text-safe">
                            <Check className="size-4" aria-hidden="true" /> Validated
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-muted">
                            <Minus className="size-4" aria-hidden="true" /> Not validated
                          </span>
                        )}
                      </td>
                      <td className="hidden px-4 py-3 md:table-cell">{r.minimum ?? <span className="text-muted">None</span>}</td>
                      <td className="tabular hidden px-4 py-3 lg:table-cell">{humanDuration(r.confirmBudgetSec)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        ) : null}

        <Section
          id="minimums"
          title="Network minimums Neer enforces"
          lede="Temporary limits announced by NEAR Intents. Swaps under them don't fill, so Neer says Don't send."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-line p-5 sm:p-6">
              <p className="tabular text-3xl font-semibold tracking-tight">${Number(m.usd1000).toLocaleString("en-US")}</p>
              <p className="mt-1 text-muted">for swaps from or to</p>
              <p className="mt-2 font-medium">{m.usd1000Chains.map((c) => chainName(c)).join(", ")}</p>
            </div>
            <div className="rounded-2xl border border-line p-5 sm:p-6">
              <p className="tabular text-3xl font-semibold tracking-tight">${Number(m.tronOriginUsd).toLocaleString("en-US")}</p>
              <p className="mt-1 text-muted">for deposits from</p>
              <p className="mt-2 font-medium">Tron</p>
            </div>
          </div>
          <p className="mt-4 text-sm text-muted">
            Last confirmed against the NEAR Intents changelog on <LocalTime iso={m.checkedAt} className="text-ink" />. After{" "}
            <LocalTime iso={minimumsExpireAt()} className="text-ink" /> the minimum check reports Not confirmed until someone re-checks. Sources:{" "}
            {m.sources.map((s, i) => (
              <span key={s}>
                {i > 0 ? ", " : ""}
                <ExternalLink href={s}>{i === 0 ? "$1,000 minimum" : "Tron $100 minimum"}</ExternalLink>
              </span>
            ))}
            .
          </p>
        </Section>

        <Section id="rules" title="Rules catalog" lede={`Rules version ${DEFAULT_RULES.version}. Any check that can block gives Don't send; any warning or unconfirmed check gives Check this.`}>
          <ul className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-2">
            {RULE_CATALOG.map((r) => {
              const sev = SEVERITY[r.maxSeverity];
              const required = REQUIRED_CHECKS.includes(r.id);
              return (
                <li key={r.id} className="bg-bg p-5 md:[&:last-child:nth-child(odd)]:col-span-2" data-testid={`rule-${r.id}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{r.title}</p>
                    <span className="font-mono text-xs text-muted">{r.id}</span>
                    <span className={cn("ml-auto rounded-full border px-2 py-0.5 text-xs font-medium", sev.cls)}>{sev.word}</span>
                    {required ? <span className="rounded-full border border-brand/40 bg-bg px-2 py-0.5 text-xs font-medium text-brand">Needed for Safe</span> : null}
                  </div>
                  <p className="mt-1.5 text-[15px] text-muted">{r.what}</p>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 text-sm text-muted">
            What each check says and when: <Link href="/resources#checks" className="font-medium text-brand underline underline-offset-4">checks explained</Link>.
          </p>
        </Section>

        <Section id="this-browser" title="Your checks on this device" lede="Private counts kept in your browser's local storage. Neer's server doesn't keep them.">
          <LocalStatsPanel />
        </Section>
      </div>
    </>
  );
}
