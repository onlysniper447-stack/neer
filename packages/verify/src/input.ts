import { z } from "zod";

const memo = z.string().max(128).regex(/^[\x21-\x7e]*$/, "Use a printable memo without spaces").nullable();
/** Public human-unit contract; unknown keys (including deferred quoteId) are rejected. */
export const VerifyInputSchema = z.object({
  depositAddress: z.string().trim().min(3).max(128).regex(/^[A-Za-z0-9:_\-.+/=]+$/, "Use the deposit address, not a link").refine((value) => !value.includes("://"), "Use the deposit address, not a link"),
  network: z.string().regex(/^[a-z][a-z0-9_-]{0,31}$/, "Use a canonical network ID"),
  token: z.string().max(256).regex(/^(nep141|nep245|1cs_v1):[^\s]+$/, "Use the canonical token assetId"),
  amount: z.string().trim().min(1).max(256).refine((v) => /^(?:\d{1,3}(?:,\d{3})+|\d*)(?:\.\d*)?$/.test(v) && /\d/.test(v), "Enter a human-readable decimal amount"),
  memo: memo.optional(),
  lookupMemo: memo.optional(),
  source: z.enum(["wallet", "exchange", "unknown"]).default("unknown"),
  transfer: z.object({
    chainId: z.number().int().positive().optional(),
    from: z.string().min(1).max(128).optional(),
    to: z.string().min(1).max(128).optional(),
  }).strict().optional(),
}).strict();

export class VerifyInputError extends Error {
  readonly issues: { path: string; message: string }[];
  constructor(issues: { path: string; message: string }[]) {
    super("Verification input is not valid.");
    this.name = "VerifyInputError";
    this.issues = issues.slice(0, 20);
  }
}
