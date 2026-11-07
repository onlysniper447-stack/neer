/** Obviously fake, deterministic fixtures. Never send funds to these addresses. */
import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { base58 } from "@scure/base";
import { getAddress } from "viem";
import { DEFAULT_RULES, DeclaredTransferSchema, quoteMessage, type PreflightInput, type QuoteResponse, type Token } from "@neer/core";
import type { VerifyInput, QuoteBundle, VerifyDependencies } from "../src/index.js";

export const NOW = new Date("2026-11-07T15:30:00.000Z");
const TEST_ONLY_SEED = sha256(new TextEncoder().encode("NEER_VERIFY_FAKE_TEST_KEY_DO_NOT_USE_WITH_FUNDS"));
export const PUBLIC_KEY = "ed25519:" + base58.encode(ed25519.getPublicKey(TEST_ONLY_SEED));
export const DEPOSIT = getAddress("0xfafafafafafafafafafafafafafafafafafafafa");
export const REFUND = getAddress("0xbabababababababababababababababababababa");
export const OTHER = getAddress("0xdadadadadadadadadadadadadadadadadadadada");
export const CONTRACT = getAddress("0xcacacacacacacacacacacacacacacacacacacaca");
export const TOKEN = "nep141:fake-usdc.omft.near";
export const DEST = "nep141:fake-near.omft.near";
export function tokens(): Token[] { return [
  { assetId: TOKEN, blockchain: "eth", symbol: "FAKE", decimals: 6, contractAddress: CONTRACT, priceUpdatedAt: NOW.toISOString() },
  { assetId: DEST, blockchain: "near", symbol: "FAKE_NEAR", decimals: 24, contractAddress: null, priceUpdatedAt: NOW.toISOString() },
]; }
export function sign(q: QuoteResponse): QuoteResponse {
  return { ...q, signature: "ed25519:" + base58.encode(ed25519.sign(new TextEncoder().encode(quoteMessage(q)), TEST_ONLY_SEED)) };
}
export function quote(): QuoteResponse {
  return sign({ timestamp: NOW.toISOString(), signature: "test-only", correlationId: "FAKE_QUOTE_ID",
    quoteRequest: { dry: false, swapType: "EXACT_INPUT", slippageTolerance: 100, originAsset: TOKEN, depositType: "ORIGIN_CHAIN", destinationAsset: DEST, amount: "5000000", refundTo: REFUND, refundType: "ORIGIN_CHAIN", recipient: "fake-recipient.near", recipientType: "DESTINATION_CHAIN", deadline: new Date(NOW.getTime()+3600000).toISOString() },
    quote: { amountIn: "5000000", amountInFormatted: "5", amountInUsd: "5", minAmountIn: "5000000", amountOut: "1000000", amountOutFormatted: "1", amountOutUsd: "5", minAmountOut: "1000000", depositAddress: DEPOSIT, deadline: new Date(NOW.getTime()+7200000).toISOString(), timeWhenInactive: new Date(NOW.getTime()+7200000).toISOString(), refundFee: "1000" },
  });
}
export function legacy(): PreflightInput {
  const q = quote();
  return { depositAddress: DEPOSIT, depositMemo: null, lookup: { kind: "found", status: { quoteResponse: q, status: "PENDING_DEPOSIT", updatedAt: NOW.toISOString() }, fetchedAt: NOW },
    tokens: tokens(), transfer: DeclaredTransferSchema.parse({ chain: "eth", asset: TOKEN, amount: "5000000", source: "wallet" }), now: NOW, quotePublicKey: PUBLIC_KEY,
    rules: { ...DEFAULT_RULES, minimums: { ...DEFAULT_RULES.minimums, checkedAt: NOW.toISOString() } } };
}
export function input(): VerifyInput { return { depositAddress: DEPOSIT, network: "eth", token: TOKEN, amount: "5", source: "wallet" }; }
export function bundle(): QuoteBundle { const l=legacy(); return { lookup: l.lookup, tokens: l.tokens }; }
export function deps(): VerifyDependencies { return { fetchQuote: async () => bundle(), now: () => NOW, quotePublicKey: PUBLIC_KEY, rules: legacy().rules }; }
