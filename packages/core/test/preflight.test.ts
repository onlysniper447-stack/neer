import { describe, expect, it } from "vitest";
import { encodeFunctionData, erc20Abi } from "viem";
import {
  DEFAULT_RULES,
  DeclaredTransferSchema,
  StatusResponseSchema,
  aggregateVerdict,
  preflight,
  type CheckResult,
  type Token,
} from "../src/index.js";
import liveStatus from "../../../fixtures/recorded/status_arb_usdc_live.json" with { type: "json" };
import {
  ASSETS,
  DOCS_REFUND,
  TOKENS,
  arbUsdc,
  bscUsdtSmall,
  evmAddress,
  issue382,
  makeQuote,
  makeStatus,
  stellarMemo,
  TEST_PUBLIC_KEY,
  tronUsdtSmall,
} from "../../../fixtures/src/scenarios.js";
import { FRESH_TOKENS, NOW, check, found, run } from "./helpers.js";

const ARB_USDC_CONTRACT = "0xaf88d065e77c8cc2239327c5edb3a432268e5831";
const wallet = { source: "wallet" as const };
const goodArb = { ...wallet, chain: "arb", asset: ARB_USDC_CONTRACT, amount: "5000000", from: DOCS_REFUND };

describe("recorded live quote (real 1Click signature)", () => {
  const status = StatusResponseSchema.parse(liveStatus);
  const depositAddress = status.quoteResponse.quote.depositAddress!;
  const base = {
    depositAddress,
    lookup: { kind: "found" as const, status, fetchedAt: new Date("2026-10-27T10:20:00Z") },
    tokens: TOKENS,
    now: new Date("2026-10-27T10:20:00Z"),
  };

  it("is Safe to send when every declared detail matches", () => {
    const res = preflight({ ...base, transfer: DeclaredTransferSchema.parse(goodArb) });
    expect(res.verdict).toBe("safe");
    expect(res.label).toBe("Safe to send");
    expect(res.headline).toBe("Everything matches the quote.");
    expect(res.quote?.verified).toBe(true);
    expect(res.quote?.originChain).toBe("arb");
    expect(res.quote?.sendBefore).toBe("2026-10-27T10:46:37.000Z");
    expect(res.signedQuote?.signature).toBe(status.quoteResponse.signature);
    expect(res.checks.every((c) => c.severity === "pass" || c.severity === "info")).toBe(true);
  });

  it("is Don't send once the 30-minute request deadline passes, even though quote.deadline is 3 days out", () => {
    const res = preflight({ ...base, now: new Date("2026-10-27T10:47:00Z"), transfer: DeclaredTransferSchema.parse(goodArb) });
    expect(res.verdict).toBe("block");
    expect(check(res, "time").severity).toBe("block");
    expect(res.headline).toBe("Quote expired");
  });
});

