import { REQUIRED_CHECKS, RULE_CATALOG, SAFE_DEFINITION, STATUS_LABELS } from "@neer/core";
import { ArrowUpRight, ChevronDown, CircleAlert, CircleCheck, CircleX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, PageHeader, Section } from "@/components/page-header";
import { Toc } from "@/components/toc";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Resources", description: "How Neer works, what each check and status means, safety tips and FAQ." };

const TOC = [
  { id: "how", title: "How Neer works" },
  { id: "verdicts", title: "The three answers" },
  { id: "checks", title: "Checks explained" },
  { id: "statuses", title: "Swap statuses" },
  { id: "safety", title: "Safety tips" },
  { id: "faq", title: "FAQ" },
  { id: "links", title: "Links" },
];

const HOW = [
  ["You paste the deposit address", "Your swap app got it from NEAR Intents' 1Click API when it asked for a quote. Neer looks up that quote with the public status endpoint."],
  ["Neer verifies the quote", "1Click signs every quote. Neer checks the signature, so a changed deposit address, amount, deadline or refund address can't slip through."],
  ["You say how you'll send", "Network, token, amount, memo, and whether it's your wallet or an exchange. Nothing is pre-selected, so a default can't be wrong for you."],
  ["Neer runs every check that applies", "Network, token, amount, memo, time left, minimums, refund address, lookalikes and more, read fresh from 1Click each time."],
  ["You get one answer", "Any problem means Don't send. Anything Neer can't confirm means Check this. Safe to send needs every required check to pass."],
] as const;

const VERDICTS = [
  { Icon: CircleCheck, label: "Safe to send", cls: "text-safe", box: "border-safe/40 bg-safe-bg", text: SAFE_DEFINITION },
  {
    Icon: CircleAlert,
    label: "Check this",
    cls: "text-check",
    box: "border-check/40 bg-check-bg",
    text: "Something needs your attention, or Neer couldn't confirm it (for example NEAR Intents didn't answer). Read the reason before you send.",
  },
  {
    Icon: CircleX,
    label: "Don't send",
    cls: "text-stop",
    box: "border-stop/40 bg-stop-bg",
    text: "Sending now could lose the money or leave it stuck until a refund. Neer says why and what to do, like switching network or getting a new quote.",
  },
] as const;

const STATUS_TEXT: Record<keyof typeof STATUS_LABELS, string> = {
  PENDING_DEPOSIT: "The quote is live and nothing has arrived yet. Send before the deadline.",
  KNOWN_DEPOSIT_TX: "Your transaction was seen on the origin network. Nothing to do.",
  PROCESSING: "NEAR Intents is swapping and delivering. Usually a few minutes.",
  SUCCESS: "Delivered to the recipient address. The tracker links the destination transaction.",
  INCOMPLETE_DEPOSIT: "Less arrived than the swap needs. It's refunded to your refund address after the deadline.",
  REFUNDED: "The deposit went back to the refund address. A small refund fee may apply.",
  FAILED: "The swap didn't complete. Contact your swap app's support with the correlation ID.",
};

const TONE_DOT = { neutral: "bg-brand", safe: "bg-safe", check: "bg-check", stop: "bg-stop" } as const;

const TIPS = [
  "Never share your seed phrase or private key. Neer, NEAR Intents and real support never ask for it.",
  "Use each deposit address once, for the swap it was made for. If it came from a message or an old screenshot, get a new quote.",
  "Copy the address from your swap app, then compare the middle of it on your wallet's confirm screen, not just the first and last characters.",
  "Send on the exact network the quote names. Ethereum, Base and other EVM networks share an address format, so a wrong network still looks valid.",
  "Send before the deadline, and leave time for your network to confirm.",
  "Prefer your own wallet. Exchanges can batch withdrawals, add fees and be slow to credit refunds.",
  "Keep the signed quote (Save signed quote) until the swap is done. It's your record if something goes wrong.",
  "Support never DMs you first. If someone does, it's a scam.",
];

