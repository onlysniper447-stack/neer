import type { Metadata } from "next";
import Link from "next/link";
import { Tracker } from "@/components/tracker";
import { Button } from "@/components/ui/button";
import { VerdictCard } from "@/components/verdict-card";
import { MemoSchema, PastedAddressSchema } from "@/lib/inputs";
import { first, type SearchParams } from "@/lib/search-params";

export const metadata: Metadata = { title: "Track a deposit", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function TrackPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const addr = PastedAddressSchema.safeParse(first(sp.address) ?? "");
  const memoRaw = first(sp.memo);
  const memo = memoRaw ? MemoSchema.safeParse(memoRaw) : null;
  if (!addr.success || (memo && !memo.success)) {
    return (
      <div className="space-y-4">
        <VerdictCard tone="stop" label="Can't track this" headline="This doesn't look like a deposit address" message="Copy it again from your swap app." />
        <Button asChild size="lg">
          <Link href="/">Paste it again</Link>
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Deposit tracker</h1>
      <Tracker address={addr.data} memo={memo?.success && memo.data ? memo.data : null} />
    </div>
  );
}
