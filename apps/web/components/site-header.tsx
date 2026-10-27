import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { NAV } from "@/lib/nav";
import { LogoMark } from "./logo";
import { SiteNav } from "./site-nav";
import { ThemeToggle } from "./theme-toggle";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur supports-[backdrop-filter]:bg-bg/75">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-1 px-3 sm:px-5 lg:px-8">
        <SiteNav />
        <Link
          href="/"
          className="ml-1 flex min-h-11 items-center gap-2 rounded-lg px-1.5 text-lg font-semibold tracking-tight text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          aria-label="Neer home"
        >
          <LogoMark className="size-6 text-brand" />
          Neer
        </Link>
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

const EXTERNAL = [
  { title: "NEAR Intents docs", href: "https://docs.near-intents.org" },
  { title: "Intents explorer", href: "https://explorer.near-intents.org" },
  { title: "NEAR support", href: "https://near.com/support" },
];

export function SiteFooter() {
  const linkCls = "inline-flex min-h-8 items-center rounded-sm text-muted underline-offset-4 hover:text-ink hover:underline";
  return (
    <footer className="mt-20 border-t border-line bg-surface/60">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-x-6 gap-y-8 px-4 py-10 sm:px-6 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))] md:gap-10 lg:px-8">
        <div className="col-span-2 space-y-3 text-sm text-muted md:col-span-1">
          <p className="flex items-center gap-2 text-base font-semibold text-ink">
            <LogoMark className="size-5 text-brand" /> Neer
          </p>
          <p className="max-w-sm">Check a NEAR Intents deposit before you send. Neer never asks for your seed phrase, a signature or an approval.</p>
          <p className="max-w-sm">Independent project, not affiliated with NEAR Foundation. Quotes come from the public NEAR Intents 1Click API.</p>
        </div>
        <nav aria-label="Footer: tools" className="text-sm">
          <h2 className="mb-2 font-semibold text-ink">Tools</h2>
          <ul className="space-y-1">
            {NAV[0]!.links.map((l) => (
              <li key={l.href}>
                <Link className={linkCls} href={l.href}>
                  {l.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Footer: Neer" className="text-sm">
          <h2 className="mb-2 font-semibold text-ink">Neer</h2>
          <ul className="space-y-1">
            {NAV.slice(1).map((l) => (
              <li key={l.href}>
                <Link className={linkCls} href={l.href}>
                  {l.title === "API" ? "API docs" : l.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Footer: NEAR Intents" className="text-sm">
          <h2 className="mb-2 font-semibold text-ink">NEAR Intents</h2>
          <ul className="space-y-1">
            {EXTERNAL.map((l) => (
              <li key={l.href}>
                <a className={`${linkCls} gap-1`} href={l.href} target="_blank" rel="noopener noreferrer">
                  {l.title}
                  <ExternalLink className="size-3.5" aria-hidden="true" />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
