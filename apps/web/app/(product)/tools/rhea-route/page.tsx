import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { RheaRoute } from "@/components/rhea-route";
import { isRheaConfigured } from "@/lib/server/rhea";

export const metadata: Metadata = {
  title: "RHEA route estimate",
  description: "Get a swap estimate from RHEA's cross-chain API, then check the deposit address in Neer before you send.",
};
export const dynamic = "force-dynamic";

export default function RheaRoutePage() {
  return (
    <>
      <PageHeader eyebrow="Tools" title="RHEA route estimate">
        Ask RHEA&apos;s cross-chain swap API for an estimate, then check the deposit address in Neer before you send. Neer does not create, sign or send swaps.
      </PageHeader>
      <RheaRoute configured={isRheaConfigured()} />
    </>
  );
}