describe("near/intents#382 replay: 0.17 ETH on Base sent to an Ethereum quote", () => {
  const qr = issue382(NOW);
  const sendOnBase = { ...wallet, chain: "base", asset: "native", amount: "170000000000000000", from: DOCS_REFUND };

  it("returns Don't send with Wrong network as the reason", () => {
    const res = run(qr, sendOnBase);
    expect(res.verdict).toBe("block");
    expect(res.label).toBe("Don't send");
    expect(res.headline).toBe("Wrong network");
    const net = check(res, "network");
    expect(net.severity).toBe("block");
    expect(net.message).toBe(
      "Wrong network. This address is for Ethereum. You chose Base. Funds sent on Base won't be swapped automatically.",
    );
    expect(net.expected).toEqual({ chain: "eth", chainId: 1 });
    expect(net.actual).toEqual({ chain: "base", chainId: 8453 });
    expect(net.action).toEqual({ kind: "switch-network", chain: "eth", label: "Switch to Ethereum" });
  });

  it("reports exactly one problem: token, amount and address still match", () => {
    const res = run(qr, sendOnBase);
    expect(res.checks.filter((c) => c.severity === "block").map((c) => c.id)).toEqual(["network"]);
    expect(check(res, "token").severity).toBe("pass");
    expect(check(res, "amount").severity).toBe("pass");
    expect(check(res, "amount").summary).toBe("0.17 ETH");
    expect(check(res, "lookalike").severity).toBe("pass");
    expect(res.checks[0]!.id).toBe("network");
  });

  it("also blocks when only the wallet chainId (8453) is known", () => {
    const res = run(qr, { ...wallet, chainId: 8453, asset: "native", amount: "170000000000000000" });
    expect(check(res, "network").severity).toBe("block");
    expect(res.verdict).toBe("block");
  });

  it("blocks when a draft Base transaction proves it", () => {
    const res = run(qr, { ...wallet, tx: { to: qr.quote.depositAddress!, value: "170000000000000000", data: "0x", chainId: 8453 } });
    expect(res.verdict).toBe("block");
    expect(check(res, "network").severity).toBe("block");
    expect(check(res, "approval").severity).toBe("pass");
  });

  it("blocks when the declared chain and wallet chainId disagree", () => {
    const res = run(qr, { ...wallet, chain: "eth", chainId: 8453, asset: "native", amount: "170000000000000000" });
    expect(check(res, "network").severity).toBe("block");
    expect(check(res, "network").headline).toBe("Network mismatch");
  });

  it("is Safe to send once the user sends on Ethereum", () => {
    const res = run(qr, { ...sendOnBase, chain: "eth" });
    expect(res.verdict).toBe("safe");
  });

  it("asks the user to pick a network when none is given (no default)", () => {
    const res = run(qr, { ...wallet, asset: "native", amount: "170000000000000000" });
    expect(res.verdict).toBe("check");
    expect(check(res, "network").severity).toBe("warn");
    expect(check(res, "network").message).toBe("We can't see your network. Pick the one your wallet or exchange shows before you send.");
  });
});

describe("time left", () => {
  it("blocks an expired quote", () => {
    const res = run(arbUsdc(NOW, { requestDeadlineMin: -1 }), goodArb);
    expect(res.verdict).toBe("block");
    expect(check(res, "time").message).toBe("This quote has expired. Don't send to this address. Get a new quote from your app.");
    expect(check(res, "time").action?.kind).toBe("new-quote");
  });

  it("uses the earlier of quoteRequest.deadline and quote.deadline", () => {
    const res = run(arbUsdc(NOW, { requestDeadlineMin: 120, quoteDeadlineMin: -2 }), goodArb);
    expect(check(res, "time").severity).toBe("block");
  });

  it("warns when close to expiry (8 minutes)", () => {
    const res = run(arbUsdc(NOW, { requestDeadlineMin: 8 }), goodArb);
    expect(res.verdict).toBe("check");
    expect(check(res, "time").severity).toBe("warn");
    expect(check(res, "time").message).toBe("8 minutes left. If your send could take longer, get a fresh quote first.");
  });

  it("blocks when time left is below the chain's confirmation budget (Ethereum, 4 min)", () => {
    const res = run(makeQuote({ ...issue382Opts(), requestDeadlineMin: 4 }), { ...wallet, chain: "eth", asset: "native", amount: "170000000000000000" });
    expect(check(res, "time").severity).toBe("block");
    expect(check(res, "time").headline).toBe("Too close to expiry");
  });

  it("passes with plenty of time", () => {
    const res = run(arbUsdc(NOW), goodArb);
    expect(check(res, "time").message).toBe("41 minutes left. Plenty of time.");
  });
});

function issue382Opts() {
  return {
    now: NOW,
    originAsset: ASSETS.ethEth,
    depositAddress: "0xDF7A93d400159d0f8f40AAe42576d01285EA9e39",
    amountIn: "170000000000000000",
    amountInFormatted: "0.17",
    amountInUsd: "390.84",
  };
}

