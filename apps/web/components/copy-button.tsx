"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export function CopyButton({ value, label = "Copy", variant = "outline", ariaLabel }: { value: string; label?: string; variant?: "outline" | "ghost"; ariaLabel?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  useEffect(() => {
    if (state === "idle") return;
    const t = setTimeout(() => setState("idle"), 2000);
    return () => clearTimeout(t);
  }, [state]);
  const text = state === "copied" ? "Copied" : state === "failed" ? "Select and copy" : label;
  return (
    <Button
      type="button"
      variant={variant}
      size="sm"
      className="min-h-9"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setState("copied");
        } catch {
          setState("failed");
        }
      }}
      aria-label={ariaLabel && state === "idle" ? ariaLabel : undefined}
    >
      {state === "copied" ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
      <span aria-live="polite">{text}</span>
    </Button>
  );
}
