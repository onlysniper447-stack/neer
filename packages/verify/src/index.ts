import { AmountError, DeclaredTransferSchema, StatusResponseSchema, TokenListSchema, parseAmount, preflight, type Lookup, type PreflightInput, type PreflightResult } from "@neer/core";
import { createQuoteFetcher } from "./fetch-quote.js";
import { VerifyInputError, VerifyInputSchema } from "./input.js";
import { projectVerification } from "./projection.js";
import type { QuoteBundle, VerifyDependencies, VerifyInput, VerifyResult } from "./types.js";

export { ACTIONABLE_FINDING_CODES as FINDING_CODES } from "@neer/core";
export { createQuoteFetcher } from "./fetch-quote.js";
export { VerifyInputError, VerifyInputSchema } from "./input.js";
export { VERIFY_VERSION, type FindingCode, type Finding, type QuoteSummary, type VerifyResult, type VerifyInput, type VerifyDependencies, type QuoteBundle, type QuoteLookupRequest } from "./types.js";

/** Internal compatibility path. Preserve the complete legacy result and exact messages. */
export async function verifyLegacyPreflight(input: PreflightInput): Promise<PreflightResult> {
  return preflight(input);
}

function validatedBundle(bundle: QuoteBundle): QuoteBundle {
  const tokens = TokenListSchema.safeParse(bundle.tokens);
  let lookup: Lookup = bundle.lookup;
  if (lookup.kind === "found") {
    const status = StatusResponseSchema.safeParse(lookup.status);
    lookup = status.success && lookup.fetchedAt instanceof Date && Number.isFinite(lookup.fetchedAt.getTime())
      ? { kind: "found", status: status.data, fetchedAt: lookup.fetchedAt }
      : { kind: "error", reason: "invalid_response" };
  }
  if (!["found", "not_found", "error"].includes(lookup.kind)) lookup = { kind: "error", reason: "invalid_response" };
  return { lookup, tokens: tokens.success ? tokens.data : [] };
}

/** Node22.12+ async facade. Unknown checks remain warnings; unavailable quotes block. */
export async function verifyDepositWithLegacy(input: VerifyInput, deps: VerifyDependencies = {}): Promise<PreflightResult> {
  const parsed = VerifyInputSchema.safeParse(input);
  if (!parsed.success) throw new VerifyInputError(parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.code === "unrecognized_keys" ? "Unsupported fields are not accepted." : i.message })));
  const data = parsed.data;
  const lookupMemo = data.lookupMemo === undefined ? data.memo ?? null : data.lookupMemo;
  let bundle: QuoteBundle;
  try {
    bundle = validatedBundle(await (deps.fetchQuote ?? createQuoteFetcher())({ depositAddress: data.depositAddress, lookupMemo }));
  } catch {
    bundle = { lookup: { kind: "error", reason: "network" }, tokens: [] };
  }
  const now = deps.now?.() ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid verification clock");
  const token = bundle.tokens.find((t) => t.assetId === data.token);
  let amount: string | undefined;
  if (token) {
    try { amount = parseAmount(data.amount, token.decimals).toString(); }
    catch (err) { throw new VerifyInputError([{ path: "amount", message: err instanceof AmountError ? err.message : "Enter an amount like 0.17" }]); }
  }
  const transfer = DeclaredTransferSchema.safeParse({
    ...data.transfer,
    chain: data.network,
    asset: data.token,
    amount,
    source: data.source,
    ...(data.memo === undefined ? {} : { memo: data.memo }),
    ...(data.expectedRecipient === undefined ? {} : { expectedRecipient: data.expectedRecipient }),
    ...(data.expectedDestinationChain === undefined ? {} : { expectedDestinationChain: data.expectedDestinationChain }),
  });
  if (!transfer.success) throw new VerifyInputError(transfer.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  const result = await verifyLegacyPreflight({
    depositAddress: data.depositAddress,
    depositMemo: lookupMemo,
    lookup: bundle.lookup,
    tokens: bundle.tokens,
    now,
    rules: deps.rules,
    quotePublicKey: deps.quotePublicKey,
    transfer: transfer.data,
  });
  return result;
}

/** Public projection stays separate from the complete internal UI result. */
export async function verifyDeposit(input: VerifyInput, deps: VerifyDependencies = {}): Promise<VerifyResult> {
  return projectVerification(await verifyDepositWithLegacy(input, deps));
}
