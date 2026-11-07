import "./node-only";
import { verifyDeposit, verifyDepositWithLegacy, type VerifyDependencies, type VerifyInput, type VerifyResult } from "@neer/verify";
import { getStatus, getTokens, quotePublicKeyOverride } from "./upstream-node";

/** The shared module validates unknown input before this existing upstream adapter runs. */
export function verifyService(input: unknown): Promise<VerifyResult> {
  return verifyDeposit(input as VerifyInput, verifyDependencies());
}

/** Reuse exactly the same validated amount/catalog path for the full legacy UI. */
export function verifyPageService(input: VerifyInput) {
  return verifyDepositWithLegacy(input, verifyDependencies());
}

function verifyDependencies(): VerifyDependencies {
  return {
    quotePublicKey: quotePublicKeyOverride,
    fetchQuote: async ({ depositAddress, lookupMemo }) => {
      const [lookup, tokenState] = await Promise.all([
        getStatus(depositAddress, lookupMemo, { dedupe: false }),
        getTokens(),
      ]);
      return { lookup, tokens: tokenState.tokens };
    },
  };
}
