/**
 * Test scenarios for Neer. Each builds a 1Click `/v0/status` response with
 * deadlines relative to `now`, signed with a TEST key (never the 1Click key).
 * Tests pass TEST_PUBLIC_KEY to the engine so signature checking still runs.
 *
 * Shapes follow recorded live responses in ./recorded (see README there).
 */
import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { base58, createBase58check } from "@scure/base";
import { getAddress, keccak256, toHex } from "viem";
import { quoteMessage, type QuoteResponse, type StatusResponse, type SwapStatus, type Token } from "../../packages/core/src/index.js";
import tokensJson from "../recorded/tokens_live.json" with { type: "json" };

export const TOKENS = tokensJson as Token[];

/** Deterministic test key. Do not use for anything but tests. */
const TEST_SECRET = sha256(new TextEncoder().encode("neer-test-signing-key"));
export const TEST_PUBLIC_KEY = "ed25519:" + base58.encode(ed25519.getPublicKey(TEST_SECRET));

export function signQuote(unsigned: Omit<QuoteResponse, "signature">): QuoteResponse {
  const draft = { ...unsigned, signature: "ed25519:" } as QuoteResponse;
  const msg = new TextEncoder().encode(quoteMessage(draft));
  return { ...draft, signature: "ed25519:" + base58.encode(ed25519.sign(msg, TEST_SECRET)) };
}

/** Deterministic, valid EIP-55 address from a label. */
export function evmAddress(label: string): string {
  return getAddress("0x" + keccak256(toHex(label)).slice(-40));
}

/** Deterministic, valid Tron address from a label. */
export function tronAddress(label: string): string {
  const body = new Uint8Array(21);
  body[0] = 0x41;
  body.set(sha256(new TextEncoder().encode(label)).slice(0, 20), 1);
  return createBase58check(sha256).encode(body);
}

export const ASSETS = {
  ethEth: "nep141:eth.omft.near",
  baseEth: "nep141:base.omft.near",
  arbUsdc: "nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near",
  baseUsdc: "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near",
  solUsdc: "nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near",
  bscUsdt: "nep245:v2_1.omni.hot.tg:56_2CMMyVTGZkeyNZTSvS5sarzfir6g",
  tronUsdt: "nep141:tron-d28a265909efecdcee7c5028585214ea0b96f015.omft.near",
  stellarUsdc: "nep245:v2_1.omni.hot.tg:1100_111bzQBB65GxAPAVoxqmMcgYo5oS3txhqs1Uh1cgahKQUeTUq1TJu",
  xrp: "nep141:xrp.omft.near",
} as const;

/** Refund address used in the 1Click docs examples. */
export const DOCS_REFUND = "0x2527D02599Ba641c19FEa793cD0F167589a0f10D";
export const SOL_RECIPIENT = "13QkxhNMrTPxoCkRdYdJ65tFuwXPhL5gLS2Z5Nr6gjRK";
/** A valid Stellar address generated for fixtures (random key, not anyone's account). */
export const STELLAR_ADDRESS = "GCEDFGXHWR3Z3FFK5UEIUYTF6FUZUBHSJLUBC6X5VG3RPRRJYNI2UQNR";

const MIN = 60_000;

export interface QuoteOpts {
  now: Date;
  originAsset: string;
  destinationAsset?: string;
  depositAddress: string;
  depositMemo?: string;
  depositMode?: "SIMPLE" | "MEMO";
  swapType?: QuoteResponse["quoteRequest"]["swapType"];
  amountIn: string;
  minAmountIn?: string;
  amountInFormatted: string;
  amountInUsd: string;
  refundTo?: string;
  refundType?: QuoteResponse["quoteRequest"]["refundType"];
  recipient?: string;
  recipientType?: QuoteResponse["quoteRequest"]["recipientType"];
  depositType?: QuoteResponse["quoteRequest"]["depositType"];
  confidentiality?: "public" | "basic" | "advanced";
  /** Minutes until quoteRequest.deadline (refunds begin). Default 41. */
  requestDeadlineMin?: number;
  /** Minutes until quote.deadline (address inactive). Default 3 days, as observed live. */
  quoteDeadlineMin?: number;
  refundFee?: string;
  correlationId?: string;
}

