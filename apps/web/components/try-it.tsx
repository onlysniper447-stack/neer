"use client";

import { Loader2, Play } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Res = { status: number; ms: number; requestId: string | null; body: string } | { error: string };

async function call(input: RequestInfo, init?: RequestInit): Promise<Res> {
  const t0 = performance.now();
  try {
    const r = await fetch(input, { ...init, cache: "no-store" });
    const text = await r.text();
    let body = text;
    try {
      body = JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      // not JSON; show as is
    }
    return { status: r.status, ms: Math.round(performance.now() - t0), requestId: r.headers.get("x-request-id"), body };
  } catch {
    return { error: "The request didn't reach Neer. Check your connection and try again." };
  }
}

function Output({ res, testId }: { res: Res | null; testId: string }) {
  if (!res) return null;
  if ("error" in res)
    return (
      <p role="alert" className="rounded-xl border border-check/50 bg-check-bg p-3 text-ink" data-testid={testId}>
        {res.error}
      </p>
    );
  const ok = res.status >= 200 && res.status < 300;
  return (
    <div className="overflow-hidden rounded-xl border border-line" data-testid={testId} data-status={res.status}>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-surface px-4 py-2 text-sm" role="status">
        <span className={cn("font-mono font-semibold", ok ? "text-safe" : res.status >= 500 || res.status === 429 ? "text-check" : "text-stop")}>HTTP {res.status}</span>
        <span className="tabular text-muted">{res.ms} ms</span>
        {res.requestId ? <span className="font-mono text-xs text-muted">{res.requestId}</span> : null}
      </p>
      <pre className="max-h-96 overflow-auto p-4 font-mono text-[13px] leading-6" tabIndex={0}>
        <code>{res.body}</code>
      </pre>
    </div>
  );
}

/** Calls this deployment's real API from the browser (same origin, counts toward your rate limit). */
export function TryPreflight({ initialBody }: { initialBody: string }) {
  const [body, setBody] = useState(initialBody);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Res | null>(null);
  const id = useId();
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setRes(await call("/api/v1/preflight", { method: "POST", headers: { "content-type": "application/json" }, body }));
        setBusy(false);
      }}
    >
      <Label htmlFor={id} className="text-base font-semibold">
        Request body
      </Label>
      <textarea
        id={id}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={9}
        spellCheck={false}
        className="w-full rounded-xl border border-input bg-bg p-4 font-mono text-[13px] leading-6 text-ink focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      />
      <Button type="submit" disabled={busy}>
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
        Send POST /api/v1/preflight
      </Button>
      <Output res={res} testId="try-preflight-result" />
    </form>
  );
}

export function TryTrack({ initialAddress }: { initialAddress: string }) {
  const [address, setAddress] = useState(initialAddress);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Res | null>(null);
  const id = useId();
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setRes(await call(`/api/v1/track?${new URLSearchParams({ address: address.trim() }).toString()}`));
        setBusy(false);
      }}
    >
      <Label htmlFor={id} className="text-base font-semibold">
        Deposit address
      </Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input id={id} value={address} onChange={(e) => setAddress(e.target.value)} spellCheck={false} autoComplete="off" className="h-11 font-mono text-[15px]" />
        <Button type="submit" disabled={busy} className="shrink-0">
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
          Send GET /api/v1/track
        </Button>
      </div>
      <Output res={res} testId="try-track-result" />
    </form>
  );
}
