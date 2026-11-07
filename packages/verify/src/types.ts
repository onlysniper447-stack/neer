import type { Lookup, RulesConfig, Token, ActionableFindingCode } from "@neer/core";
import type { z } from "zod";
import type { VerifyInputSchema } from "./input.js";

export const VERIFY_VERSION = "1.0.0";
export type FindingCode = ActionableFindingCode;
export interface Finding {
  code: FindingCode;
  severity: "block" | "warn";
  message: string;
  fix: string;
}
/** Deliberate allowlist: no address/memo/refund/recipient, raw quote or check facts. */
export interface QuoteSummary {
  verified: true;
  network: string | null;
  token: string;
  amount: string | null;
  minimumAmount: string | null;
  expiresAt: string | null;
  swapType: string;
}
export interface VerifyResult {
  status: "pass" | "warn" | "block";
  findings: Finding[];
  quote: QuoteSummary | null;
  checkedAt: string;
  version: string;
}
export type VerifyInput = z.input<typeof VerifyInputSchema>;
export interface QuoteLookupRequest { depositAddress: string; lookupMemo: string | null }
export interface QuoteBundle { lookup: Lookup; tokens: Token[] }
export interface VerifyDependencies {
  fetchQuote?: (request: QuoteLookupRequest) => Promise<QuoteBundle>;
  now?: () => Date;
  rules?: RulesConfig;
  /** Trusted caller/test dependency only; never an API input. */
  quotePublicKey?: string;
}