export function makeQuote(o: QuoteOpts): QuoteResponse {
  const t = o.now.getTime();
  const reqDeadline = new Date(t + (o.requestDeadlineMin ?? 41) * MIN);
  const quoteDeadline = new Date(t + (o.quoteDeadlineMin ?? 3 * 24 * 60) * MIN);
  const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, ".000Z");
  return signQuote({
    correlationId: o.correlationId ?? "00000000-0000-4000-8000-000000000000",
    timestamp: new Date(t - 30_000).toISOString(),
    quoteRequest: {
      dry: false,
      depositMode: o.depositMode ?? (o.depositMemo ? "MEMO" : "SIMPLE"),
      swapType: o.swapType ?? "EXACT_INPUT",
      slippageTolerance: 100,
      originAsset: o.originAsset,
      depositType: o.depositType ?? "ORIGIN_CHAIN",
      destinationAsset: o.destinationAsset ?? ASSETS.solUsdc,
      amount: o.amountIn,
      refundTo: o.refundTo ?? DOCS_REFUND,
      refundType: o.refundType ?? "ORIGIN_CHAIN",
      recipient: o.recipient ?? SOL_RECIPIENT,
      recipientType: o.recipientType ?? "DESTINATION_CHAIN",
      deadline: iso(reqDeadline),
      confidentiality: o.confidentiality ?? "public",
      quoteWaitingTimeMs: 0,
      referral: null,
      virtualChainRecipient: null,
      virtualChainRefundRecipient: null,
    },
    quote: {
      amountIn: o.amountIn,
      amountInFormatted: o.amountInFormatted,
      amountInUsd: o.amountInUsd,
      minAmountIn: o.minAmountIn ?? o.amountIn,
      amountOut: "4735314",
      amountOutFormatted: "4.735314",
      amountOutUsd: "4.73",
      minAmountOut: "4687960",
      depositAddress: o.depositAddress,
      ...(o.depositMemo ? { depositMemo: o.depositMemo } : {}),
      deadline: iso(quoteDeadline),
      timeWhenInactive: iso(quoteDeadline),
      timeEstimate: 22,
      refundFee: o.refundFee ?? "5300",
      withdrawFee: "263754",
    },
  });
}

export function makeStatus(qr: QuoteResponse, status: SwapStatus, now: Date): StatusResponse {
  const done = status === "SUCCESS" || status === "PROCESSING" || status === "REFUNDED" || status === "FAILED";
  const seen = done || status === "KNOWN_DEPOSIT_TX" || status === "INCOMPLETE_DEPOSIT";
  const { correlationId: _drop, ...quoteResponse } = qr; // live status responses omit it
  return {
    status,
    updatedAt: now.toISOString(),
    correlationId: "11111111-1111-4111-8111-111111111111",
    quoteResponse: quoteResponse as QuoteResponse,
    swapDetails: {
      intentHashes: done ? ["5f6R3kQk9yG1X8b7bq5h4Fv3V2wW1nZr9c8m7L6k5J4h"] : [],
      nearTxHashes: done ? ["8Ttq2kXr5hFz7YvQm3c9nB1sD4pL6wE2aR5tU8iO0pK"] : [],
      amountIn: done ? qr.quote.amountIn : null,
      amountInFormatted: done ? qr.quote.amountInFormatted : null,
      amountInUsd: done ? qr.quote.amountInUsd : null,
      amountOut: status === "SUCCESS" ? qr.quote.amountOut : null,
      amountOutFormatted: status === "SUCCESS" ? qr.quote.amountOutFormatted : null,
      amountOutUsd: status === "SUCCESS" ? qr.quote.amountOutUsd : null,
      slippage: null,
      originChainTxHashes: seen
        ? [{ hash: "0x4ae0bb73e8efe79bf5a3aedeb0302371ab0d7fe0a918ebd0b1c8054a9807c593", explorerUrl: "https://arbiscan.io/tx/0x4ae0bb73e8efe79bf5a3aedeb0302371ab0d7fe0a918ebd0b1c8054a9807c593" }]
        : [],
      destinationChainTxHashes:
        status === "SUCCESS" ? [{ hash: "3vTq9Ldx2s5Kx7hK2nP1mBq8xYzA6cE4rT7uW9pL2kJ", explorerUrl: "https://solscan.io/tx/3vTq9Ldx2s5Kx7hK2nP1mBq8xYzA6cE4rT7uW9pL2kJ" }] : [],
      refundedAmount: status === "REFUNDED" ? qr.quote.amountIn : "0",
      refundedAmountFormatted: status === "REFUNDED" ? qr.quote.amountInFormatted : "0",
      refundedAmountUsd: status === "REFUNDED" ? qr.quote.amountInUsd : "0",
      refundReason: status === "REFUNDED" ? "PARTIAL_DEPOSIT" : null,
      depositedAmount: seen ? qr.quote.amountIn : null,
      depositedAmountFormatted: seen ? qr.quote.amountInFormatted : null,
      depositedAmountUsd: seen ? qr.quote.amountInUsd : null,
    },
  };
}

// ------------------------------------------------------------------ scenarios

/**
 * near/intents#382 replay, built from the issue text (17 Oct 2026):
 * "A user sent 0.17 ETH on Base to a 1Click deposit address issued for an ETH
 * on Ethereum quote." Deposit address and correlation ID are from the issue.
 * The refund address, destination asset and deadlines are not in the issue;
 * they are assumptions (docs example refund address, USDC on Solana, 41 min).
 */
