import { describe, expect, it } from "vitest";
import { REQUIRED_CHECKS, SAFE_DEFINITION, VERDICT_LABEL, type QuoteResponse } from "../src/index.js";
import { ASSETS, DOCS_REFUND, SOL_RECIPIENT, arbUsdc, signQuote, type QuoteOpts } from "../../../fixtures/src/scenarios.js";
import { FRESH_TOKENS, NOW, check, run } from "./helpers.js";

/** Fake data only: never send to these addresses. */
const ARB_USDC_CONTRACT = "0xaf88d065e77c8cc2239327c5edb3a432268e5831";
const sendArb = { source: "wallet" as const, chain: "arb", asset: ARB_USDC_CONTRACT, amount: "5000000", from: DOCS_REFUND };
const BTC_BECH32 = "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4"; // BIP-173 test vector
const XRP_CLASSIC = "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh";

function quoteTo(extra: Partial<QuoteOpts>, req: Partial<QuoteResponse["quoteRequest"]> = {}): QuoteResponse {
  const { signature: _drop, ...q } = arbUsdc(NOW, extra);
  return signQuote({ ...q, quoteRequest: { ...q.quoteRequest, ...req } });
}
const recipientOf = (q: QuoteResponse, expectedRecipient?: string, expectedDestinationChain?: string) =>
  check(run(q, { ...sendArb, ...(expectedRecipient === undefined ? {} : { expectedRecipient }), ...(expectedDestinationChain ? { expectedDestinationChain } : {}) }), "recipient");

describe("recipient check per address family", () => {
  it("EVM compares case-insensitively (checksum only changes case)", () => {
    const q = quoteTo({ destinationAsset: ASSETS.baseUsdc, recipient: DOCS_REFUND });
    expect(recipientOf(q, DOCS_REFUND.toLowerCase()).severity).toBe("pass");
    expect(recipientOf(q, DOCS_REFUND.toUpperCase().replace("0X", "0x")).severity).toBe("pass");
    const res = run(q, { ...sendArb, expectedRecipient: DOCS_REFUND });
    expect(res.verdict).toBe("safe");
    expect(res.label).toBe("Checks passed");
    expect(check(res, "recipient").message).toBe("Your receiving address matches the quote's recipient, 0x2527…f10D on Base. Neer does not check delivery on the destination network.");
  });
  it("NEAR account IDs compare exactly", () => {
    const q = quoteTo({ destinationAsset: "nep141:wrap.near", recipient: "fake-user.near" });
    expect(recipientOf(q, "fake-user.near").severity).toBe("pass");
    expect(recipientOf(q, "fake-user1.near").severity).toBe("block");
    expect(recipientOf(q, "Fake-User.near").severity).toBe("block");
  });
  it("Solana compares exactly (base58 is case-sensitive)", () => {
    const q = quoteTo({ recipient: SOL_RECIPIENT });
    expect(recipientOf(q, SOL_RECIPIENT).severity).toBe("pass");
    expect(recipientOf(q, SOL_RECIPIENT.toLowerCase()).severity).toBe("block");
  });
  it("Bitcoin bech32 compares case-insensitively; a different address blocks", () => {
    const q = quoteTo({ destinationAsset: "nep141:btc.omft.near", recipient: BTC_BECH32 });
    expect(recipientOf(q, BTC_BECH32.toUpperCase()).severity).toBe("pass");
    expect(recipientOf(q, "bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3").severity).toBe("block");
  });
  it("XRP classic addresses compare exactly", () => {
    const q = quoteTo({ destinationAsset: "nep141:xrp.omft.near", recipient: XRP_CLASSIC });
    expect(recipientOf(q, XRP_CLASSIC).severity).toBe("pass");
    expect(recipientOf(q, "rrrrrrrrrrrrrrrrrrrrrhoLvTp").severity).toBe("block");
  });
});

