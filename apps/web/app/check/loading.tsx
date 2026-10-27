import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the /check layout: title, then the form or verdict beside the deposit details. */
export default function Loading() {
  return (
    <div role="status" aria-busy="true" aria-label="Looking up the quote">
      <span className="sr-only">Looking up the quote…</span>
      <div className="mb-8 space-y-3 lg:mb-10">
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-9 w-full max-w-xl" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(340px,400px)] lg:gap-x-8 xl:gap-x-10">
        <div className="space-y-4 rounded-2xl border border-line p-5 sm:p-7">
          <Skeleton className="h-6 w-48" />
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-11 w-24 rounded-full" />
            ))}
          </div>
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-56 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
