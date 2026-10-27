import { CircleAlert, CircleCheck, CircleX } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Tone = "safe" | "check" | "stop";

const STYLE: Record<Tone, { box: string; icon: typeof CircleCheck; text: string; dot: string }> = {
  safe: { box: "bg-safe-bg border-safe/50", icon: CircleCheck, text: "text-safe", dot: "bg-safe" },
  check: { box: "bg-check-bg border-check/50", icon: CircleAlert, text: "text-check", dot: "bg-check" },
  stop: { box: "bg-stop-bg border-stop/50", icon: CircleX, text: "text-stop", dot: "bg-stop" },
};

export function toneForVerdict(v: "safe" | "check" | "block"): Tone {
  return v === "safe" ? "safe" : v === "check" ? "check" : "stop";
}

/** Verdict: icon + word + colour, never colour alone. Announced once via role=status. */
export function VerdictCard({ tone, label, headline, message, children }: { tone: Tone; label: string; headline: string; message?: string; children?: ReactNode }) {
  const s = STYLE[tone];
  const Icon = s.icon;
  return (
    <section
      role="status"
      aria-live="polite"
      className={cn("neer-reveal relative overflow-hidden rounded-2xl border p-5 [overflow-wrap:anywhere] sm:p-6 lg:p-7", s.box)}
      data-testid="verdict"
      data-tone={tone}
    >
      <span className={cn("absolute inset-y-0 left-0 w-1.5", s.dot)} aria-hidden="true" />
      <div className={cn("flex items-center gap-2.5", s.text)}>
        <Icon className="size-7 shrink-0" aria-hidden="true" />
        <h2 className="text-2xl leading-8 font-semibold tracking-tight">{label}</h2>
      </div>
      <p className="mt-3 text-lg leading-snug font-semibold text-ink sm:text-xl" data-testid="verdict-headline">
        {headline}
      </p>
      {message ? <p className="mt-1.5 max-w-prose text-ink/90">{message}</p> : null}
      {children ? <div className="mt-5 space-y-4">{children}</div> : null}
    </section>
  );
}
