import { ArrowRight, Fingerprint, Radar, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Tools", description: "Neer's deposit preflight, swap tracker and address checker." };

const TOOLS = [
  {
    href: "/check",
    Icon: ShieldCheck,
    title: "Deposit preflight",
    text: "Compare declared network, token, amount and memo with quote details. Review deadline, published minimum and refund-address findings before deciding whether to send.",
    cta: "Check a deposit",
  },
  {
    href: "/track",
    Icon: Radar,
    title: "Swap tracker",
    text: "Review status reported by NEAR Intents, with available explorer links and a quote record. Neer does not independently confirm delivery or refunds.",
    cta: "Track a deposit",
  },
  {
    href: "/tools/address",
    Icon: Fingerprint,
    title: "Address checker",
    text: "Check supported address formats and available checksums, or compare two addresses. A format match does not prove the network, ownership or account existence.",
    cta: "Check an address",
  },
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
    </>
  );
}
