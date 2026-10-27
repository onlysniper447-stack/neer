import { z } from "zod";

/**
 * A pasted deposit address. Deposit addresses are single tokens of base58,
 * hex, base32, base64 (TON) or NEAR account characters. Anything with spaces,
 * hidden characters or other punctuation is refused instead of "cleaned up".
 */
export const PastedAddressSchema = z
  .string()
  .trim()
  .min(3, "Paste the full deposit address")
  .max(128, "That's longer than any deposit address")
  .regex(/^[A-Za-z0-9:_\-.+/=]+$/, "This contains characters a deposit address never has. Copy it again from your swap app.");

export const MemoSchema = z
  .string()
  .trim()
  .max(128, "That memo is too long")
  .regex(/^[\x21-\x7e]*$/, "Memos are plain letters and numbers. Copy it again from your swap app.");

export const TrackQuerySchema = z.object({
  address: PastedAddressSchema,
  memo: MemoSchema.optional(),
});
