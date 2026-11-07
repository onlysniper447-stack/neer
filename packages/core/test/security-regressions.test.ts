import { describe, expect, it } from "vitest";
import { base64urlnopad, bech32, bech32m } from "@scure/base";
import { ASSETS, TEST_PUBLIC_KEY, arbUsdc, makeStatus } from "../../../fixtures/src/scenarios.js";
import { DEFAULT_RULES, DeclaredTransferSchema, crc16xmodem, parseAmount, preflight, validateAddress } from "../src/index.js";
import { FRESH_TOKENS, NOW, check, found, run } from "./helpers.js";

const send = { chain: "arb", asset: ASSETS.arbUsdc, amount: "5000000", source: "wallet" as const };

describe("security regression cases", () => {
  it("never passes a same-symbol asset ID from a different network", () => {
    const result = run(arbUsdc(NOW), { ...send, asset: ASSETS.baseUsdc });
    expect(result.verdict).not.toBe("safe");
    expect(check(result, "token").severity).toBe("block");
  });

  it("does not ignore an unrecognized wallet or transaction chain ID", () => {
    const result = run(arbUsdc(NOW), { ...send, chainId: 123456789 });
    expect(result.verdict).not.toBe("safe");
    expect(check(result, "network").severity).toBe("unknown");
  });

  it.each(["1,5", "1 5", "1_5", "1.2,3", "1,,000"])("rejects ambiguous amount notation %s", (value) => {
    expect(() => parseAmount(value, 6)).toThrow();
  });

  it("rejects invalid Bitcoin witness versions and program lengths despite a correct checksum", () => {
    const words = bech32m.toWords(new Uint8Array(20));
    expect(validateAddress("btc", bech32m.encode("bc", [17, ...words])).status).toBe("invalid");
    expect(validateAddress("btc", bech32.encode("bc", [0, ...bech32.toWords(new Uint8Array(2))])).status).toBe("invalid");
  });
});

it("never applies stale minimum thresholds as current rules", () => {
  const qr = arbUsdc(NOW, { originAsset: ASSETS.bscUsdt, amountInUsd: "5" });
  const result = preflight({ depositAddress: qr.quote.depositAddress!, transfer: DeclaredTransferSchema.parse(send), lookup: found(makeStatus(qr, "PENDING_DEPOSIT", NOW)), tokens: FRESH_TOKENS, now: NOW, quotePublicKey: TEST_PUBLIC_KEY, rules: { ...DEFAULT_RULES, minimums: { ...DEFAULT_RULES.minimums, checkedAt: "2026-01-01T00:00:00Z" } } });
  expect(check(result, "minimum").severity).toBe("unknown");
  expect(result.verdict).not.toBe("safe");
});

it("bounds integer inputs before constructing BigInts", () => {
  expect(DeclaredTransferSchema.safeParse({ ...send, amount: "1".repeat(257) }).success).toBe(false);
});

it("rejects raw TON workchains outside the signed byte range", () => {
  expect(validateAddress("ton", `256:${"0".repeat(64)}`).status).toBe("invalid");
});

it("rejects TON test-only addresses even with a correct checksum", () => {
  const bytes = base64urlnopad.decode("EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs");
  bytes[0] = bytes[0]! | 0x80;
  const crc = crc16xmodem(bytes.slice(0, 34));
  bytes[34] = crc >> 8;
  bytes[35] = crc & 255;
  expect(validateAddress("ton", base64urlnopad.encode(bytes)).status).toBe("invalid");
});