describe("memo", () => {
  const qr = stellarMemo(NOW);
  const xlm = { ...wallet, chain: "stellar", asset: ASSETS.stellarUsdc, amount: "11000000000" };

  it("blocks a missing memo", () => {
    const res = run(qr, xlm, { memo: null });
    expect(res.verdict).toBe("block");
    expect(check(res, "memo").message).toBe(
      "Memo missing. This deposit needs the memo shown above. Without it, your funds can't be matched to your swap.",
    );
  });

  it("blocks a wrong memo", () => {
    const res = run(qr, { ...xlm, memo: "4207199" }, { memo: "4207198" });
    expect(check(res, "memo").severity).toBe("block");
    expect(check(res, "memo").headline).toBe("Wrong memo");
  });

  it("uses the pasted memo when the transfer memo is not given separately", () => {
    const res = run(qr, xlm, { memo: "4207198" });
    expect(check(res, "memo").severity).toBe("pass");
    expect(res.verdict).toBe("safe");
  });

  it("warns about memo fields when sending from an exchange", () => {
    const res = run(qr, { ...xlm, source: "exchange" }, { memo: "4207198" });
    expect(check(res, "memo").severity).toBe("warn");
    expect(res.verdict).toBe("check");
  });

  it("is informational when a memo is given for a quote that doesn't use one", () => {
    const res = run(arbUsdc(NOW), { ...goodArb, memo: "123" });
    expect(check(res, "memo").severity).toBe("info");
    expect(res.verdict).toBe("safe");
  });

  it("is omitted when neither side has a memo", () => {
    const res = run(arbUsdc(NOW), goodArb);
    expect(res.checks.find((c) => c.id === "memo")).toBeUndefined();
  });
});

