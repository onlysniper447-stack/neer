import { STATUS_LABELS } from "@neer/core";
import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { PasteForm } from "@/components/paste-form";
import { Tracker } from "@/components/tracker";
import { VerdictCard } from "@/components/verdict-card";
import { MemoSchema, PastedAddressSchema } from "@/lib/inputs";
import { first, type SearchParams } from "@/lib/search-params";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Swap tracker", description: "Follow a NEAR Intents deposit until it's delivered or refunded." };
export const dynamic = "force-dynamic";

const STATUS_ORDER = ["PENDING_DEPOSIT", "KNOWN_DEPOSIT_TX", "PROCESSING", "SUCCESS", "INCOMPLETE_DEPOSIT", "REFUNDED", "FAILED"] as const;
const TONE_DOT = { neutral: "bg-brand", safe: "bg-safe", check: "bg-check", stop: "bg-stop" } as const;

function TrackForm({ initialAddress, initialMemo }: { initialAddress?: string; initialMemo?: string }) {
  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)] lg:gap-12">
      <div className="rounded-2xl border border-line p-5 sm:p-7">
        <PasteForm target="/track" submitLabel="Track deposit" busyLabel="Opening tracker…" initialAddress={initialAddress} initialMemo={initialMemo} />
      </div>
      <section aria-labelledby="statuses-title" className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <h2 id="statuses-title" className="font-semibold">
          What you&apos;ll see
        </h2>
        <ul className="mt-3 space-y-2.5">
          {STATUS_ORDER.map((s) => (
            <li key={s} className="flex items-center gap-3 text-[15px]">
              <span className={cn("size-2.5 shrink-0 rounded-full", TONE_DOT[STATUS_LABELS[s].tone])} aria-hidden="true" />
              {STATUS_LABELS[s].label}
            </li>
          ))}
        </ul>
        <p className="mt-4 border-t border-line pt-3 text-sm text-muted">
          Updates every 5 seconds while the tab is open and stops at a final status. Read-only: it never touches your wallet.
        </p>
      </section>
    </div>
  );
}

export default async function TrackPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const rawAddress = first(sp.address);
  const memoRaw = first(sp.memo);

  if (rawAddress === undefined || rawAddress.trim() === "") {
    return (
      <>
        <PageHeader eyebrow="Tools" title="Swap tracker">
          Paste the deposit address you sent to. Neer follows it until the swap is delivered or refunded, and explains each step in plain English.
        </PageHeader>
        <TrackForm />
      </>
    );
  }

  const addr = PastedAddressSchema.safeParse(rawAddress);
  const memo = memoRaw ? MemoSchema.safeParse(memoRaw) : null;
  if (!addr.success || (memo && !memo.success)) {
    const msg = !addr.success ? addr.error.issues[0]?.message : memo && !memo.success ? memo.error.issues[0]?.message : undefined;
    return (
      <>
        <PageHeader eyebrow="Tools" title="Swap tracker" />
        <div className="space-y-6">
          <div className="max-w-2xl">
            <VerdictCard tone="stop" label="Can't track this" headline="This doesn't look like a deposit address" message={msg ?? "Copy it again from your swap app."} />
          </div>
          <TrackForm />
        </div>
      </>
    );
  }
  return (
<Tracker address={addr.data} memo={memo?.success && memo.data ? memo.data : null} />
  );
}
