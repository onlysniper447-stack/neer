import { chainName } from "./chains.js";
import type { QuoteResponse, StatusResponse, SwapStatus, Token } from "./schemas.js";
import { findToken } from "./context.js";

export const TERMINAL_STATUSES: readonly SwapStatus[] = ["SUCCESS", "REFUNDED", "FAILED"];

export function isTerminal(s: SwapStatus): boolean {
  return TERMINAL_STATUSES.includes(s);
}

export type StepState = "done" | "current" | "upcoming" | "skipped";

export interface TimelineStep {
  key: "deposit" | "seen" | "swapping" | "outcome";
  title: string;
  state: StepState;
  tone: "neutral" | "safe" | "check" | "stop";
}

export interface StatusView {
  status: SwapStatus;
  label: string;
  message: string;
  tone: "neutral" | "safe" | "check" | "stop";
  terminal: boolean;
  timeline: TimelineStep[];
}

interface Copy {
  label: string;
  message: (x: { amount: string; chain: string; dest: string; recipient: string; refundTo: string; origin: string; estimate: string }) => string;
  tone: StatusView["tone"];
}

/** Status microcopy from the spec. */
const COPY: Record<SwapStatus, Copy> = {
  PENDING_DEPOSIT: { label: "Waiting for your deposit", message: () => "NEAR Intents reports no deposit yet. Run preflight before deciding whether to send.", tone: "neutral" },
  KNOWN_DEPOSIT_TX: { label: "We see your deposit", message: () => "NEAR Intents has detected a deposit transaction. Do not send another deposit while its status is being checked.", tone: "neutral" },
  PROCESSING: { label: "Swapping now", message: (x) => x.estimate ? `NEAR Intents reports processing. The quote estimates ${x.estimate}.` : "NEAR Intents reports processing. No completion estimate is available.", tone: "neutral" },
  SUCCESS: { label: "Done", message: (x) => `NEAR Intents reports ${x.dest} delivered to ${x.recipient}. Verify the transaction in the destination explorer.`, tone: "safe" },
  INCOMPLETE_DEPOSIT: { label: "Less arrived than needed", message: () => "NEAR Intents reports less than required. Do not top up this address; check its refund status or contact your swap app.", tone: "check" },
  REFUNDED: { label: "Refunded", message: (x) => `NEAR Intents reports a ${x.origin} refund to ${x.refundTo}. Check the transaction details; a refund fee may apply.`, tone: "check" },
  FAILED: { label: "The swap didn't complete", message: () => "Contact your swap app's support with the correlation ID below. Real support never DMs you first and never asks for your seed phrase.", tone: "stop" },
};

function steps(status: SwapStatus): TimelineStep[] {
  const order: SwapStatus[] = ["PENDING_DEPOSIT", "KNOWN_DEPOSIT_TX", "PROCESSING"];
  const idx = order.indexOf(status);
  const at = (i: number): StepState => {
    if (idx === -1) return "done";
    return i < idx ? "done" : i === idx ? "current" : "upcoming";
  };
  const base: TimelineStep[] = [
    { key: "deposit", title: "Waiting for your deposit", state: at(0), tone: "neutral" },
    { key: "seen", title: "We see your deposit", state: at(1), tone: "neutral" },
    { key: "swapping", title: "Swapping", state: at(2), tone: "neutral" },
  ];
  if (status === "INCOMPLETE_DEPOSIT") {
    base[0] = { ...base[0]!, state: "done" };
    base[1] = { key: "seen", title: "Less arrived than needed", state: "current", tone: "check" };
    base[2] = { ...base[2]!, state: "skipped" };
    return [...base, { key: "outcome", title: "Refund status", state: "upcoming", tone: "check" }];
  }
  if (status === "REFUNDED" || status === "FAILED") {
    return [...base.map((s) => ({ ...s, state: status === "FAILED" || s.key === "swapping" ? "skipped" as const : "done" as const })), { key: "outcome", title: COPY[status].label, state: "done", tone: COPY[status].tone }];
  }
  if (status === "SUCCESS") {
    return [...base.map((s) => ({ ...s, state: "done" as const })), { key: "outcome", title: "Delivered", state: "done", tone: "safe" }];
  }
  return [...base, { key: "outcome", title: "Delivered", state: "upcoming", tone: "neutral" }];
}