describe("chain minimums", () => {
  it("blocks a $240 swap from BNB Chain", () => {
    const res = run(bscUsdtSmall(NOW), { ...wallet, chain: "bsc", asset: "0x55d398326f99059ff775485246999027b3197955", amount: "240000000000000000000" });
    expect(res.verdict).toBe("block");
    expect(check(res, "minimum").message).toBe(
      "Below the minimum. Swaps on BNB Chain under $1,000 are paused right now. Yours is $240.01. Try a larger amount or another network.",
    );
  });

  it("blocks when the destination is on a $1,000-minimum chain (observed live: 1Click rejects ARB->BSC $5)", () => {
    const qr = arbUsdc(NOW, { destinationAsset: ASSETS.bscUsdt, recipient: DOCS_REFUND });
    expect(check(run(qr, goodArb), "minimum").severity).toBe("block");
  });

  it("blocks a $50 swap from Tron", () => {
    const qr = tronUsdtSmall(NOW);
    const res = run(qr, { ...wallet, chain: "tron", asset: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", amount: "50000000" });
    expect(check(res, "minimum").severity).toBe("block");
    expect(check(res, "minimum").summary).toBe("$49.98, minimum $100");
  });

  it("passes on chains without a minimum", () => {
    expect(check(run(arbUsdc(NOW), goodArb), "minimum").severity).toBe("pass");
  });

  it("warns when the dated minimums config is older than its max age", () => {
    const res = preflight({
      depositAddress: arbUsdc(NOW).quote.depositAddress!,
      lookup: found(makeStatus(arbUsdc(NOW), "PENDING_DEPOSIT", NOW)),
      transfer: DeclaredTransferSchema.parse(goodArb),
      tokens: FRESH_TOKENS,
      now: new Date(NOW.getTime()),
      rules: { ...DEFAULT_RULES, minimums: { ...DEFAULT_RULES.minimums, checkedAt: "2026-01-01T00:00:00Z" } },
      quotePublicKey: TEST_PUBLIC_KEY,
    });
    expect(check(res, "minimum").severity).toBe("warn");
  });
});

describe("amount vs swap type (BigInt only)", () => {
  const exactIn = arbUsdc(NOW);
  it("EXACT_INPUT: below amountIn blocks, equal passes, above warns", () => {
    expect(check(run(exactIn, { ...goodArb, amount: "4999999" }), "amount").severity).toBe("block");
    expect(check(run(exactIn, { ...goodArb, amount: "4999999" }), "amount").message).toBe(
      "Too little. This swap needs 5 USDC. If you send 4.999999 USDC it will be refunded, not swapped.",
    );
    expect(check(run(exactIn, goodArb), "amount").severity).toBe("pass");
    const over = check(run(exactIn, { ...goodArb, amount: "7000000" }), "amount");
    expect(over.severity).toBe("warn");
    expect(over.message).toBe("You're sending more than needed. The extra 2 USDC comes back to your refund address after the swap.");
  });

  it("EXACT_OUTPUT: below minAmountIn blocks, between passes, above amountIn warns", () => {
    const qr = arbUsdc(NOW, { swapType: "EXACT_OUTPUT", amountIn: "5050000", minAmountIn: "5000000" });
    expect(check(run(qr, { ...goodArb, amount: "4999999" }), "amount").severity).toBe("block");
    expect(check(run(qr, { ...goodArb, amount: "5000000" }), "amount").severity).toBe("pass");
    expect(check(run(qr, { ...goodArb, amount: "5050000" }), "amount").severity).toBe("pass");
    expect(check(run(qr, { ...goodArb, amount: "5050001" }), "amount").severity).toBe("warn");
  });

  it("FLEX_INPUT: below minAmountIn blocks, anything above passes", () => {
    const qr = arbUsdc(NOW, { swapType: "FLEX_INPUT", amountIn: "5000000", minAmountIn: "4950000" });
    expect(check(run(qr, { ...goodArb, amount: "4949999" }), "amount").severity).toBe("block");
    expect(check(run(qr, { ...goodArb, amount: "4950000" }), "amount").severity).toBe("pass");
    expect(check(run(qr, { ...goodArb, amount: "90000000" }), "amount").severity).toBe("pass");
  });

  it("ANY_INPUT is blocked for personal sends", () => {
    const qr = arbUsdc(NOW, { swapType: "ANY_INPUT" });
    expect(check(run(qr, goodArb), "amount").severity).toBe("block");
  });

  it("asks for the amount when it is missing", () => {
    const res = run(exactIn, { ...goodArb, amount: undefined });
    expect(check(res, "amount").severity).toBe("unknown");
    expect(res.verdict).toBe("check");
  });

  it("handles 18-decimal amounts beyond Number precision", () => {
    const qr = issue382(NOW);
    const res = run(qr, { ...wallet, chain: "eth", asset: "native", amount: "170000000000000001" });
    expect(check(res, "amount").severity).toBe("warn");
    expect(check(res, "amount").message).toContain("0.000000000000000001 ETH");
  });

  it("warns when the amount is at or below the refund fee", () => {
    const qr = arbUsdc(NOW, { swapType: "FLEX_INPUT", amountIn: "5000", minAmountIn: "4000", refundFee: "5300" });
    const res = run(qr, { ...goodArb, amount: "5000" });
    expect(check(res, "approval").severity).toBe("warn");
    expect(check(res, "approval").message).toBe("This amount is tiny. If it's refunded, fees could take most of it.");
  });
});

describe("quote lookup outcomes", () => {
  it("404 means Don't send yet", () => {
    const res = preflight({
      depositAddress: evmAddress("missing"),
      lookup: { kind: "not_found" },
      transfer: DeclaredTransferSchema.parse(goodArb),
      tokens: TOKENS,
      now: NOW,
    });
    expect(res.outcome).toBe("not_found");
    expect(res.verdict).toBe("block");
    expect(res.headline).toBe("We can't find this quote");
    expect(res.message).toBe("Don't send yet. Copy the address again, or ask your swap app for a new quote.");
    expect(res.quote).toBeNull();
  });

  for (const reason of ["timeout", "network", "bad_status", "invalid_response", "rate_limited"] as const) {
    it(`API error (${reason}) is never Safe`, () => {
      const res = preflight({
        depositAddress: evmAddress("x"),
        lookup: { kind: "error", reason },
        transfer: DeclaredTransferSchema.parse(goodArb),
        tokens: TOKENS,
        now: NOW,
      });
      expect(res.outcome).toBe("unavailable");
      expect(res.verdict).toBe("check");
      expect(res.headline).toBe("We couldn't finish the checks");
    });
  }

  it("tokens list unavailable: network, token and amount can't be confirmed, so never Safe", () => {
    const res = run(arbUsdc(NOW), goodArb, { tokens: [] });
    expect(res.verdict).toBe("check");
    expect(check(res, "network").severity).toBe("unknown");
    expect(check(res, "token").severity).toBe("unknown");
  });

  it("a partner-supplied quote with a 404 status still runs, but address status is unknown", () => {
    const qr = arbUsdc(NOW);
    const res = run(qr, goodArb, { lookup: { kind: "not_found" }, quote: qr });
    expect(res.outcome).toBe("checked");
    expect(check(res, "used").severity).toBe("unknown");
    expect(res.verdict).toBe("check");
  });

  it("a partner-supplied quote that differs from 1Click's is blocked", () => {
    const qr = arbUsdc(NOW);
    const other = arbUsdc(new Date(NOW.getTime() + 1000));
    const res = run(qr, goodArb, { quote: other });
    expect(check(res, "signature").severity).toBe("block");
    expect(check(res, "signature").headline).toBe("Quote mismatch");
  });
});

describe("address status (one-time addresses)", () => {
  for (const s of ["KNOWN_DEPOSIT_TX", "PROCESSING", "SUCCESS", "REFUNDED", "FAILED", "INCOMPLETE_DEPOSIT"] as const) {
    it(`${s} blocks`, () => {
      const res = run(arbUsdc(NOW), goodArb, { status: s });
      expect(check(res, "used").severity).toBe("block");
      expect(res.verdict).toBe("block");
    });
  }
  it("SUCCESS uses the spec copy", () => {
    const res = run(arbUsdc(NOW), goodArb, { status: "SUCCESS" });
    expect(check(res, "used").message).toBe("This address was already used. Each deposit address works once. Get a new quote.");
  });
});

describe("signature", () => {
  it("blocks a quote whose deposit address was altered after signing", () => {
    const qr = arbUsdc(NOW);
    const tampered = { ...qr, quote: { ...qr.quote, depositAddress: evmAddress("attacker") } };
    const res = run(tampered, goodArb);
    expect(check(res, "signature").severity).toBe("block");
    expect(check(res, "signature").message).toBe("We couldn't confirm this quote came from NEAR Intents. Don't send.");
    expect(res.signedQuote).toBeNull();
    expect(res.quote?.verified).toBe(false);
  });

  it("blocks a dry (preview) quote", () => {
    const qr = arbUsdc(NOW);
    const dry = { ...qr, quoteRequest: { ...qr.quoteRequest, dry: true } };
    expect(check(run(dry, goodArb), "signature").headline).toBe("Preview quote");
  });
});

describe("lookalike and address match", () => {
  const qr = arbUsdc(NOW);
  const real = qr.quote.depositAddress!;

  it("passes on an exact match, including a lowercase paste", () => {
    const res = run(qr, goodArb, { pasted: real.toLowerCase() });
    expect(check(res, "lookalike").severity).toBe("pass");
    expect(check(res, "format").severity).toBe("pass");
    expect(check(res, "format").summary).toBe("Valid, no checksum");
  });

  it("blocks a poisoned address with the same first and last 4 characters", () => {
    const fake = real.slice(0, 6) + "0".repeat(30) + real.slice(-4);
    const res = run(qr, { ...goodArb, to: fake });
    expect(check(res, "lookalike").severity).toBe("block");
    expect(check(res, "lookalike").headline).toBe("Lookalike address");
    expect(res.verdict).toBe("block");
  });

  it("blocks an ERC-20 transfer whose recipient differs from the quote", () => {
    const data = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [evmAddress("someone-else") as `0x${string}`, 5000000n] });
    const res = run(qr, { ...wallet, tx: { to: ARB_USDC_CONTRACT, data, chainId: 42161 } });
    expect(check(res, "lookalike").severity).toBe("block");
  });

  it("passes an ERC-20 transfer to the right address (Safe)", () => {
    const data = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [real as `0x${string}`, 5000000n] });
    const res = run(qr, { ...wallet, from: DOCS_REFUND, tx: { to: ARB_USDC_CONTRACT, data, chainId: 42161 } });
    expect(res.verdict).toBe("safe");
    expect(check(res, "approval").message).toBe("This is a plain transfer. No approvals involved.");
  });
});

