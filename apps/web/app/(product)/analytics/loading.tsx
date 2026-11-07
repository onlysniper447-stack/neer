import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading live data">
      <span className="sr-only">Loading live data…</span>
      <div className="mb-10 space-y-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-10 w-80 max-w-full" />
        <Skeleton className="h-6 w-full max-w-2xl" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-36 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="mt-16 h-96 rounded-2xl" />
    </div>
  );
}
