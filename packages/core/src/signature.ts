import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { base58 } from "@scure/base";
import type { QuoteResponse } from "./schemas.js";
import { stableStringify } from "./stable-json.js";

/**
 * Public key of the 1Click quote manager, from
 * @defuse-protocol/one-click-sdk-typescript 0.1.26 (`ONE_CLICK_MANAGER_PUB_KEY`).
 */
export const ONE_CLICK_PUBLIC_KEY = "ed25519:reYaWhvwu8Jzo3WUM3zhn6VrhuMEF4eADL17qtRVifc";

const PREFIX = "ed25519:";

function decodeKey(value: string): Uint8Array {
  return base58.decode(value.startsWith(PREFIX) ? value.slice(PREFIX.length) : value);
}

const orUndef = <T>(v: T | null | undefined): T | undefined => (v ? v : undefined);

/** The exact request fields 1Click signs (mirrors the official SDK's buildSignedQuoteRequest). */
function signedRequest(r: QuoteResponse["quoteRequest"]): Record<string, unknown> {
  return {
    dry: r.dry,
    swapType: r.swapType,
    slippageTolerance: r.slippageTolerance,
    originAsset: r.originAsset,
    depositType: r.depositType,
    destinationAsset: r.destinationAsset,
    amount: r.amount,
    refundTo: r.refundTo,
    refundType: r.refundType,
    recipient: r.recipient,
    recipientType: r.recipientType,
    deadline: r.deadline,
    quoteWaitingTimeMs: orUndef(r.quoteWaitingTimeMs),
    referral: orUndef(r.referral),
    virtualChainRecipient: orUndef(r.virtualChainRecipient),
    virtualChainRefundRecipient: orUndef(r.virtualChainRefundRecipient),
    customRecipientMsg: orUndef(r.customRecipientMsg),
  };
}

/** The exact quote fields 1Click signs (mirrors the official SDK's buildSignedQuote). */
function signedQuote(q: QuoteResponse["quote"], dry: boolean): Record<string, unknown> {
  const base = {
    amountIn: q.amountIn,
    amountInFormatted: q.amountInFormatted,
    amountInUsd: q.amountInUsd,
    minAmountIn: q.minAmountIn,
    amountOut: q.amountOut,
    amountOutFormatted: q.amountOutFormatted,
    amountOutUsd: q.amountOutUsd,
    minAmountOut: q.minAmountOut,
  };
  if (dry) return base;
  return {
    ...base,
    depositAddress: orUndef(q.depositAddress),
    depositMemo: orUndef(q.depositMemo),
    deadline: orUndef(q.deadline),
    timeWhenInactive: orUndef(q.timeWhenInactive),
    timeEstimate: orUndef(q.timeEstimate),
    refundFee: orUndef(q.refundFee),
    withdrawFee: orUndef(q.withdrawFee),
  };
}

/** Base58(SHA-256(stable JSON)), the message the 1Click key signs. */
export function quoteMessage(response: QuoteResponse): string {
  const data = stableStringify({
    ...signedRequest(response.quoteRequest),
    ...signedQuote(response.quote, response.quoteRequest.dry),
    timestamp: response.timestamp,
  });
  return base58.encode(sha256(new TextEncoder().encode(data)));
}

/** True only when the quote carries a valid 1Click Ed25519 signature. Never throws. */
export function verifyQuoteSignature(response: QuoteResponse, publicKey: string = ONE_CLICK_PUBLIC_KEY): boolean {
  try {
    const sig = decodeKey(response.signature);
    const key = decodeKey(publicKey);
    if (sig.length !== 64 || key.length !== 32) return false;
    const msg = new TextEncoder().encode(quoteMessage(response));
    return ed25519.verify(sig, msg, key, { zip215: false });
  } catch {
    return false;
  }
}
