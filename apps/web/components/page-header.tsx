import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Page title block: eyebrow, h1 and a one-line lede. */
export function PageHeader({ eyebrow, title, children, className, actions }: { eyebrow?: string; title: ReactNode; children?: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <div className={cn("mb-8 flex flex-col gap-4 lg:mb-10 lg:flex-row lg:items-end lg:justify-between", className)}>
      <div className="max-w-3xl space-y-3">
        {eyebrow ? <p className="text-sm font-semibold tracking-wide text-brand">{eyebrow}</p> : null}
        <h1 className="text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl">{title}</h1>
        {children ? <div className="text-lg leading-relaxed text-muted text-pretty">{children}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

/** A titled page section with a stable anchor. */
export function Section({ id, title, lede, children, className }: { id: string; title: string; lede?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cn("scroll-mt-24", className)}>
      <h2 id={`${id}-title`} className="text-2xl font-semibold tracking-tight">
        {title}
      </h2>
      {lede ? <p className="mt-2 max-w-3xl text-muted">{lede}</p> : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function ExternalLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cn("font-medium text-brand underline underline-offset-4 decoration-brand/40 hover:decoration-brand", className)}>
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
