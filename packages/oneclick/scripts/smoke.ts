/**
 * Live smoke test against the real 1Click API. Sends no funds and signs nothing.
 *
 * 1. Requests a fresh NON-DRY quote (5 USDC on Arbitrum -> USDC on Solana) so
 *    1Click issues a real deposit address. Nobody deposits to it; it expires.
 * 2. Verifies the 1Click signature.
 * 3. Reads /v0/status for that address and runs the full preflight with a
 *    matching declared transfer (expects Safe to send) and with the wrong
 *    network (expects Don't send).
 *
 * Prints the deposit address so you can paste it into the running app.
 * Usage: pnpm smoke [--dry]
 */
import { writeFileSync } from "node:fs";
import { DeclaredTransferSchema, preflight, verifyQuoteSignature } from "@neer/core";
import { OneClickClient } from "../src/index.js";

const REFUND = "0x2527D02599Ba641c19FEa793cD0F167589a0f10D"; // address from the 1Click docs examples
const RECIPIENT = "13QkxhNMrTPxoCkRdYdJ65tFuwXPhL5gLS2Z5Nr6gjRK"; // address from the 1Click docs examples
const dry = process.argv.includes("--dry");

async function main() {
  const client = new OneClickClient({ jwt: process.env.ONECLICK_JWT });
  const deadline = new Date(Date.now() + 45 * 60_000).toISOString();
  const q = await client.requestQuote({
    dry,
    swapType: "EXACT_INPUT",
    slippageTolerance: 100,
    originAsset: "nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near",
    depositType: "ORIGIN_CHAIN",
    destinationAsset: "nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near",
    amount: "5000000",
    refundTo: REFUND,
    refundType: "ORIGIN_CHAIN",
    recipient: RECIPIENT,
    recipientType: "DESTINATION_CHAIN",
    deadline,
  });
  if (!q.ok) throw new Error(`quote failed: ${q.reason} ${q.status ?? ""} ${q.message ?? ""}`);
  const sigOk = verifyQuoteSignature(q.quote);
  console.log(`quote ok, dry=${dry}, signature valid=${sigOk}, correlationId=${q.quote.correlationId}`);
  if (!sigOk) throw new Error("signature did not verify");
  if (dry) return;

  const address = q.quote.quote.depositAddress!;
  console.log(`deposit address: ${address} (do NOT send funds; it expires at ${q.quote.quoteRequest.deadline})`);

  const [lookup, tokens] = await Promise.all([client.getStatus(address), client.getTokens()]);
  if (lookup.kind !== "found") throw new Error(`status lookup: ${JSON.stringify(lookup)}`);
  if (!tokens.ok) throw new Error(`tokens: ${tokens.reason}`);
  console.log(`status: ${lookup.status.status}`);

  const base = { depositAddress: address, lookup, tokens: tokens.tokens, now: new Date() };
  const good = preflight({
    ...base,
    transfer: DeclaredTransferSchema.parse({ chain: "arb", asset: "0xaf88d065e77c8cc2239327c5edb3a432268e5831", amount: "5000000", from: REFUND, source: "wallet" }),
  });
  const wrong = preflight({
    ...base,
    transfer: DeclaredTransferSchema.parse({ chain: "base", asset: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", amount: "5000000", from: REFUND, source: "wallet" }),
  });
  console.log(`matching send: ${good.label} - ${good.headline}`);
  for (const c of good.checks) console.log(`  [${c.severity}] ${c.title}: ${c.summary}`);
  console.log(`send on Base: ${wrong.label} - ${wrong.headline}`);
  writeFileSync(process.env.SMOKE_OUT ?? "smoke-address.txt", address + "\n");
  if (good.verdict !== "safe" || wrong.verdict !== "block") {
    throw new Error("unexpected verdicts");
  }
  console.log("smoke test passed");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
