import { z } from "zod";
import type { QuoteResponse, StatusResponse, Token } from "./schemas.js";
import type { RulesConfig } from "./rules-config.js";

export type Severity = "pass" | "info" | "warn" | "block" | "unknown";
export type Verdict = "safe" | "check" | "block";

export const CHECK_IDS = [
  "signature",
  "used",
  "time",
  "lookalike",
  "network",
  "format",
  "token",
  "memo",
  "amount",
  "minimum",
  "xrp",
  "refund",
  "approval",
  "confidential",
  "exchange",
  "stale",
  "incident",
] as const;
export type CheckId = (typeof CHECK_IDS)[number] | "quote";

export type FixAction =
  | { kind: "switch-network"; chain: string; label: string }
  | { kind: "edit-send"; label: string }
  | { kind: "new-quote"; label: string };

export type Facts = Record<string, string | number | boolean | null>;

export interface CheckResult {
  id: CheckId;
  severity: Severity;
  /** Check name for the list, e.g. "Network". */
  title: string;
  /** Short verdict-card headline, e.g. "Wrong network". */
  headline: string;
  /** Short value for the right side of a check row, e.g. "Base, not Ethereum". */
  summary: string;
  /** Plain-English sentence(s) from the microcopy library. */
  message: string;
  expected?: Facts;
  actual?: Facts;
  action?: FixAction;
}

const hex = z.string().regex(/^0x[0-9a-fA-F]*$/, "expected 0x-prefixed hex");
const baseUnits = z.string().regex(/^\d+$/, "expected an integer string in base units");

/** A draft EVM transaction, as a wallet would show it before signing. Optional. */
export const DraftTxSchema = z.object({
  to: z.string().min(1).max(128),
  data: hex.max(20_000).optional(),
  value: baseUnits.optional(),
  chainId: z.number().int().positive().optional(),
});
export type DraftTx = z.infer<typeof DraftTxSchema>;

/** What the user says they are about to send. Every field is optional except `source`. */
export const DeclaredTransferSchema = z.object({
  chain: z.string().min(1).max(32).optional(),
  chainId: z.number().int().positive().optional(),
  from: z.string().min(1).max(128).optional(),
  /** Address the user will send to (from their wallet's send screen), if different from the pasted one. */
  to: z.string().min(1).max(128).optional(),
  /** "native", a token contract address, or a 1Click assetId. */
  asset: z.string().min(1).max(256).optional(),
  /** Amount in base units of the asset. */
  amount: baseUnits.optional(),
  /** Memo the user will attach. `undefined` means "same as the pasted memo". */
  memo: z.string().max(128).nullable().optional(),
  source: z.enum(["wallet", "exchange", "unknown"]).default("unknown"),
  tx: DraftTxSchema.optional(),
});
export type DeclaredTransferInput = z.input<typeof DeclaredTransferSchema>;
export type DeclaredTransfer = z.output<typeof DeclaredTransferSchema>;

export type LookupErrorReason = "timeout" | "network" | "bad_status" | "invalid_response" | "rate_limited";

export type Lookup =
  | { kind: "found"; status: StatusResponse; fetchedAt: Date }
  | { kind: "not_found" }
  | { kind: "error"; reason: LookupErrorReason; detail?: string };

export interface PreflightInput {
  /** The deposit address exactly as the user pasted it. */
  depositAddress: string;
  depositMemo?: string | null;
  lookup: Lookup;
  /** Optional full signed quote passed by a partner app. */
  quote?: QuoteResponse | null;
  transfer: DeclaredTransfer;
  /** /v0/tokens. May be empty if it could not be fetched; dependent checks then fail closed. */
  tokens: Token[];
  now: Date;
  rules?: RulesConfig;
  /** Override of the 1Click signing key. Only for tests with locally signed fixtures. */
  quotePublicKey?: string;
}

export interface QuoteSummary {
  verified: boolean;
  correlationId: string | null;
  status: string | null;
  swapType: string;
  depositType: string;
  depositMode: string | null;
  depositAddress: string | null;
  depositMemo: string | null;
  originAsset: string;
  originChain: string | null;
  originChainName: string | null;
  originSymbol: string | null;
  originDecimals: number | null;
  originNative: boolean | null;
  originContract: string | null;
  destinationAsset: string;
  destinationChain: string | null;
  destinationChainName: string | null;
  destinationSymbol: string | null;
  amountIn: string;
  amountInFormatted: string;
  minAmountIn: string;
  minAmountInFormatted: string | null;
  amountInUsd: string;
  amountOutFormatted: string;
  refundTo: string;
  refundType: string;
  recipient: string;
  sendBefore: string | null;
  timeWhenInactive: string | null;
  secondsLeft: number | null;
  timeEstimate: number | null;
}

export type PreflightOutcome = "checked" | "not_found" | "unavailable";

export interface PreflightResult {
  outcome: PreflightOutcome;
  verdict: Verdict;
  label: string;
  headline: string;
  message: string;
  checks: CheckResult[];
  rulesVersion: string;
  checksHash: string;
  serverTime: string;
  quote: QuoteSummary | null;
  /** The verified quote, so a client can save it as a receipt. Null when unverified or missing. */
  signedQuote: QuoteResponse | null;
}
