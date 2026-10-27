import { describe, expect, it } from "vitest";
import { AmountError, formatAmount, formatUsd, parseAmount, parseUsdMicros } from "../src/index.js";

describe("parseAmount", () => {
  it("converts decimals to base units without floats", () => {
    expect(parseAmount("0.17", 18)).toBe(170000000000000000n);
    expect(parseAmount("5", 6)).toBe(5000000n);
    expect(parseAmount("5.000001", 6)).toBe(5000001n);
    expect(parseAmount("1,000.5", 6)).toBe(1000500000n);
    expect(parseAmount(".5", 6)).toBe(500000n);
    // 0.1 + 0.2 style float errors cannot happen
    expect(parseAmount("0.3", 18)).toBe(300000000000000000n);
  });
  it("rejects too many decimals, junk and negatives", () => {
    expect(() => parseAmount("5.0000001", 6)).toThrow(AmountError);
    expect(() => parseAmount("abc", 6)).toThrow(AmountError);
    expect(() => parseAmount("-1", 6)).toThrow(AmountError);
    expect(() => parseAmount("", 6)).toThrow(AmountError);
    expect(() => parseAmount("1e18", 18)).toThrow(AmountError);
  });
});

describe("formatAmount", () => {
  it("round-trips", () => {
    expect(formatAmount(170000000000000000n, 18)).toBe("0.17");
    expect(formatAmount(5000000n, 6)).toBe("5");
    expect(formatAmount(1n, 6)).toBe("0.000001");
    expect(formatAmount(12n, 0)).toBe("12");
  });
});

describe("USD", () => {
  it("parses decimal strings to micros and formats with cents", () => {
    expect(parseUsdMicros("390.838500000000")).toBe(390838500n);
    expect(parseUsdMicros("4.99707")).toBe(4997070n);
    expect(parseUsdMicros("abc")).toBeUndefined();
    expect(formatUsd(240_010_000n)).toBe("$240.01");
    expect(formatUsd(1_000_000_000n)).toBe("$1,000.00");
  });
});