describe("recipient check outcomes", () => {
  const q = quoteTo({ destinationAsset: ASSETS.baseUsdc, recipient: DOCS_REFUND });

  it("a different address blocks and shows both short addresses, never the full ones", () => {
    const c = recipientOf(q, "0x1111111111111111111111111111111111111111");
    expect(c.severity).toBe("block");
    expect(c.headline).toBe("Different receiving address");
    expect(c.message).toBe("The quote sends the swapped funds to 0x2527…f10D, not your address 0x1111…1111. Don't send. Get a new quote to your own address.");
    expect(c.message).not.toContain(DOCS_REFUND);
  });
  it("a lookalike (same first and last characters) is flagged specifically", () => {
    const c = recipientOf(q, "0x2527000000000000000000000000000000a0f10D");
    expect(c.severity).toBe("block");
    expect(c.headline).toBe("Lookalike receiving address");
    expect(c.message).toContain("starts and ends like your address");
  });
  it("a different expected destination network blocks, even with the right address", () => {
    const c = recipientOf(q, DOCS_REFUND, "arb");
    expect(c.severity).toBe("block");
    expect(c.headline).toBe("Wrong receiving network");
    expect(c.message).toBe("The quote delivers on Base, but you expect to receive on Arbitrum. Don't send. Get a new quote for the network you want.");
    expect(recipientOf(q, DOCS_REFUND, "base").severity).toBe("pass");
  });
  it("not entered is unknown, so the verdict is Check this with a clear headline", () => {
    const res = run(q, sendArb);
    const c = check(res, "recipient");
    expect(c.severity).toBe("unknown");
    expect(c.message).toBe("The quote sends the swapped funds to 0x2527…f10D. Enter your own receiving address so Neer can compare it with the quote.");
    expect(res.verdict).toBe("check");
    expect(res.headline).toBe("Receiving address not confirmed");
  });
  it("blank input counts as not entered", () => {
    expect(recipientOf(q, "   ").severity).toBe("unknown");
  });
  it("an unknown destination network can't be compared (fail closed)", () => {
    const res = run(q, { ...sendArb, expectedRecipient: DOCS_REFUND }, { tokens: FRESH_TOKENS.filter((t) => t.assetId !== ASSETS.baseUsdc) });
    expect(check(res, "recipient").headline).toBe("Receiving network unknown");
    expect(res.verdict).not.toBe("safe");
  });
});

describe("intents, confidential and forwarded recipients", () => {
  it("INTENTS recipients compare with the NEAR Intents account exactly", () => {
    const q = quoteTo({ destinationAsset: ASSETS.baseUsdc, recipient: "fake-user.near", recipientType: "INTENTS" });
    const c = recipientOf(q, "fake-user.near");
    expect(c.severity).toBe("pass");
    expect(c.message).toContain("inside NEAR Intents");
    expect(recipientOf(q, "fake-other.near").severity).toBe("block");
  });
  it("INTENTS recipients block when the user expects a destination network", () => {
    const q = quoteTo({ destinationAsset: ASSETS.baseUsdc, recipient: "fake-user.near", recipientType: "INTENTS" });
    const c = recipientOf(q, "fake-user.near", "base");
    expect(c.severity).toBe("block");
    expect(c.message).toContain("delivers to a NEAR Intents account");
  });
  it("CONFIDENTIAL_INTENTS recipients can't be compared (unknown, never Safe)", () => {
    const q = quoteTo({ destinationAsset: ASSETS.baseUsdc, recipient: "fake-user.near", recipientType: "CONFIDENTIAL_INTENTS" });
    const res = run(q, { ...sendArb, expectedRecipient: "fake-user.near" });
    expect(check(res, "recipient").severity).toBe("unknown");
    expect(res.verdict).not.toBe("safe");
  });
  it("a virtual-chain recipient is the address that must match", () => {
    const v = "0x3333333333333333333333333333333333333333";
    const q = quoteTo({ destinationAsset: "nep141:wrap.near", recipient: "fake-relay.near" }, { virtualChainRecipient: v });
    expect(recipientOf(q, v.toUpperCase().replace("0X", "0x")).severity).toBe("pass");
    expect(recipientOf(q, "fake-relay.near").headline).toBe("Final receiver not confirmed");
    expect(recipientOf(q, "0x4444444444444444444444444444444444444444").severity).toBe("block");
  });
  it("a custom recipient message means the final receiver can't be confirmed", () => {
    const q = quoteTo({ destinationAsset: ASSETS.baseUsdc, recipient: DOCS_REFUND }, { customRecipientMsg: "fake-msg" });
    expect(recipientOf(q, DOCS_REFUND).severity).toBe("unknown");
  });
});

describe("Safe needs a recipient match", () => {
  it("recipient is a required check", () => expect(REQUIRED_CHECKS).toContain("recipient"));
  it("no recipient outcome other than a match can produce Safe", () => {
    const q = quoteTo({ destinationAsset: ASSETS.baseUsdc, recipient: DOCS_REFUND });
    const variants = [undefined, "   ", "0x1111111111111111111111111111111111111111", "0x2527000000000000000000000000000000a0f10D"];
    for (const v of variants) expect(run(q, { ...sendArb, ...(v === undefined ? {} : { expectedRecipient: v }) }).verdict).not.toBe("safe");
    expect(run(q, { ...sendArb, expectedRecipient: DOCS_REFUND, expectedDestinationChain: "arb" }).verdict).toBe("block");
    expect(run(q, { ...sendArb, expectedRecipient: DOCS_REFUND }).verdict).toBe("safe");
  });
  it("labels claim only what was checked", () => {
    expect(VERDICT_LABEL).toEqual({ safe: "Checks passed", check: "Check this", block: "Don't send" });
    for (const word of ["signed", "unused", "time left", "network", "token", "amount", "receiving address", "own wallet", "does not check delivery"]) expect(SAFE_DEFINITION).toContain(word);
    expect(SAFE_DEFINITION).not.toMatch(/guarantee|safe to send/i);
  });
});