describe("token", () => {
  const qr = arbUsdc(NOW);
  it("blocks a different token (USDT instead of USDC)", () => {
    const res = run(qr, { ...goodArb, asset: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9" });
    expect(check(res, "token").severity).toBe("block");
    expect(check(res, "token").message).toBe("Wrong token. The quote expects USDC. You're about to send USDT0."); // Arbitrum USDT is listed as USDT0 by 1Click
  });

  it("blocks a contract NEAR Intents doesn't accept on that network (bridged USDC.e)", () => {
    const res = run(qr, { ...goodArb, asset: "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8" });
    expect(check(res, "token").severity).toBe("block");
  });

  it("warns on same symbol, different contract when declared by hand; blocks when a draft tx proves it", () => {
    const bridged: Token = { assetId: "nep141:arb-0xff970a61a04b1ca14834a43f5de4533ebddb5cc8.omft.near", decimals: 6, blockchain: "arb", symbol: "USDC", contractAddress: "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8", price: 1, priceUpdatedAt: NOW.toISOString() };
    const tokens = [...FRESH_TOKENS, bridged];
    const declared = run(qr, { ...goodArb, asset: bridged.contractAddress! }, { tokens });
    expect(check(declared, "token").severity).toBe("warn");
    const data = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [qr.quote.depositAddress as `0x${string}`, 5000000n] });
    const proven = run(qr, { ...wallet, tx: { to: bridged.contractAddress!, data, chainId: 42161 } }, { tokens });
    expect(check(proven, "token").severity).toBe("block");
  });

  it("asks for the token when it is missing", () => {
    expect(check(run(qr, { ...goodArb, asset: undefined }), "token").severity).toBe("unknown");
  });
});

