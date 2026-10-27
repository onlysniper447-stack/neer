import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { chainName } from "./chains.js";
import { REQUIRED_CHECKS, RULES, sendBefore } from "./checks.js";
import { buildContext, findToken, isNative, type Ctx } from "./context.js";
import { DEFAULT_RULES } from "./rules-config.js";
import { verifyQuoteSignature } from "./signature.js";
import { stableStringify } from "./stable-json.js";
import type { CheckResult, PreflightInput, PreflightResult, QuoteSummary, Severity, Verdict } from "./types.js";
import { formatAmount } from "./units.js";

export const VERDICT_LABEL: Record<Verdict, string> = {
  safe: "Safe to send",
  check: "Check this",
  block: "Don't send",
};

export const SAFE_DEFINITION =
  "Safe to send means your transfer matches a quote signed by NEAR Intents. It is a check, not a guarantee.";

const SEVERITY_RANK: Record<Severity, number> = { block: 0, warn: 1, unknown: 2, info: 3, pass: 4 };

/** Fail closed: block if any block; otherwise check if any warn or unknown; otherwise safe. */
export function aggregateVerdict(checks: CheckResult[]): Verdict {
  if (checks.length === 0) return "check";
  if (checks.some((c) => c.severity === "block")) return "block";
  if (checks.some((c) => c.severity === "warn" || c.severity === "unknown")) return "check";
  for (const id of REQUIRED_CHECKS) {
    const found = checks.find((c) => c.id === id);
    if (!found || found.severity !== "pass") return "check";
  }
  return "safe";
}

/** Stable display order: block, warn, unknown, info, pass; ties keep rule order. */
export function sortChecks(checks: CheckResult[]): CheckResult[] {
  const order = new Map(RULES.map((r, i) => [r.id, i]));
  return [...checks].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99),
  );
}

export function checksHash(rulesVersion: string, checks: CheckResult[]): string {
  const material = stableStringify({
    rulesVersion,
    checks: checks.map((c) => ({ id: c.id, severity: c.severity, expected: c.expected ?? null, actual: c.actual ?? null })),
  });
  return bytesToHex(sha256(new TextEncoder().encode(material)));
}

function runRules(ctx: Ctx): CheckResult[] {
  const out: CheckResult[] = [];
  for (const rule of RULES) {
    let res: Omit<CheckResult, "id" | "title"> | null;
    try {
      res = rule.run(ctx);
    } catch (err) {
      // A rule that crashes never passes.
      res = {
        severity: "unknown",
        headline: "Check failed",
        summary: "Couldn't run",
        message: "This check couldn't run, so we can't call this safe.",
        actual: { error: err instanceof Error ? err.message.slice(0, 200) : "error" },
      };
    }
    if (res) out.push({ id: rule.id, title: rule.title, ...res });
  }
  for (const id of REQUIRED_CHECKS) {
    if (!out.some((c) => c.id === id)) {
      out.push({ id, title: id, severity: "unknown", headline: "Check missing", summary: "Didn't run", message: "A required check didn't run, so we can't call this safe." });
    }
  }
  return out;
}

export function summarizeQuote(ctx: Ctx): QuoteSummary {
  const { qr } = ctx;
  const before = sendBefore(ctx);
  const o = ctx.originToken;
  const d = ctx.destToken ?? findToken(ctx.tokens, qr.quoteRequest.destinationAsset);
  return {
    verified: ctx.signatureOk && !qr.quoteRequest.dry,
    correlationId: qr.correlationId ?? ctx.status?.correlationId ?? null,
    status: ctx.status?.status ?? null,
    swapType: qr.quoteRequest.swapType,
    depositType: qr.quoteRequest.depositType,
    depositMode: qr.quoteRequest.depositMode ?? null,
    depositAddress: qr.quote.depositAddress ?? null,
    depositMemo: qr.quote.depositMemo ?? null,
    originAsset: qr.quoteRequest.originAsset,
    originChain: o?.blockchain ?? null,
    originChainName: o ? chainName(o.blockchain) : null,
    originSymbol: o?.symbol ?? null,
    originDecimals: o?.decimals ?? null,
    originNative: o ? isNative(o) : null,
    originContract: o?.contractAddress ?? null,
    destinationAsset: qr.quoteRequest.destinationAsset,
    destinationChain: d?.blockchain ?? null,
    destinationChainName: d ? chainName(d.blockchain) : null,
    destinationSymbol: d?.symbol ?? null,
    amountIn: qr.quote.amountIn,
    amountInFormatted: o ? formatAmount(BigInt(qr.quote.amountIn), o.decimals) : qr.quote.amountInFormatted,
    minAmountIn: qr.quote.minAmountIn,
    minAmountInFormatted: o ? formatAmount(BigInt(qr.quote.minAmountIn), o.decimals) : null,
    amountInUsd: qr.quote.amountInUsd,
    amountOutFormatted: qr.quote.amountOutFormatted,
    refundTo: qr.quoteRequest.refundTo,
    refundType: qr.quoteRequest.refundType,
    recipient: qr.quoteRequest.recipient,
    sendBefore: before ? before.toISOString() : null,
    timeWhenInactive: qr.quote.timeWhenInactive ?? null,
    secondsLeft: before ? Math.floor((before.getTime() - ctx.now.getTime()) / 1000) : null,
    timeEstimate: qr.quote.timeEstimate ?? null,
  };
}

