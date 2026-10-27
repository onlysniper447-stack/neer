import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-muted">There&apos;s nothing here. Paste a deposit address to run a check.</p>
      <Button asChild size="lg">
        <Link href="/">Check a deposit</Link>
      </Button>
    </div>
  );
}
