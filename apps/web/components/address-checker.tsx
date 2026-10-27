"use client";

import { CircleAlert, CircleCheck, CircleX, Info } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { analyzeAddress, compareAddresses, diffMask, type AddressAnalysis, type ChecksumState, type Comparison, type FamilyMatch } from "@/lib/address-check";
import { cn } from "@/lib/utils";
import { AddressText } from "./address-chip";
import { CopyButton } from "./copy-button";

const CHECKSUM_STYLE: Record<ChecksumState, { Icon: typeof CircleCheck; cls: string; word: string }> = {
  ok: { Icon: CircleCheck, cls: "text-safe", word: "Checksum OK" },
  none: { Icon: Info, cls: "text-check", word: "No checksum" },
  bad: { Icon: CircleX, cls: "text-stop", word: "Bad checksum" },
};

function MatchCard({ m }: { m: FamilyMatch }) {
  const normalized = m.validation.normalized ?? "";
  const cs = CHECKSUM_STYLE[m.checksum.state];
  const shown = m.networks.slice(0, 8);
  return (
    <li className="rounded-2xl border border-line p-5 sm:p-6" data-testid={`match-${m.family}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-lg font-semibold">
          <CircleCheck className="size-5 text-safe" aria-hidden="true" />
          Valid {m.label} address
        </h3>
        <span className={cn("inline-flex items-center gap-1.5 text-sm font-medium", cs.cls)}>
          <cs.Icon className="size-4" aria-hidden="true" /> {cs.word}
        </span>
      </div>
      <p className="mt-2 text-[15px] text-muted">{m.checksum.text}</p>
      <div className="mt-4 rounded-xl bg-surface p-4">
        <div className="mb-1 flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-muted">Canonical form</p>
          <CopyButton value={normalized} ariaLabel={`Copy canonical ${m.label} address`} />
        </div>
        <AddressText address={normalized} className="text-base" testId="normalized" />
      </div>
      <p className="mt-4 text-sm text-muted">
        <span className="font-medium text-ink">{m.networks.length > 1 ? "Same format on: " : "Network: "}</span>
        {shown.join(", ")}
        {m.networks.length > shown.length ? ` and ${m.networks.length - shown.length} more` : ""}.
        {m.family === "evm" && m.networks.length > 1 ? " The address alone can't tell which of these networks a deposit is for, so always pick the network yourself." : ""}
        {m.family === "near" && /^0x/i.test(normalized) ? " NEAR accepts 0x addresses as account IDs (ETH-implicit accounts)." : ""}
      </p>
    </li>
  );
}

function CompareResult({ c, a, b, caseInsensitive }: { c: Comparison; a: string; b: string; caseInsensitive: boolean }) {
  const mask = diffMask(a, b, caseInsensitive);
  const style =
    c.kind === "same"
      ? { box: "border-safe/50 bg-safe-bg", Icon: CircleCheck, cls: "text-safe", title: "Same address", text: c.caseOnly ? "Only the letter case differs, which doesn't change an EVM address." : "Every character matches." }
      : c.kind === "lookalike"
        ? {
            box: "border-stop/50 bg-stop-bg",
            Icon: CircleX,
            cls: "text-stop",
            title: "Lookalike address",
            text: "The first and last characters match but the middle doesn't. This is how address poisoning works. Don't use the second address.",
          }
        : { box: "border-check/50 bg-check-bg", Icon: CircleAlert, cls: "text-check", title: "Different addresses", text: "These are two different addresses." };
  return (
    <section role="status" className={cn("rounded-2xl border p-5 sm:p-6", style.box)} data-testid="compare-result" data-kind={c.kind}>
      <h3 className={cn("flex items-center gap-2 text-lg font-semibold", style.cls)}>
        <style.Icon className="size-5" aria-hidden="true" /> {style.title}
      </h3>
      <p className="mt-1 text-ink">{style.text}</p>
      {c.kind !== "same" ? (
        <div className="mt-4 space-y-2 font-mono text-[15px] leading-7 break-all">
          <p>
            <span className="mr-2 font-sans text-sm text-muted">First</span>
            {a}
          </p>
          <p>
            <span className="mr-2 font-sans text-sm text-muted">Second</span>
            {Array.from(b, (ch, i) =>
              mask[i] ? (
                <mark key={i} className="rounded-[2px] bg-stop px-px text-bg">
                  {ch}
                </mark>
              ) : (
                <span key={i}>{ch}</span>
              ),
            )}
          </p>
          <p className="font-sans text-sm text-muted">Characters that differ in the second address are highlighted.</p>
        </div>
      ) : null}
    </section>
  );
}

export function AddressChecker({ networks }: { networks: { id: string; name: string }[] }) {
  const [address, setAddress] = useState("");
  const [other, setOther] = useState("");
  const [chain, setChain] = useState("");
  const [result, setResult] = useState<{ analysis: AddressAnalysis; other: string } | null>(null);
  const ids = { address: useId(), other: useId(), chain: useId(), err: useId() };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setResult({ analysis: analyzeAddress(address, chain || null), other: other.trim() });
  }

  const a = result?.analysis;
  const firstMatch = a?.kind === "valid" ? a.matches[0] : undefined;
  const otherAnalysis = result?.other && firstMatch ? analyzeAddress(result.other, firstMatch.chain) : null;

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:gap-12">
      <form onSubmit={submit} noValidate className="space-y-5 rounded-2xl border border-line p-5 sm:p-7 lg:sticky lg:top-24" aria-label="Check an address">
        <div className="space-y-2">
          <Label htmlFor={ids.address} className="text-base font-semibold">
            Address
          </Label>
          <Input
            id={ids.address}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="0x…, T…, G…, bc1…"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className="h-12 font-mono text-base"
            aria-invalid={a?.kind === "input-error" ? true : undefined}
            aria-describedby={a?.kind === "input-error" ? ids.err : undefined}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={ids.chain} className="text-base font-semibold">
            Network
          </Label>
          <select
            id={ids.chain}
            value={chain}
            onChange={(e) => setChain(e.target.value)}
            className="h-12 w-full rounded-md border border-input bg-bg px-3 text-base text-ink focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <option value="">Detect from the address</option>
            {networks.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={ids.other} className="text-base font-semibold">
            Compare with <span className="font-normal text-muted">(optional)</span>
          </Label>
          <Input
            id={ids.other}
            value={other}
            onChange={(e) => setOther(e.target.value)}
            placeholder="Paste a second address"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className="h-12 font-mono text-base"
          />
          <p className="text-sm text-muted">For example the address on your wallet&apos;s confirm screen, to catch clipboard swaps and lookalikes.</p>
        </div>
        <Button type="submit" size="lg" className="w-full">
          Check address
        </Button>
        <p className="text-sm text-muted">Runs in your browser. The address isn&apos;t sent anywhere.</p>
      </form>

      <div className="min-w-0 space-y-4" aria-live="polite" data-testid="address-result">
        {!a ? (
          <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-line p-8 text-center">
            <p className="font-medium">Results appear here</p>
            <p className="mt-1 max-w-sm text-sm text-muted">Paste an address and choose Check address. Leave the network on Detect to see every network it&apos;s valid on.</p>
          </div>
        ) : a.kind === "input-error" ? (
          <section id={ids.err} role="alert" className="rounded-2xl border border-stop/50 bg-stop-bg p-5 sm:p-6" data-testid="address-invalid">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-stop">
              <CircleX className="size-5" aria-hidden="true" /> Not an address
            </h2>
            <p className="mt-1 text-ink">{a.message}</p>
          </section>
        ) : a.kind === "invalid" ? (
          <section className="rounded-2xl border border-stop/50 bg-stop-bg p-5 sm:p-6" data-testid="address-invalid">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-stop">
              <CircleX className="size-5" aria-hidden="true" /> {a.chosen ? `Not a valid ${a.chosen} address` : "Not valid on any network Neer checks"}
            </h2>
            {a.reasons.length > 0 ? (
              <ul className="mt-2 space-y-1 text-ink">
                {a.reasons.map((r) => (
                  <li key={r.label}>
                    <span className="font-medium">{r.label}:</span> {r.reason}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-ink">Check that you copied the whole address from the right place.</p>
            )}
            <div className="mt-4 rounded-xl bg-bg/70 p-4">
              <p className="mb-1 text-sm font-medium text-muted">You pasted</p>
              <AddressText address={a.input} />
            </div>
          </section>
        ) : (
          <>
            <h2 className="text-lg font-semibold">
              {a.matches.length === 1 ? "Valid on 1 address format" : `Valid on ${a.matches.length} address formats`}
            </h2>
            <ul className="space-y-4">
              {a.matches.map((m) => (
                <MatchCard key={m.family} m={m} />
              ))}
            </ul>
            {result?.other && firstMatch ? (
              otherAnalysis?.kind === "input-error" ? (
                <section role="alert" className="rounded-2xl border border-stop/50 bg-stop-bg p-5" data-testid="compare-result" data-kind="input-error">
                  <h3 className="text-lg font-semibold text-stop">The second address isn&apos;t an address</h3>
                  <p className="mt-1 text-ink">{otherAnalysis.message}</p>
                </section>
              ) : (
                <CompareResult
                  c={compareAddresses(firstMatch.chain, a.input, result.other)}
                  a={a.input}
                  b={result.other}
                  caseInsensitive={firstMatch.family === "evm"}
                />
              )
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
