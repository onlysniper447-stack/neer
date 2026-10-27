"use client";

import { ClipboardPaste } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MemoSchema, PastedAddressSchema } from "@/lib/inputs";

export function PasteForm({
  initialAddress = "",
  initialMemo = "",
  target = "/check",
  submitLabel = "Check address",
  busyLabel = "Checking…",
}: {
  initialAddress?: string;
  initialMemo?: string;
  /** Page that receives ?address=&memo= */
  target?: "/check" | "/track";
  submitLabel?: string;
  busyLabel?: string;
}) {
  const router = useRouter();
  const [address, setAddress] = useState(initialAddress);
  const [memo, setMemo] = useState(initialMemo);
  const [hasMemo, setHasMemo] = useState(Boolean(initialMemo));
  const [error, setError] = useState<string | null>(null);
  const [pasteNote, setPasteNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const addrId = useId();
  const memoId = useId();
  const errId = useId();

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      setAddress(text.trim());
      setPasteNote(null);
      setError(null);
    } catch {
      setPasteNote("Your browser didn't allow pasting here. Long-press the field and choose Paste.");
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const a = PastedAddressSchema.safeParse(address);
    if (!a.success) {
      setError(a.error.issues[0]?.message ?? "Paste the full deposit address");
      return;
    }
    const m = hasMemo ? MemoSchema.safeParse(memo) : null;
    if (m && !m.success) {
      setError(m.error.issues[0]?.message ?? "Check the memo");
      return;
    }
    setError(null);
    setBusy(true);
    const qs = new URLSearchParams({ address: a.data });
    if (m?.success && m.data) qs.set("memo", m.data);
    router.push(`${target}?${qs.toString()}`);
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor={addrId} className="text-base">
          Deposit address
        </Label>
        <div className="flex gap-2">
          <Input
            id={addrId}
            name="address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="0x…, G…, T…, r…"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className="h-12 font-mono text-base"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errId : undefined}
          />
          <Button type="button" variant="outline" className="h-12 shrink-0" onClick={pasteFromClipboard} aria-label="Paste from clipboard">
            <ClipboardPaste className="size-4" aria-hidden="true" />
            <span className="hidden min-[380px]:inline">Paste</span>
          </Button>
        </div>
        {pasteNote ? (
          <p className="text-sm text-muted" role="status">
            {pasteNote}
          </p>
        ) : null}
      </div>

      {hasMemo ? (
        <div className="space-y-2">
          <Label htmlFor={memoId} className="text-base">
            Memo
          </Label>
          <Input
            id={memoId}
            name="memo"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            className="h-12 font-mono text-base"
          />
          <p className="text-sm text-muted">Some networks, like Stellar, need a memo with the address. Copy it exactly.</p>
        </div>
      ) : (
        <button type="button" className="-my-1 min-h-11 rounded-md text-left font-medium text-brand underline-offset-4 hover:underline" onClick={() => setHasMemo(true)}>
          + This swap has a memo
        </button>
      )}

      {error ? (
        <p id={errId} role="alert" className="rounded-lg border border-stop/40 bg-stop-bg px-3 py-2 text-[15px] text-stop">
          {error}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {busy ? busyLabel : submitLabel}
      </Button>
    </form>
  );
}
