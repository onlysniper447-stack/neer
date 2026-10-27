"use client";

import type { QuoteResponse } from "@neer/core";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Downloads the signed 1Click quote plus what Neer saw. 1Click asks clients to
 * keep the signed quote to resolve disputes; this file is that record.
 */
export function ReceiptButton({ signedQuote, record, label = "Save signed quote" }: { signedQuote: QuoteResponse | null; record: Record<string, unknown>; label?: string }) {
  if (!signedQuote) return null;
  const quote = signedQuote;
  function download() {
    const receipt = { kind: "neer-receipt", savedAt: new Date().toISOString(), neer: record, signedQuote: quote };
    const blob = new Blob([JSON.stringify(receipt, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `neer-${(quote.quote.depositAddress ?? "quote").slice(0, 10)}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <Button type="button" variant="outline" onClick={download}>
      <Download className="size-4" aria-hidden="true" />
      {label}
    </Button>
  );
}
