import { CircleAlert, CircleCheck, CircleX } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Tone = "safe" | "check" | "stop";

const STYLE: Record<Tone, { box: string; icon: typeof CircleCheck; text: string }> = {
  safe: { box: "bg-safe-bg border-safe", icon: CircleCheck, text: "text-safe" },
  check: { box: "bg-check-bg border-check", icon: CircleAlert, text: "text-check" },
  stop: { box: "bg-stop-bg border-stop", icon: CircleX, text: "text-stop" },
};

export function toneForVerdict(v: "safe" | "check" | "block"): Tone {
  return v === "safe" ? "safe" : v === "check" ? "check" : "stop";
}

/** Verdict: icon + word + colour, never colour alone. Announced once via role=status. */
export function VerdictCard({ tone, label, headline, message, children }: { tone: Tone; label: string; headline: string; message?: string; children?: ReactNode }) {
  const s = STYLE[tone];
  const Icon = s.icon;
  return (
    <section role="status" aria-live="polite" className={cn("neer-reveal rounded-xl border border-l-4 p-4 sm:p-5", s.box)} data-testid="verdict" data-tone={tone}>
      <div className={cn("flex items-center gap-2", s.text)}>
        <Icon className="size-6 shrink-0" aria-hidden="true" />
        <h2 className="text-xl leading-7 font-semibold">{label}</h2>
      </div>
      <p className="mt-2 text-lg font-medium text-ink" data-testid="verdict-headline">
        {headline}
      </p>
      {message ? <p className="mt-1 text-ink">{message}</p> : null}
      {children ? <div className="mt-4 space-y-3">{children}</div> : null}
    </section>
  );
}
