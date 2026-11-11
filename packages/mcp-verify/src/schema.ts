import { z } from "zod";
// Bundle only these canonical, pure definitions; no unpublished workspace runtime dependency.
import { VerifyInputSchema } from "../../verify/src/input.js";
import { VERIFY_VERSION } from "../../verify/src/types.js";
import { ACTIONABLE_FINDING_CODES } from "../../core/src/codes.js";

const fields=VerifyInputSchema.shape;
const context=fields.transfer.unwrap();
export const ToolInputSchema=VerifyInputSchema.extend({
 depositAddress:fields.depositAddress.describe("Deposit address from the quote, not a URL. Never include a private key or seed phrase."),
 network:fields.network.describe("Canonical selected sending network ID, such as eth. This is compared with the quote origin network."),
 token:fields.token.describe("Canonical catalog assetId, such as nep141:fake-usdc.omft.near; not a symbol or contract shorthand."),
 amount:fields.amount.describe("Human-readable decimal amount, not base units. Token decimals are resolved by the API."),
 memo:fields.memo.describe("Optional declared sending memo; null means no send memo. Omission inherits lookup context."),
 lookupMemo:fields.lookupMemo.describe("Optional separate quote lookup memo. Defaults to memo or null; never sent as a URL by this adapter."),
 expectedRecipient:fields.expectedRecipient.describe("Optional but needed for a pass: the user's own receiving address where the swapped funds should arrive. Compared with the quote's recipient. Not the deposit address."),
 expectedDestinationChain:fields.expectedDestinationChain.describe("Optional canonical network ID where the user expects to receive, such as arb. Omit to use the quote's destination network."),
 source:fields.source.describe("wallet, exchange or unknown. Omission stays unknown and warns rather than assuming a wallet."),
 transfer:context.extend({
  chainId:context.shape.chainId.describe("Optional positive safe-integer EVM chain ID on the declared sending screen."),
  from:context.shape.from.describe("Optional declared sender address; not proof of ownership."),
  to:context.shape.to.describe("Optional declared destination address to compare with the quoted deposit address."),
 }).optional().describe("Optional sending context only. No wallet operation or unsigned/signed transaction is accepted."),
});
const FindingSchema=z.object({code:z.enum(ACTIONABLE_FINDING_CODES),severity:z.enum(["block","warn"]),message:z.string().max(8192),fix:z.string().max(8192)}).strict();
const QuoteSchema=z.object({verified:z.literal(true),network:z.string().nullable(),token:z.string(),amount:z.string().nullable(),minimumAmount:z.string().nullable(),expiresAt:z.iso.datetime().nullable(),swapType:z.string()}).strict();
export const ResultSchema=z.object({
 status:z.enum(["pass","warn","block"]),findings:z.array(FindingSchema).max(ACTIONABLE_FINDING_CODES.length),quote:QuoteSchema.nullable(),checkedAt:z.iso.datetime(),version:z.literal(VERIFY_VERSION),
}).strict().superRefine((r,ctx)=>{
 const expected=r.findings.some(f=>f.severity==="block")?"block":r.findings.length?"warn":"pass";
 if(r.status!==expected)ctx.addIssue({code:"custom",message:"Inconsistent decision."});
 if(r.status==="pass"&&(!r.quote?.expiresAt||Date.parse(r.quote.expiresAt)<=Date.parse(r.checkedAt)))ctx.addIssue({code:"custom",message:"Pass requires an unexpired verified quote."});
});
export { VERIFY_VERSION };
