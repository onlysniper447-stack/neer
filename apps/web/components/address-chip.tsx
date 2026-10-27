import { BadgeCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { CopyButton } from "./copy-button";

/** Splits an address for display: prefix, first 4, middle groups of 4, last 4. */
export function addressParts(address: string) {
  const prefix = address.startsWith("0x") ? "0x" : "";
  const body = address.slice(prefix.length);
  const head = body.slice(0, 4);
  const tail = body.length > 8 ? body.slice(-4) : "";
  const middle = body.length > 8 ? body.slice(4, -4) : body.slice(4);
  const groups = middle.match(/.{1,4}/g) ?? [];
  return { prefix, head, groups, tail };
}

/** The address itself: ends bold, the middle in shaded groups of 4 so a lookalike differs visibly. */
export function AddressText({ address, className, testId }: { address: string; className?: string; testId?: string }) {
  const { prefix, head, groups, tail } = addressParts(address);
  return (
    <p className={cn("font-mono text-[15px] leading-7 break-all text-ink", className)} data-testid={testId}>
      <span>
        <span className="text-muted">{prefix}</span>
        <strong className="font-bold">{head}</strong>
        {groups.map((g, i) => (
          <span key={i} className={cn("rounded-[3px] px-px", i % 2 === 0 ? "bg-brand/15" : "")}>
            {g}
          </span>
        ))}
        <strong className="font-bold">{tail}</strong>
      </span>
    </p>
  );
}

/**
 * Full address, never truncated: first 4 and last 4 characters bold, the middle
 * in groups of 4 with alternating shading so a lookalike differs visibly.
 */
export function AddressChip({ address, verified, label = "To", className }: { address: string; verified?: boolean; label?: string; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-line bg-surface p-4", className)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted">{label}</p>
          {verified ? (
            <p className="mt-0.5 inline-flex items-center gap-1 text-sm font-medium text-safe">
              <BadgeCheck className="size-4 shrink-0" aria-hidden="true" />
              Matches the signed quote
            </p>
          ) : null}
        </div>
        <CopyButton value={address} ariaLabel={`Copy ${label.toLowerCase()}`} />
      </div>
      <AddressText address={address} testId="address-chip" />
    </div>
  );
}
