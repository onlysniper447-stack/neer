import "server-only";
import { DeclaredTransferSchema, QuoteResponseSchema } from "@neer/core";
import { z } from "zod";
import { MemoSchema, PastedAddressSchema } from "../inputs";

export const PreflightRequestSchema = z.object({
  deposit: z.object({
    address: PastedAddressSchema,
    memo: MemoSchema.nullable().optional(),
  }),
  transfer: DeclaredTransferSchema,
  quote: QuoteResponseSchema.nullable().optional(),
});
