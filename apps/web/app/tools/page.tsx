import { ArrowRight, Fingerprint, Radar, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Tools", description: "Neer's deposit preflight, swap tracker and address checker." };

const TOOLS = [
  {
    href: "/",
    Icon: ShieldCheck,
    title: "Deposit preflight",
    text: "Paste a 1Click deposit address and say how you'll send. Neer checks network, token, amount, memo, time left, minimums, refund address and lookalikes against the signed quote.",
    cta: "Check a deposit",
  },
  {
    href: "/track",
    Icon: Radar,
    title: "Swap tracker",
    text: "Follow a deposit after you send: seen, swapping, delivered or refunded, with explorer links and the signed quote to keep.",
    cta: "Track a deposit",
  },
  {
    href: "/tools/address",
    Icon: Fingerprint,
    title: "Address checker",
    text: "Paste any address to see which networks it's valid on, whether its checksum is right and its canonical form. Compare two addresses to catch lookalikes.",
    cta: "Check an address",
  },
] as const;

const LATER = [
  { title: "Refund helper", text: "Find out where a refund went and when to expect it." },
  { title: "Signed verdicts", text: "A Neer verdict your app can verify and keep with the quote." },
] as const;

export default function ToolsPage() {
  return (
    <>
      <PageHeader eyebrow="Tools" title="Everything you can check with Neer">
        Each tool is read-only. None of them connects a wallet, signs or sends anything.
      </PageHeader>

      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Available tools">
        {TOOLS.map(({ href, Icon, title, text, cta }) => (
          <li key={href} className="flex">
            <Link
              href={href}
              className="group flex w-full flex-col rounded-2xl border border-line p-6 transition-colors hover:border-brand/50 hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <span className="flex size-11 items-center justify-center rounded-xl bg-brand/12 text-brand" aria-hidden="true">
                <Icon className="size-6" />
              </span>
              <span className="mt-5 text-xl font-semibold tracking-tight">{title}</span>
              <span className="mt-2 flex-1 text-muted">{text}</span>
              <span className="mt-5 inline-flex items-center gap-1 font-medium text-brand">
                {cta} <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <section aria-labelledby="later-title" className="mt-14">
        <h2 id="later-title" className="text-lg font-semibold">
          Coming later
        </h2>
        <p className="mt-1 text-muted">Not built yet, so not clickable.</p>
        <ul className="mt-4 grid gap-4 md:grid-cols-2">
          {LATER.map((t) => (
            <li key={t.title} className="rounded-2xl border border-dashed border-line p-5">
              <p className="flex flex-wrap items-center gap-2 font-semibold text-ink">
                {t.title}
                <span className="rounded-full border border-line bg-surface px-2 py-0.5 text-xs font-medium text-muted">Coming later</span>
              </p>
              <p className="mt-1 text-[15px] text-muted">{t.text}</p>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
