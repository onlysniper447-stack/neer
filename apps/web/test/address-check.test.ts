import { describe, expect, it } from "vitest";
import { analyzeAddress, compareAddresses, diffMask } from "../lib/address-check";

const EVM = "0x2527D02599Ba641c19FEa793cD0F167589a0f10D";

describe("analyzeAddress", () => {
  it("accepts a checksummed EVM address for every EVM network", () => {
    const r = analyzeAddress(EVM, null);
    expect(r.kind).toBe("valid");
    if (r.kind !== "valid") return;
    const evm = r.matches.find((m) => m.family === "evm")!;
    expect(evm.checksum.state).toBe("ok");
    expect(evm.networks).toContain("Base");
    expect(evm.networks).toContain("Ethereum");
  });

  it("flags a lowercase EVM address as carrying no checksum, and gives the checksummed form", () => {
    const r = analyzeAddress(EVM.toLowerCase(), "eth");
    expect(r.kind).toBe("valid");
    if (r.kind !== "valid") return;
    expect(r.matches[0]!.checksum.state).toBe("none");
    expect(r.matches[0]!.validation.normalized).toBe(EVM);
  });

  it("rejects a wrong EIP-55 checksum and says why", () => {
    const bad = EVM.replace("D02599", "d02599");
    const r = analyzeAddress(bad, null);
    expect(r.kind).toBe("invalid");
    if (r.kind !== "invalid") return;
    expect(r.reasons.find((x) => x.label === "EVM")?.reason).toMatch(/checksum/);
  });

  it("validates Solana, Tron and Stellar addresses", () => {
    expect(analyzeAddress("13QkxhNMrTPxoCkRdYdJ65tFuwXPhL5gLS2Z5Nr6gjRK", "sol").kind).toBe("valid");
    expect(analyzeAddress("TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf", null).kind).toBe("valid");
    expect(analyzeAddress("TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBg", "tron").kind).toBe("invalid");
  });

  it("refuses hidden characters instead of cleaning them", () => {
    expect(analyzeAddress(`0x2527\u200bD02599Ba641c19FEa793cD0F167589a0f10D`, null).kind).toBe("input-error");
    expect(analyzeAddress("https://evil.example/0x00", null).kind).toBe("input-error");
  });
});

describe("compareAddresses", () => {
  it("treats EVM case differences as the same address", () => {
    expect(compareAddresses("eth", EVM, EVM.toLowerCase())).toEqual({ kind: "same", caseOnly: true });
  });
  it("spots a poisoned lookalike (same first and last 4)", () => {
    expect(compareAddresses("eth", EVM, "0x2527000000000000000000000000000000a0f10D")).toEqual({ kind: "lookalike" });
  });
  it("says different for unrelated addresses", () => {
    expect(compareAddresses("eth", EVM, "0x0000000000000000000000000000000000000001")).toEqual({ kind: "different" });
  });
  it("marks differing characters", () => {
    expect(diffMask("abcd", "abXd", false)).toEqual([false, false, true, false]);
    expect(diffMask("0xAb", "0xab", true)).toEqual([false, false, false, false]);
  });
});