/** Earlier quote deadline from the status response; invalid dates never imply an open window. */
export function quoteSendBefore(qr: QuoteResponse): string | null {
  const times = [qr.quoteRequest.deadline, qr.quote.deadline].filter((x): x is string => !!x).map(Date.parse);
  if (times.length === 0 || times.some((x) => !Number.isFinite(x))) return null;
  return new Date(Math.min(...times)).toISOString();
}

/** A tracker is not a preflight verdict, including when the deposit window is open. */
export function describePendingDeposit(sendBefore: string | null, now: Date): Pick<StatusView, "label" | "message" | "tone"> {
  const end = sendBefore ? Date.parse(sendBefore) : NaN;
  if (!Number.isFinite(end) || !Number.isFinite(now.getTime())) {
    return { label: "Deposit deadline unknown", message: "The deposit deadline could not be confirmed. Do not send; request a new quote from your swap app.", tone: "check" };
  }
  if (end <= now.getTime()) {
    return { label: "Quote expired", message: "The deposit deadline has passed. Do not send another deposit. If you already sent, keep tracking or contact your swap app.", tone: "stop" };
  }
  return { label: COPY.PENDING_DEPOSIT.label, message: "NEAR Intents reports no deposit yet. Run preflight before deciding whether to send.", tone: "neutral" };
}

export function describeStatus(res: StatusResponse, tokens: Token[], now: Date = new Date()): StatusView {
  const req = res.quoteResponse.quoteRequest;
  const origin = findToken(tokens, req.originAsset);
  const dest = findToken(tokens, req.destinationAsset);
  const amount = `${res.quoteResponse.quote.amountInFormatted} ${origin?.symbol ?? ""}`.trim();
  const c = COPY[res.status];
  const pending = res.status === "PENDING_DEPOSIT" ? describePendingDeposit(quoteSendBefore(res.quoteResponse), now) : null;
  const timeline = steps(res.status);
  if (pending && pending.tone !== "neutral") timeline[0] = { ...timeline[0]!, title: pending.label, tone: pending.tone };
  return {
    status: res.status,
    label: pending?.label ?? (res.status === "SUCCESS" ? "NEAR Intents reports completion" : c.label),
    message: pending?.message ?? c.message({
      amount,
      chain: origin ? chainName(origin.blockchain) : "the quoted network",
      dest: dest?.symbol ?? "tokens",
      recipient: req.recipient,
      refundTo: req.refundTo,
      origin: origin?.symbol ?? "deposit",
      estimate: estimateText(res.quoteResponse.quote.timeEstimate),
    }),
    tone: pending?.tone ?? c.tone,
    terminal: isTerminal(res.status),
    timeline,
  };
}

function estimateText(sec: number | null | undefined): string {
  if (!sec || sec <= 0) return "";
  if (sec < 90) return `about ${Math.round(sec)} seconds`;
  return `about ${Math.round(sec / 60)} minutes`;
}

/** Label and tone for each 1Click status, for docs and guides (same copy the tracker shows). */
export const STATUS_LABELS: Record<SwapStatus, { label: string; tone: StatusView["tone"]; terminal: boolean }> = Object.fromEntries(
  (Object.keys(COPY) as SwapStatus[]).map((s) => [s, { label: COPY[s].label, tone: COPY[s].tone, terminal: isTerminal(s) }]),
) as Record<SwapStatus, { label: string; tone: StatusView["tone"]; terminal: boolean }>;