export function issue382(now: Date): QuoteResponse {
  return makeQuote({
    now,
    originAsset: ASSETS.ethEth,
    depositAddress: "0xDF7A93d400159d0f8f40AAe42576d01285EA9e39",
    amountIn: "170000000000000000",
    amountInFormatted: "0.17",
    amountInUsd: "390.84",
    refundFee: "35000000000000",
    correlationId: "e5fd72e9-dc1f-4bd3-932f-f8659e690359",
  });
}

/** 5 USDC on Arbitrum to USDC on Solana, mirroring the recorded live quote. */
export function arbUsdc(now: Date, extra: Partial<QuoteOpts> = {}): QuoteResponse {
  return makeQuote({
    now,
    originAsset: ASSETS.arbUsdc,
    depositAddress: evmAddress("arb-usdc-deposit"),
    amountIn: "5000000",
    amountInFormatted: "5.0",
    amountInUsd: "4.997070000000",
    ...extra,
  });
}

/** Stellar USDC deposit that requires a memo (depositMode MEMO). Shape from the OpenAPI; not recorded live. */
export function stellarMemo(now: Date): QuoteResponse {
  return makeQuote({
    now,
    originAsset: ASSETS.stellarUsdc,
    destinationAsset: ASSETS.arbUsdc,
    depositAddress: STELLAR_ADDRESS,
    depositMemo: "4207198",
    amountIn: "11000000000",
    amountInFormatted: "1100.0",
    amountInUsd: "1099.32",
    refundTo: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    recipient: DOCS_REFUND,
    refundFee: "1000000",
  });
}

export function bscUsdtSmall(now: Date): QuoteResponse {
  return makeQuote({
    now,
    originAsset: ASSETS.bscUsdt,
    depositAddress: evmAddress("bsc-deposit"),
    amountIn: "240000000000000000000",
    amountInFormatted: "240.0",
    amountInUsd: "240.01",
  });
}

export function tronUsdtSmall(now: Date): QuoteResponse {
  return makeQuote({
    now,
    originAsset: ASSETS.tronUsdt,
    depositAddress: tronAddress("tron-deposit"),
    refundTo: tronAddress("tron-refund"),
    amountIn: "50000000",
    amountInFormatted: "50.0",
    amountInUsd: "49.98",
  });
}

/** Address -> scenario map used by the e2e mock 1Click server. */
export interface MockEntry {
  /** Returns the /v0/status body, or null for a 404. `call` counts requests for this address. */
  respond: (now: Date, call: number) => StatusResponse | null;
  memo?: string;
}

export const E2E_ADDRESSES = {
  safe: evmAddress("e2e-safe"),
  warnExpiry: evmAddress("e2e-warn-expiry"),
  issue382: "0xDF7A93d400159d0f8f40AAe42576d01285EA9e39",
  expired: evmAddress("e2e-expired"),
  used: evmAddress("e2e-used"),
  notFound: evmAddress("e2e-not-found"),
  upstreamDown: evmAddress("e2e-upstream-down"),
  memo: STELLAR_ADDRESS,
  progress: evmAddress("e2e-progress"),
} as const;

export function mockRegistry(): Map<string, MockEntry> {
  const m = new Map<string, MockEntry>();
  const key = (a: string) => a.toLowerCase();
  m.set(key(E2E_ADDRESSES.safe), { respond: (now) => makeStatus(arbUsdc(now, { depositAddress: E2E_ADDRESSES.safe }), "PENDING_DEPOSIT", now) });
  m.set(key(E2E_ADDRESSES.warnExpiry), {
    respond: (now) => makeStatus(arbUsdc(now, { depositAddress: E2E_ADDRESSES.warnExpiry, requestDeadlineMin: 8 }), "PENDING_DEPOSIT", now),
  });
  m.set(key(E2E_ADDRESSES.issue382), { respond: (now) => makeStatus(issue382(now), "PENDING_DEPOSIT", now) });
  m.set(key(E2E_ADDRESSES.expired), {
    respond: (now) => makeStatus(arbUsdc(now, { depositAddress: E2E_ADDRESSES.expired, requestDeadlineMin: -5 }), "PENDING_DEPOSIT", now),
  });
  m.set(key(E2E_ADDRESSES.used), { respond: (now) => makeStatus(arbUsdc(now, { depositAddress: E2E_ADDRESSES.used }), "SUCCESS", now) });
  m.set(key(E2E_ADDRESSES.notFound), { respond: () => null });
  m.set(key(E2E_ADDRESSES.memo), { respond: (now) => makeStatus(stellarMemo(now), "PENDING_DEPOSIT", now), memo: "4207198" });
  const progression: SwapStatus[] = ["PENDING_DEPOSIT", "KNOWN_DEPOSIT_TX", "PROCESSING", "SUCCESS"];
  m.set(key(E2E_ADDRESSES.progress), {
    respond: (now, call) =>
      makeStatus(arbUsdc(now, { depositAddress: E2E_ADDRESSES.progress }), progression[Math.min(call, progression.length - 1)]!, now),
  });
  return m;
}