function finish(
  outcome: PreflightResult["outcome"],
  checks: CheckResult[],
  rulesVersion: string,
  now: Date,
  quote: QuoteSummary | null,
  signedQuote: PreflightResult["signedQuote"],
  override?: { verdict: Verdict; headline: string; message: string },
): PreflightResult {
  const sorted = sortChecks(checks);
  const verdict = override?.verdict ?? aggregateVerdict(sorted);
  let headline: string;
  let message: string;
  if (override) {
    headline = override.headline;
    message = override.message;
  } else if (verdict === "safe") {
    headline = "Everything matches the quote.";
    message = SAFE_DEFINITION;
  } else {
    const worst = sorted[0]!;
    headline = worst.headline;
    message = worst.message;
  }
  return {
    outcome,
    verdict,
    label: VERDICT_LABEL[verdict],
    headline,
    message,
    checks: sorted,
    rulesVersion,
    checksHash: checksHash(rulesVersion, sorted),
    serverTime: now.toISOString(),
    quote,
    signedQuote,
  };
}

/**
 * Runs every check for a pasted deposit address and declared transfer.
 * Never returns `safe` unless every required check passed.
 */
export function preflight(input: PreflightInput): PreflightResult {
  const rules = input.rules ?? DEFAULT_RULES;
  const { lookup, now } = input;
  const partnerQuote = input.quote ?? null;

  if (lookup.kind === "not_found" && !partnerQuote) {
    const check: CheckResult = {
      id: "quote",
      title: "Quote",
      severity: "block",
      headline: "We can't find this quote",
      summary: "Not found",
      message: "Don't send yet. Copy the address again, or ask your swap app for a new quote.",
      actual: { address: input.depositAddress, memo: input.depositMemo ?? null },
    };
    return finish("not_found", [check], rules.version, now, null, null);
  }
  if (lookup.kind === "error" && !partnerQuote) {
    const check: CheckResult = {
      id: "quote",
      title: "Quote",
      severity: "unknown",
      headline: "We couldn't finish the checks",
      summary: "NEAR Intents didn't answer",
      message: "NEAR Intents didn't answer. Wait a minute and try again before you send.",
      actual: { reason: lookup.reason },
    };
    return finish("unavailable", [check], rules.version, now, null, null);
  }

  const status = lookup.kind === "found" ? lookup.status : null;
  const qr = status ? status.quoteResponse : partnerQuote!;
  const key = input.quotePublicKey;
  let signatureOk = verifyQuoteSignature(qr, key);
  let partnerQuoteMismatch = false;
  if (partnerQuote && status) {
    const partnerOk = verifyQuoteSignature(partnerQuote, key);
    partnerQuoteMismatch = !partnerOk || partnerQuote.signature !== status.quoteResponse.signature;
    signatureOk = signatureOk && partnerOk;
  }

  const ctx = buildContext({
    pasted: input.depositAddress,
    pastedMemo: input.depositMemo ?? null,
    qr,
    signatureOk,
    partnerQuoteMismatch,
    status,
    fetchedAt: lookup.kind === "found" ? lookup.fetchedAt : null,
    transfer: input.transfer,
    tokens: input.tokens,
    now,
    rules,
  });

  const checks = runRules(ctx);
  const summary = summarizeQuote(ctx);
  return finish("checked", checks, rules.version, now, summary, signatureOk && !qr.quoteRequest.dry ? qr : null);
}
