import type { TimelineStep } from "@neer/core";
import { Check, Circle, CircleDot, Minus, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";

const TONE: Record<TimelineStep["tone"], string> = {
  neutral: "text-brand",
  safe: "text-safe",
  check: "text-check",
  stop: "text-stop",
};

export function StatusTimeline({ steps, detail }: { steps: TimelineStep[]; detail: Partial<Record<TimelineStep["key"], React.ReactNode>> }) {
  return (
    <ol className="relative space-y-0" aria-label="Swap progress" data-testid="timeline">
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        const Icon = s.state === "done" ? (s.tone === "stop" ? X : s.tone === "check" ? TriangleAlert : Check) : s.state === "current" ? CircleDot : s.state === "skipped" ? Minus : Circle;
        return (
          <li key={s.key} className="relative flex gap-3 pb-5 last:pb-0" data-state={s.state} data-step={s.key}>
            {!last ? <span className="absolute top-7 left-[13px] h-[calc(100%-1.5rem)] w-0.5 bg-line" aria-hidden="true" /> : null}
            <span
              className={cn(
                "relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border bg-bg",
                s.state === "upcoming" || s.state === "skipped" ? "border-line text-muted" : cn("border-current", TONE[s.tone]),
                s.state === "current" && "neer-pulse",
              )}
              aria-hidden="true"
            >
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 pt-0.5 [overflow-wrap:anywhere]">
              <p className={cn("font-medium", s.state === "upcoming" || s.state === "skipped" ? "text-muted" : "text-ink")}>
                {s.title}
                <span className="sr-only">
                  {s.state === "done" ? " (done)" : s.state === "current" ? " (current step)" : s.state === "skipped" ? " (skipped)" : " (not yet)"}
                </span>
              </p>
              {detail[s.key] ? <div className="mt-1 text-sm text-muted">{detail[s.key]}</div> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
