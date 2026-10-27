"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { VerdictCard } from "@/components/verdict-card";

/** Any unexpected error: fail closed and say so. */
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="sr-only">Something went wrong</h1>
      <VerdictCard tone="check" label="Can't check right now" headline="Something went wrong on this page" message="Don't send based on this page. Try again in a moment.">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button size="lg" onClick={() => reset()}>
            Try again
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/">Start over</Link>
          </Button>
        </div>
      </VerdictCard>
    </div>
  );
}