describe("approvals", () => {
  const qr = arbUsdc(NOW);
  it("blocks an approve() draft", () => {
    const data = encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [qr.quote.depositAddress as `0x${string}`, 5000000n] });
    const res = run(qr, { ...wallet, tx: { to: ARB_USDC_CONTRACT, data, chainId: 42161 } });
    expect(check(res, "approval").severity).toBe("block");
    expect(check(res, "approval").message).toBe(
      "This isn't a deposit. Your wallet is asking to approve spending, not to send. A NEAR Intents deposit never needs an approval.",
    );
  });
  it("blocks an unknown contract call", () => {
    const res = run(qr, { ...wallet, tx: { to: ARB_USDC_CONTRACT, data: "0xdeadbeef", chainId: 42161 } });
    expect(check(res, "approval").severity).toBe("block");
  });
});

describe("refund address", () => {
  it("warns when refunds go to an address you're not sending from", () => {
    const res = run(arbUsdc(NOW), { ...goodArb, from: evmAddress("another-wallet") });
    expect(check(res, "refund").severity).toBe("warn");
    expect(res.verdict).toBe("check");
  });
  it("blocks a refund address equal to the deposit address", () => {
    const addr = evmAddress("loop");
    const res = run(arbUsdc(NOW, { depositAddress: addr, refundTo: addr }), goodArb);
    expect(check(res, "refund").severity).toBe("block");
  });
  it("blocks a refund address that is invalid on the origin chain", () => {
    const res = run(arbUsdc(NOW, { refundTo: "13QkxhNMrTPxoCkRdYdJ65tFuwXPhL5gLS2Z5Nr6gjRK" }), goodArb);
    expect(check(res, "refund").severity).toBe("block");
    expect(check(res, "refund").message).toBe("This refund address won't work on Arbitrum. If the swap fails, your refund can't reach you.");
  });
  it("is informational when we don't know the sender", () => {
    const res = run(arbUsdc(NOW), { ...goodArb, from: undefined });
    expect(check(res, "refund").severity).toBe("info");
  });
});

