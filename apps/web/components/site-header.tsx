import Link from "next/link";
import { LogoMark } from "./logo";
import { ThemeToggle } from "./theme-toggle";

export function SiteHeader() {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 rounded-md text-lg font-semibold text-ink" aria-label="Neer home">
          <LogoMark className="size-6 text-brand" />
          Neer
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-line">
      <div className="mx-auto max-w-2xl space-y-2 px-4 py-6 text-sm text-muted">
        <p>Neer never asks for your seed phrase, a signature or an approval.</p>
        <p>Independent project, not affiliated with NEAR Foundation. Quotes come from the public NEAR Intents 1Click API.</p>
        <nav className="flex flex-wrap gap-x-4 gap-y-1 pt-1" aria-label="Footer">
          <Link className="underline-offset-4 hover:underline" href="/#how-it-works">How it works</Link>
          <Link className="underline-offset-4 hover:underline" href="/#for-apps">For apps</Link>
        </nav>
      </div>
    </footer>
  );
}
