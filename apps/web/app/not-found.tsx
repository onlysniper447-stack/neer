import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl py-10 text-center">
      <p className="font-mono text-sm font-semibold text-brand">404</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-3 text-lg text-muted">There&apos;s nothing at this address. Paste a deposit address to run a check, or open the menu for tools and docs.</p>
      <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
        <Button asChild size="lg">
          <Link href="/">Check a deposit</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/tools">See all tools</Link>
        </Button>
      </div>
    </div>
  );
}
