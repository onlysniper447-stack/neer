import { OneClickClient } from "@neer/oneclick";
import type { QuoteBundle, QuoteLookupRequest } from "./types.js";

/** Compose the existing client; no HTTP implementation or environment access here. */
export function createQuoteFetcher(client = new OneClickClient()) {
  return async ({ depositAddress, lookupMemo }: QuoteLookupRequest): Promise<QuoteBundle> => {
    const [lookup, tokens] = await Promise.all([
      client.getStatus(depositAddress, lookupMemo),
      client.getTokens(),
    ]);
    return { lookup, tokens: tokens.ok ? tokens.tokens : [] };
  };
}
