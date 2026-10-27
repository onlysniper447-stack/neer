import { z } from "zod";

/**
 * zod schemas for the parts of the 1Click API that Neer reads.
 * Checked against https://1click.chaindefuser.com/docs/v0/openapi.yaml and
 * recorded live responses (fixtures/recorded). Live responses send `null` for
 * many optional fields, so optional fields accept null as well.
 * Unknown keys are stripped.
 */

const nstr = z.string().nullish();
/** Integer amount in base units, as 1Click sends it. */
const baseUnits = z.string().regex(/^\d+$/, "expected an integer string in base units");
const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "expected an ISO date");

export const SwapTypeSchema = z.enum(["EXACT_INPUT", "EXACT_OUTPUT", "FLEX_INPUT", "ANY_INPUT"]);
export const DepositTypeSchema = z.enum(["ORIGIN_CHAIN", "INTENTS", "CONFIDENTIAL_INTENTS"]);
export const RefundTypeSchema = z.enum(["ORIGIN_CHAIN", "INTENTS", "CONFIDENTIAL_INTENTS"]);
export const RecipientTypeSchema = z.enum(["DESTINATION_CHAIN", "INTENTS", "CONFIDENTIAL_INTENTS"]);
export const DepositModeSchema = z.enum(["SIMPLE", "MEMO"]);

export const STATUSES = [
  "PENDING_DEPOSIT",
  "KNOWN_DEPOSIT_TX",
  "PROCESSING",
  "SUCCESS",
  "INCOMPLETE_DEPOSIT",
  "REFUNDED",
  "FAILED",
] as const;
export const StatusSchema = z.enum(STATUSES);
export type SwapStatus = z.infer<typeof StatusSchema>;

export const TokenSchema = z.object({
  assetId: z.string().min(1),
  decimals: z.number().int().min(0).max(255),
  // The live list contains blockchains that are not in the OpenAPI enum (for example `abs`, `qtc`),
  // so this is a free string, not an enum.
  blockchain: z.string().min(1),
  symbol: z.string().min(1),
  price: z.number().nullish(),
  priceUpdatedAt: isoDate.nullish(),
  contractAddress: nstr,
});
export type Token = z.infer<typeof TokenSchema>;
export const TokenListSchema = z.array(TokenSchema);

export const QuoteRequestSchema = z.object({
  dry: z.boolean(),
  depositMode: DepositModeSchema.nullish(),
  swapType: SwapTypeSchema,
  slippageTolerance: z.number(),
  originAsset: z.string().min(1),
  depositType: DepositTypeSchema,
  destinationAsset: z.string().min(1),
  amount: baseUnits,
  refundTo: z.string(),
  refundType: RefundTypeSchema,
  recipient: z.string(),
  recipientType: RecipientTypeSchema,
  deadline: isoDate,
  confidentiality: z.enum(["public", "basic", "advanced"]).nullish(),
  quoteWaitingTimeMs: z.number().nullish(),
  referral: nstr,
  virtualChainRecipient: nstr,
  virtualChainRefundRecipient: nstr,
  customRecipientMsg: nstr,
});
export type QuoteRequest = z.infer<typeof QuoteRequestSchema>;

export const QuoteSchema = z.object({
  depositAddress: nstr,
  depositMemo: nstr,
  amountIn: baseUnits,
  amountInFormatted: z.string(),
  amountInUsd: z.string(),
  minAmountIn: baseUnits,
  amountOut: baseUnits,
  amountOutFormatted: z.string(),
  amountOutUsd: z.string(),
  minAmountOut: baseUnits,
  deadline: isoDate.nullish(),
  timeWhenInactive: isoDate.nullish(),
  timeEstimate: z.number().nullish(),
  refundFee: baseUnits.nullish(),
  withdrawFee: baseUnits.nullish(),
  virtualChainRecipient: nstr,
  virtualChainRefundRecipient: nstr,
  customRecipientMsg: nstr,
});
export type Quote = z.infer<typeof QuoteSchema>;

export const QuoteResponseSchema = z.object({
  // Present on POST /v0/quote, absent inside the /v0/status `quoteResponse` (observed live).
  correlationId: z.string().nullish(),
  timestamp: isoDate,
  signature: z.string().min(1),
  quoteRequest: QuoteRequestSchema,
  quote: QuoteSchema,
});
export type QuoteResponse = z.infer<typeof QuoteResponseSchema>;

const TxDetailsSchema = z.object({ hash: z.string(), explorerUrl: z.string().nullish() });

export const SwapDetailsSchema = z.object({
  intentHashes: z.array(z.string()).nullish(),
  nearTxHashes: z.array(z.string()).nullish(),
  amountIn: nstr,
  amountInFormatted: nstr,
  amountInUsd: nstr,
  amountOut: nstr,
  amountOutFormatted: nstr,
  amountOutUsd: nstr,
  slippage: z.number().nullish(),
  originChainTxHashes: z.array(TxDetailsSchema).nullish(),
  destinationChainTxHashes: z.array(TxDetailsSchema).nullish(),
  refundedAmount: nstr,
  refundedAmountFormatted: nstr,
  refundedAmountUsd: nstr,
  refundReason: nstr,
  depositedAmount: nstr,
  depositedAmountFormatted: nstr,
  depositedAmountUsd: nstr,
});
export type SwapDetails = z.infer<typeof SwapDetailsSchema>;

export const StatusResponseSchema = z.object({
  correlationId: z.string().nullish(),
  quoteResponse: QuoteResponseSchema,
  status: StatusSchema,
  updatedAt: isoDate,
  swapDetails: SwapDetailsSchema.nullish(),
});
export type StatusResponse = z.infer<typeof StatusResponseSchema>;

export const ErrorBodySchema = z.object({ message: z.string().optional() });
