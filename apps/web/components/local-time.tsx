"use client";

import { useMounted } from "@/hooks/use-mounted";
import { formatDateTime } from "@/lib/format";

/** A timestamp in the viewer's own time zone (UTC until hydrated, so SSR and client agree). */
export function LocalTime({ iso, className }: { iso: string; className?: string }) {
  const mounted = useMounted();
  const text = mounted
    ? `${formatDateTime(iso)} ${new Intl.DateTimeFormat(undefined, { timeZoneName: "short" }).formatToParts(new Date(iso)).find((p) => p.type === "timeZoneName")?.value ?? ""}`.trim()
    : `${iso.slice(0, 16).replace("T", " ")} UTC`;
  return (
    <time dateTime={iso} className={className} suppressHydrationWarning>
      {text}
    </time>
  );
}