const FAQ = [
  ["Is Safe to send a guarantee?", "No. It means your transfer matches a quote signed by NEAR Intents, read just now. It's a check, not a guarantee."],
  ["Does Neer hold or move my money?", "No. Neer only reads public quote data. It never connects a wallet, signs or sends anything, and has no custody of funds."],
  [
    "What happens if NEAR Intents doesn't answer?",
    "Neer fails closed. You get Can't check right now (a Check this answer), never Safe to send. Wait a minute and try again before you send.",
  ],
  ["Why do I have to pick the network myself?", "Because the address can't tell. Ethereum and Base addresses look identical, which is how near/intents#382 happened. A default could be wrong for you."],
  ["Which networks does Neer cover?", "Every network in the NEAR Intents token list. The Analytics page lists them and shows which ones Neer validates address formats and checksums for."],
  [
    "What does Neer store?",
    "Neer's server keeps no history of your addresses or checks. It holds a status read in memory for 5 seconds so tracker tabs share it, and counts requests per IP for one minute to rate-limit. The Analytics page shows counts kept only in your browser, which you can clear.",
  ],
  ["Can my app use this?", "Yes. The same checks are a JSON API, and the <NeerGuard/> React widget keeps a Send button disabled until a fresh Safe to send."],
  ["Is Neer part of NEAR?", "No. It's an independent project built on the public NEAR Intents 1Click API, not affiliated with NEAR Foundation."],
] as const;

const LINKS = [
  { href: "https://docs.near-intents.org", title: "NEAR Intents docs", text: "How intents, 1Click and deposits work." },
  { href: "https://explorer.near-intents.org", title: "NEAR Intents explorer", text: "Look up swaps and their transactions." },
  { href: "https://near.com/support", title: "NEAR support", text: "Official help, if a swap went wrong." },
  { href: "https://near.com/terms", title: "NEAR terms of service", text: "The terms for NEAR's products." },
  { href: "https://github.com/near/intents/issues/382", title: "near/intents#382", text: "ETH sent on Base to an Ethereum quote: the case Neer's network check exists for." },
] as const;

