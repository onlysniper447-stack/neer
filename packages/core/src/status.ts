import { chainName } from "./chains.js";
import type { StatusResponse, SwapStatus, Token } from "./schemas.js";
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
  PENDING_DEPOSIT: { label: "Waiting for your deposit", message: (x) => `Send ${x.amount} on ${x.chain} to this address before the deadline.`, tone: "neutral" },
  KNOWN_DEPOSIT_TX: { label: "We see your deposit", message: () => "Your transaction is on its way. You don't need to do anything.", tone: "neutral" },
  PROCESSING: { label: "Swapping now", message: (x) => `This usually takes ${x.estimate}.`, tone: "neutral" },
  SUCCESS: { label: "Done", message: (x) => `Your ${x.dest} has arrived. Delivered to ${x.recipient}.`, tone: "safe" },
  INCOMPLETE_DEPOSIT: { label: "Less arrived than needed", message: () => "We received less than this swap needs. It will be refunded to your refund address after the deadline.", tone: "check" },
  REFUNDED: { label: "Refunded", message: (x) => `Your ${x.origin} went back to ${x.refundTo}. A small refund fee may apply.`, tone: "check" },
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
    return [...base, { key: "outcome", title: "Refund after the deadline", state: "upcoming", tone: "check" }];
  }
  if (status === "REFUNDED" || status === "FAILED") {
    return [...base.map((s) => ({ ...s, state: "done" as const })), { key: "outcome", title: COPY[status].label, state: "done", tone: COPY[status].tone }];
  }
  if (status === "SUCCESS") {
    return [...base.map((s) => ({ ...s, state: "done" as const })), { key: "outcome", title: "Delivered", state: "done", tone: "safe" }];
  }
  return [...base, { key: "outcome", title: "Delivered", state: "upcoming", tone: "neutral" }];
}

export function describeStatus(res: StatusResponse, tokens: Token[]): StatusView {
  const req = res.quoteResponse.quoteRequest;
  const origin = findToken(tokens, req.originAsset);
  const dest = findToken(tokens, req.destinationAsset);
  const amount = `${res.quoteResponse.quote.amountInFormatted} ${origin?.symbol ?? ""}`.trim();
  const c = COPY[res.status];
  return {
    status: res.status,
    label: res.status === "SUCCESS" && dest ? `Done. Your ${dest.symbol} has arrived` : c.label,
    message: c.message({
      amount,
      chain: origin ? chainName(origin.blockchain) : "the quoted network",
      dest: dest?.symbol ?? "tokens",
      recipient: req.recipient,
      refundTo: req.refundTo,
      origin: origin?.symbol ?? "deposit",
      estimate: estimateText(res.quoteResponse.quote.timeEstimate),
    }),
    tone: c.tone,
    terminal: isTerminal(res.status),
    timeline: steps(res.status),
  };
}

function estimateText(sec: number | null | undefined): string {
  if (!sec || sec <= 0) return "a few minutes";
  if (sec < 90) return `about ${Math.round(sec)} seconds`;
  return `about ${Math.round(sec / 60)} minutes`;
}
