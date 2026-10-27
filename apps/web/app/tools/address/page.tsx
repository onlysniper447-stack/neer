import { listChains } from "@neer/core";
import type { Metadata } from "next";
import { AddressChecker } from "@/components/address-checker";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Address checker", description: "Validate an address and its checksum for NEAR Intents networks, and compare two addresses." };

export default function AddressCheckerPage() {
  const networks = listChains()
    .filter((c) => c.family !== "unsupported")
    .map((c) => ({ id: c.id, name: c.name }));
  return (
    <>
      <PageHeader eyebrow="Tools" title="Address checker">
        Paste an address to see which networks it&apos;s valid on and whether its checksum is right. Add a second address to compare them character by character.
      </PageHeader>
      <AddressChecker networks={networks} />
    </>
  );
}