export default function ResourcesPage() {
  return (
    <>
      <PageHeader eyebrow="Resources" title="How Neer keeps a deposit safe">
        What happens when you run a check, what every answer means, and how to avoid the mistakes that lose money.
      </PageHeader>

      <div className="grid gap-10 lg:grid-cols-[13rem_minmax(0,1fr)] xl:gap-16">
        <Toc items={TOC} />
        <div className="min-w-0 max-w-5xl space-y-16">
          <Section id="how" title="How Neer works">
            <ol className="space-y-4">
              {HOW.map(([title, text], i) => (
                <li key={title} className="flex gap-4">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-semibold text-brand-ink tabular" aria-hidden="true">
                    {i + 1}
                  </span>
                  <div className="pt-0.5">
                    <p className="font-semibold">{title}</p>
                    <p className="mt-0.5 text-muted">{text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Section>

          <Section id="verdicts" title="The three answers">
            <ul className="grid gap-4 md:grid-cols-3">
              {VERDICTS.map(({ Icon, label, cls, box, text }) => (
                <li key={label} className={cn("rounded-2xl border p-5", box)}>
                  <p className={cn("flex items-center gap-2 text-lg font-semibold", cls)}>
                    <Icon className="size-5" aria-hidden="true" /> {label}
                  </p>
                  <p className="mt-2 text-[15px] text-ink">{text}</p>
                </li>
              ))}
            </ul>
          </Section>

          <Section
            id="checks"
            title="Checks explained"
            lede={`Each check gives pass, a note, Check this or Don't send. The ${REQUIRED_CHECKS.length} marked "Needed for Safe" must pass for Safe to send.`}
          >
            <ul className="divide-y divide-line rounded-2xl border border-line">
              {RULE_CATALOG.map((r) => (
                <li key={r.id} className="p-5 sm:p-6" id={`check-${r.id}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold">{r.title}</h3>
                    {REQUIRED_CHECKS.includes(r.id) ? (
                      <span className="rounded-full border border-brand/40 px-2 py-0.5 text-xs font-medium text-brand">Needed for Safe</span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-ink">{r.what}</p>
                  <dl className="mt-3 grid gap-2 text-[15px] sm:grid-cols-2">
                    {r.blocksWhen ? (
                      <div className="rounded-lg bg-stop-bg p-3">
                        <dt className="flex items-center gap-1.5 font-medium text-stop">
                          <CircleX className="size-4" aria-hidden="true" /> Don&apos;t send when
                        </dt>
                        <dd className="mt-0.5 text-ink">{r.blocksWhen}</dd>
                      </div>
                    ) : null}
                    {r.warnsWhen ? (
                      <div className="rounded-lg bg-check-bg p-3">
                        <dt className="flex items-center gap-1.5 font-medium text-check">
                          <CircleAlert className="size-4" aria-hidden="true" /> Check this when
                        </dt>
                        <dd className="mt-0.5 text-ink">{r.warnsWhen}</dd>
                      </div>
                    ) : null}
                    {!r.blocksWhen && !r.warnsWhen ? (
                      <div className="rounded-lg bg-surface p-3">
                        <dt className="font-medium text-muted">Note only</dt>
                        <dd className="mt-0.5 text-ink">Shown for context. It never changes the answer.</dd>
                      </div>
                    ) : null}
                  </dl>
                </li>
              ))}
            </ul>
          </Section>

          <Section id="statuses" title="Swap statuses" lede="What the tracker shows after you send, with the same wording.">
            <ul className="divide-y divide-line rounded-2xl border border-line">
              {(Object.keys(STATUS_TEXT) as (keyof typeof STATUS_TEXT)[]).map((s) => (
                <li key={s} className="flex gap-4 p-4 sm:p-5">
                  <span className={cn("mt-2 size-2.5 shrink-0 rounded-full", TONE_DOT[STATUS_LABELS[s].tone])} aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-semibold">{STATUS_LABELS[s].label}</span>
                      <span className="font-mono text-xs text-muted">{s}</span>
                      {STATUS_LABELS[s].terminal ? <span className="text-xs font-medium text-muted">Final</span> : null}
                    </p>
                    <p className="mt-0.5 text-muted">{STATUS_TEXT[s]}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Section>

          <Section id="safety" title="Safety tips">
            <ul className="grid gap-3 md:grid-cols-2">
              {TIPS.map((t) => (
                <li key={t} className="flex gap-3 rounded-xl border border-line p-4">
                  <CircleCheck className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden="true" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section id="faq" title="FAQ">
            <div className="divide-y divide-line rounded-2xl border border-line">
              {FAQ.map(([q, a]) => (
                <details key={q} className="group">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-3 font-semibold [&::-webkit-details-marker]:hidden">
                    {q}
                    <ChevronDown className="size-5 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden="true" />
                  </summary>
                  <p className="px-5 pb-5 text-muted">{a}</p>
                </details>
              ))}
            </div>
            <p className="mt-4 text-sm text-muted">
              Building on Neer? See the <Link href="/developers" className="font-medium text-brand underline underline-offset-4">API docs</Link>.
            </p>
          </Section>

          <Section id="links" title="Links">
            <ul className="grid gap-3 md:grid-cols-2">
              {LINKS.map((l) => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex h-full items-start justify-between gap-3 rounded-xl border border-line p-4 transition-colors hover:border-brand/50 hover:bg-surface"
                    data-testid="external-link"
                  >
                    <span>
                      <span className="block font-semibold text-ink">{l.title}</span>
                      <span className="mt-0.5 block text-[15px] text-muted">{l.text}</span>
                      <span className="mt-1 block font-mono text-xs break-all text-muted">{l.href.replace("https://", "")}</span>
                    </span>
                    <ArrowUpRight className="size-5 shrink-0 text-brand transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-muted">
              Network minimum announcements: <ExternalLink href="https://docs.near-intents.org/changelog/entries/2026-09-09-temporary-1000-minimum">$1,000 minimum</ExternalLink> and{" "}
              <ExternalLink href="https://docs.near-intents.org/changelog/entries/2026-09-14-temporary-tron-100-minimum">Tron $100 minimum</ExternalLink>.
            </p>
          </Section>
        </div>
      </div>
    </>
  );
}
