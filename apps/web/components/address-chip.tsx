import { BadgeCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { CopyButton } from "./copy-button";

/**
 * Full address, never truncated: first 4 and last 4 characters bold, the middle
 * in groups of 4 with alternating shading so a lookalike differs visibly.
 */
export function AddressChip({ address, verified, label = "To", className }: { address: string; verified?: boolean; label?: string; className?: string }) {
  const prefix = address.startsWith("0x") ? "0x" : "";
  const body = address.slice(prefix.length);
  const head = body.slice(0, 4);
  const tail = body.length > 8 ? body.slice(-4) : "";
  const middle = body.length > 8 ? body.slice(4, -4) : body.slice(4);
  const groups = middle.match(/.{1,4}/g) ?? [];
  return (
    <div className={cn("rounded-lg border border-line bg-surface p-3", className)}>
      <div className="mb-1 flex items-center justify-between gap-2 text-sm text-muted">
        <span className="flex items-center gap-1.5">
          {label}
          {verified ? (
            <span className="inline-flex items-center gap-1 text-safe">
              <BadgeCheck className="size-4" aria-hidden="true" />
              matches the signed quote
            </span>
          ) : null}
        </span>
        <CopyButton value={address} />
      </div>
      <p className="font-mono text-[15px] leading-7 break-all text-ink" aria-label={address} data-testid="address-chip">
        <span aria-hidden="true">
          <span className="text-muted">{prefix}</span>
          <strong className="font-semibold">{head}</strong>
          {groups.map((g, i) => (
            <span key={i} className={cn("rounded-sm px-px", i % 2 === 0 ? "bg-line/70" : "")}>
              {g}
            </span>
          ))}
          <strong className="font-semibold">{tail}</strong>
        </span>
      </p>
    </div>
  );
}
