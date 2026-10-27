import { cn } from "@/lib/utils";
import { CopyButton } from "./copy-button";

/** Code sample with a title bar and a copy button. Scrolls inside itself, never the page. */
export function CodeBlock({ code, title, className, copy = true, testId }: { code: string; title?: string; className?: string; copy?: boolean; testId?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-xl border border-line bg-surface", className)}>
      {title || copy ? (
        <div className="flex min-h-11 items-center justify-between gap-2 border-b border-line py-1 pr-1.5 pl-4">
          <span className="truncate font-mono text-xs text-muted">{title}</span>
          {copy ? <CopyButton value={code} label="Copy" variant="ghost" ariaLabel={title ? `Copy ${title}` : "Copy code"} /> : null}
        </div>
      ) : null}
      <pre className="max-h-[32rem] overflow-auto p-4 font-mono text-[13px] leading-6 text-ink" tabIndex={0} data-testid={testId}>
        <code>{code}</code>
      </pre>
    </div>
  );
}
