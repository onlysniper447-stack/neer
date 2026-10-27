import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("animate-pulse rounded-md bg-surface ring-1 ring-line/60 ring-inset", className)}
      {...props}
    />
  )
}

export { Skeleton }
