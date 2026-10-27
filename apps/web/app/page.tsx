import { RULE_CATALOG, REQUIRED_CHECKS } from "@neer/core";
import { ArrowRight, CircleAlert, CircleCheck, CircleX, Fingerprint, Radar, ShieldCheck } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { CodeBlock } from "@/components/code-block";
import { PasteForm } from "@/components/paste-form";
import { apiExample } from "@/lib/api-example";
import { requestOrigin } from "@/lib/origin";

const VERDICTS = [
  { Icon: CircleCheck, label: "Safe to send", cls: "text-safe", bg: "bg-safe-bg", text: "Your send matches the signed quote: network, token, amount, memo and time left." },
  { Icon: CircleAlert, label: "Check this", cls: "text-check", bg: "bg-check-bg", text: "Something needs a look first, or Neer couldn't confirm it. It tells you what." },
  { Icon: CircleX, label: "Don't send", cls: "text-stop", bg: "bg-stop-bg", text: "Sending now could lose the money or leave it stuck. You get the reason and the fix." },
] as const;

const STEPS = [
  ["Paste the address", "Neer looks up the quote NEAR Intents issued for it and verifies the quote's signature."],
  ["Say how you'll send", "Pick the network, token and amount you're about to use. Nothing is pre-selected, on purpose."],
  ["Get one clear answer", "Safe to send, Check this, or Don't send, with the reason and what to do about it."],
] as const;

export default async function Home() {
  const example = apiExample(requestOrigin(await headers()));
  const core = RULE_CATALOG.filter((r) => REQUIRED_CHECKS.includes(r.id));
  return (
    <div className="space-y-20 lg:space-y-28">
      <section className="grid items-start gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-16" aria-labelledby="hero-title">
        <div className="space-y-6">
          <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-sm font-medium text-muted">
            <ShieldCheck className="size-4 text-brand" aria-hidden="true" />
            NEAR Intents deposit preflight
          </p>
          <div className="space-y-4">
            <h1 id="hero-title" className="text-4xl leading-[1.08] font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
              Check before you send.
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-muted text-pretty sm:text-xl">
              Paste the deposit address from your swap. Neer compares what you&apos;re about to send with the quote NEAR Intents signed for it.
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-bg p-4 shadow-sm sm:p-6">
            <PasteForm />
          </div>
          <p className="flex gap-2 text-sm text-muted">
            <Fingerprint className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
            Neer never asks for your seed phrase, a signature or an approval. It only reads public quote data.
          </p>
        </div>

        <aside aria-labelledby="answers-title" className="rounded-2xl border border-line bg-surface p-5 sm:p-7 lg:mt-24">
          <h2 id="answers-title" className="text-lg font-semibold">
            You get one of three answers
          </h2>
          <ul className="mt-5 space-y-4">
            {VERDICTS.map(({ Icon, label, cls, bg, text }) => (
              <li key={label} className="flex gap-4">
                <span className={`flex size-10 shrink-0 items-center justify-center rounded-full ${bg}`} aria-hidden="true">
                  <Icon className={`size-5 ${cls}`} />
                </span>
                <div>
                  <p className={`font-semibold ${cls}`}>{label}</p>
                  <p className="mt-0.5 text-[15px] text-muted">{text}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-6 border-t border-line pt-4 text-sm text-muted">
            Fails closed: if NEAR Intents doesn&apos;t answer or anything can&apos;t be confirmed, the answer is never Safe to send.
          </p>
        </aside>
      </section>

      <section id="how-it-works" aria-labelledby="how-title" className="scroll-mt-24">
        <h2 id="how-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">
          How it works
        </h2>
        <ol className="mt-8 grid gap-4 md:grid-cols-3 md:gap-6">
          {STEPS.map(([title, text], i) => (
            <li key={title} className="rounded-xl border border-line p-5 sm:p-6">
              <span className="flex size-9 items-center justify-center rounded-full bg-brand font-semibold text-brand-ink tabular" aria-hidden="true">
                {i + 1}
              </span>
              <p className="mt-4 text-lg font-semibold">{title}</p>
              <p className="mt-1 text-muted">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="checks-title">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <h2 id="checks-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">
              What has to pass for Safe to send
            </h2>
            <p className="mt-2 text-muted">
              Neer has {RULE_CATALOG.length} checks and runs every one that applies to your swap. These {core.length} must all pass; any problem turns the answer
              into Check this or Don&apos;t send.
            </p>
          </div>
          <Link href="/resources#checks" className="inline-flex min-h-11 items-center gap-1 font-medium text-brand underline-offset-4 hover:underline">
            Every check explained <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
        <ul className="mt-8 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {core.map((r) => (
            <li key={r.id} className="bg-bg p-5">
              <p className="flex items-center gap-2 font-semibold">
                <CircleCheck className="size-4 text-safe" aria-hidden="true" />
                {r.title}
              </p>
              <p className="mt-1.5 text-[15px] text-muted">{r.what}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="more-tools-title" className="grid gap-4 md:grid-cols-2">
        <h2 id="more-tools-title" className="sr-only">
          More tools
        </h2>
        <Link href="/track" className="group rounded-xl border border-line p-6 transition-colors hover:border-brand/50 hover:bg-surface">
          <Radar className="size-6 text-brand" aria-hidden="true" />
          <p className="mt-3 text-lg font-semibold">Already sent? Track it</p>
          <p className="mt-1 text-muted">Follow a deposit until it&apos;s delivered or refunded, in plain English.</p>
          <span className="mt-3 inline-flex items-center gap-1 font-medium text-brand">
            Open the swap tracker <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </span>
        </Link>
        <Link href="/tools/address" className="group rounded-xl border border-line p-6 transition-colors hover:border-brand/50 hover:bg-surface">
          <Fingerprint className="size-6 text-brand" aria-hidden="true" />
          <p className="mt-3 text-lg font-semibold">Check an address by itself</p>
          <p className="mt-1 text-muted">See which networks it&apos;s valid on, whether its checksum is right, and compare it with another.</p>
          <span className="mt-3 inline-flex items-center gap-1 font-medium text-brand">
            Open the address checker <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </span>
        </Link>
      </section>

      <section id="for-apps" aria-labelledby="apps-title" className="grid scroll-mt-24 items-start gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-12">
        <div className="space-y-4">
          <h2 id="apps-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">
            For apps and wallets
          </h2>
          <p className="text-muted">
            The same checks as a JSON API. <code className="rounded bg-surface px-1 py-0.5 font-mono text-sm text-ink">POST /api/v1/preflight</code> returns a verdict
            and every check; <code className="rounded bg-surface px-1 py-0.5 font-mono text-sm text-ink">GET /api/v1/track</code> returns the swap status in plain
            English. Errors never return Safe.
          </p>
          <p className="text-muted">
            The <code className="font-mono text-sm text-ink">&lt;NeerGuard/&gt;</code> React widget keeps your Send button disabled until a fresh Safe to send.
          </p>
          <Link href="/developers" className="inline-flex min-h-11 items-center gap-1 font-medium text-brand underline-offset-4 hover:underline">
            Read the API docs <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
        <CodeBlock code={example} title="Try it with curl" />
      </section>
    </div>
  );
}