describe("other checks", () => {
  it("XRP destination tag is blocked", () => {
    const qr = arbUsdc(NOW, { destinationAsset: ASSETS.xrp, recipient: "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh?dt=1234" });
    expect(check(run(qr, goodArb), "xrp").severity).toBe("block");
  });
  it("XRP classic recipient passes", () => {
    const qr = arbUsdc(NOW, { destinationAsset: ASSETS.xrp, recipient: "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh" });
    expect(check(run(qr, goodArb), "xrp").severity).toBe("pass");
  });
  it("confidential swaps are never Safe", () => {
    const res = run(arbUsdc(NOW, { confidentiality: "basic" }), goodArb);
    expect(check(res, "confidential").severity).toBe("warn");
    expect(res.verdict).toBe("check");
  });
  it("sending from an exchange warns with the amount that must arrive", () => {
    const res = run(arbUsdc(NOW), { ...goodArb, source: "exchange" });
    expect(check(res, "exchange").message).toContain("Make sure at least 5 USDC arrives");
    expect(res.verdict).toBe("check");
  });
  it("unknown sending source is never Safe", () => {
    expect(run(arbUsdc(NOW), { ...goodArb, source: "unknown" }).verdict).toBe("check");
  });
  it("status data older than 60 s is stale", () => {
    const qr = arbUsdc(NOW);
    const res = run(qr, goodArb, { lookup: found(makeStatus(qr, "PENDING_DEPOSIT", NOW), new Date(NOW.getTime() - 120_000)) });
    expect(check(res, "stale").severity).toBe("warn");
  });
  it("token prices older than 15 minutes are flagged", () => {
    const tokens = TOKENS.map((t) => ({ ...t, priceUpdatedAt: new Date(NOW.getTime() - 20 * 60_000).toISOString() }));
    const res = run(arbUsdc(NOW), goodArb, { tokens });
    expect(check(res, "stale").message).toBe("Prices are 20 minutes old, so the dollar value is approximate. Token amounts are still exact.");
  });
  it("incidents are reported as not checked (info), never as passed", () => {
    expect(check(run(arbUsdc(NOW), goodArb), "incident").severity).toBe("info");
  });
});

describe("verdict aggregation fails closed", () => {
  const mk = (id: CheckResult["id"], severity: CheckResult["severity"]): CheckResult => ({ id, severity, title: id, headline: id, summary: "", message: "" });
  const allPass = ["signature", "used", "time", "lookalike", "network", "token", "amount", "exchange"].map((id) => mk(id as CheckResult["id"], "pass"));

  it("no checks is not Safe", () => expect(aggregateVerdict([])).toBe("check"));
  it("all required passing is Safe", () => expect(aggregateVerdict(allPass)).toBe("safe"));
  it("info does not downgrade", () => expect(aggregateVerdict([...allPass, mk("incident", "info")])).toBe("safe"));
  it("unknown downgrades to Check this", () => expect(aggregateVerdict([...allPass, mk("format", "unknown")])).toBe("check"));
  it("a missing required check is not Safe", () => expect(aggregateVerdict(allPass.slice(1))).toBe("check"));
  it("any block wins", () => expect(aggregateVerdict([...allPass, mk("memo", "warn"), mk("minimum", "block")])).toBe("block"));

  it("orders checks block, warn, unknown, info, pass and hashes deterministically", () => {
    const qr = issue382(NOW);
    const t = { ...wallet, chain: "base", asset: "native", amount: "170000000000000000" };
    const a = run(qr, t);
    const b = run(qr, t);
    expect(a.checksHash).toBe(b.checksHash);
    expect(a.checksHash).toMatch(/^[0-9a-f]{64}$/);
    const ranks = a.checks.map((c) => ["block", "warn", "unknown", "info", "pass"].indexOf(c.severity));
    expect([...ranks].sort((x, y) => x - y)).toEqual(ranks);
    const c = run(qr, { ...t, chain: "eth" });
    expect(c.checksHash).not.toBe(a.checksHash);
  });
});
