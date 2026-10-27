import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { getAddress } from "viem";
import { addressKey, isXrpXAddress, looksAlike, sameAddress, shortAddress, validateAddress, xrpDestinationTag } from "../src/index.js";
import { STELLAR_ADDRESS, tronAddress } from "../../../fixtures/src/scenarios.js";

const CHECKSUMMED = "0x2527D02599Ba641c19FEa793cD0F167589a0f10D";

describe("EVM addresses", () => {
  it("accepts a correct EIP-55 address and normalizes it", () => {
    const v = validateAddress("eth", CHECKSUMMED);
    expect(v).toMatchObject({ status: "valid", normalized: CHECKSUMMED, noChecksum: false });
  });

  it("accepts all-lowercase but flags that it has no checksum", () => {
    const v = validateAddress("base", CHECKSUMMED.toLowerCase());
    expect(v).toMatchObject({ status: "valid", normalized: CHECKSUMMED, noChecksum: true });
  });

  it("rejects a mixed-case address with a broken checksum", () => {
    const broken = CHECKSUMMED.replace("D02599Ba", "D02599bA");
    expect(validateAddress("eth", broken).status).toBe("invalid");
  });

  it("rejects wrong length and non-hex", () => {
    expect(validateAddress("eth", "0x1234").status).toBe("invalid");
    expect(validateAddress("eth", "0xZZ27D02599Ba641c19FEa793cD0F167589a0f10D").status).toBe("invalid");
  });

  it("compares case-insensitively", () => {
    expect(sameAddress("eth", CHECKSUMMED, CHECKSUMMED.toLowerCase())).toBe(true);
  });

  it("property: every checksummed random address validates, and its lowercase form maps back to it", () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 20, maxLength: 20 }), (bytes) => {
        const hex = "0x" + Buffer.from(bytes).toString("hex");
        const cs = getAddress(hex);
        const v = validateAddress("arb", cs);
        expect(v.status).toBe("valid");
        expect(validateAddress("arb", hex).normalized).toBe(cs);
        expect(addressKey("arb", cs)).toBe(hex);
      }),
      { numRuns: 300 },
    );
  });

  it("property: flipping the case of one letter in a checksummed address is caught", () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 20, maxLength: 20 }), fc.nat(), (bytes, pick) => {
        const cs = getAddress("0x" + Buffer.from(bytes).toString("hex"));
        const letters = [...cs.slice(2)].map((ch, i) => ({ ch, i: i + 2 })).filter((x) => /[a-fA-F]/.test(x.ch));
        const body = cs.slice(2);
        const oneCase = body === body.toLowerCase() || body === body.toUpperCase();
        fc.pre(letters.length > 1 && !oneCase);
        const { ch, i } = letters[pick % letters.length]!;
        const flipped = cs.slice(0, i) + (ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase()) + cs.slice(i + 1);
        const fb = flipped.slice(2);
        fc.pre(fb !== fb.toLowerCase() && fb !== fb.toUpperCase());
        expect(validateAddress("eth", flipped).status).toBe("invalid");
      }),
      { numRuns: 300 },
    );
  });
});

describe("lookalikes", () => {
  it("detects same first 4 and last 4 with a different middle", () => {
    const fake = "0x2527" + "0".repeat(32) + "f10D";
    expect(looksAlike("eth", CHECKSUMMED, fake)).toBe(true);
  });
  it("is false for the same address in different case", () => {
    expect(looksAlike("eth", CHECKSUMMED, CHECKSUMMED.toLowerCase())).toBe(false);
  });
  it("is false for clearly different addresses", () => {
    expect(looksAlike("eth", CHECKSUMMED, "0xDF7A93d400159d0f8f40AAe42576d01285EA9e39")).toBe(false);
  });
  it("shortens for display", () => {
    expect(shortAddress(CHECKSUMMED)).toBe("0x2527…f10D");
  });
});

describe("non-EVM formats", () => {
  it("Solana: base58 32 bytes", () => {
    expect(validateAddress("sol", "13QkxhNMrTPxoCkRdYdJ65tFuwXPhL5gLS2Z5Nr6gjRK").status).toBe("valid");
    expect(validateAddress("sol", "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v").status).toBe("valid");
    expect(validateAddress("sol", "0x2527D02599Ba641c19FEa793cD0F167589a0f10D").status).toBe("invalid");
    expect(validateAddress("sol", "13QkxhNMrTPxoCkRdYdJ65tFuwXP").status).toBe("invalid");
    expect(validateAddress("sol", "13QkxhNMrTPxoCkRdYdJ65tFuwXPhL5gLS2Z5Nr6gjR0").status).toBe("invalid"); // 0 is not base58
    // Solana addresses have no checksum: dropping one character can still decode to 32 bytes.
    // That is why the exact-match (lookalike) check, not the format check, protects Solana sends.
  });

  it("Tron: base58check with 0x41 prefix", () => {
    expect(validateAddress("tron", "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t").status).toBe("valid");
    expect(validateAddress("tron", tronAddress("x")).status).toBe("valid");
    expect(validateAddress("tron", "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6u").status).toBe("invalid");
    expect(validateAddress("tron", "0x2527D02599Ba641c19FEa793cD0F167589a0f10D").status).toBe("invalid");
  });

  it("Stellar: StrKey G… with CRC16", () => {
    expect(validateAddress("stellar", "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN").status).toBe("valid");
    expect(validateAddress("stellar", STELLAR_ADDRESS).status).toBe("valid");
    expect(validateAddress("stellar", "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVM").status).toBe("invalid");
    expect(validateAddress("stellar", "SA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN").status).toBe("invalid");
  });

  it("XRP: classic r… with checksum, X-addresses, destination tags", () => {
    expect(validateAddress("xrp", "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh").status).toBe("valid");
    expect(validateAddress("xrp", "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTi").status).toBe("invalid");
    expect(xrpDestinationTag("rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh?dt=12345")).toBe("12345");
    expect(xrpDestinationTag("rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh:12345")).toBe("12345");
    expect(xrpDestinationTag("rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh")).toBeUndefined();
    expect(isXrpXAddress("X7AcgcsBL6XDcUb289X4mJ8djcdyKaB5hJDWMArnXr61cqZ")).toBe(true);
    expect(isXrpXAddress("X7AcgcsBL6XDcUb289X4mJ8djcdyKaB5hJDWMArnXr61cqY")).toBe(false);
  });

  it("TON: user-friendly base64url and raw forms normalize to the same account", () => {
    const friendly = validateAddress("ton", "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs");
    expect(friendly.status).toBe("valid");
    expect(friendly.normalized).toMatch(/^0:[0-9a-f]{64}$/);
    expect(validateAddress("ton", friendly.normalized!).normalized).toBe(friendly.normalized);
    expect(validateAddress("ton", "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDt").status).toBe("invalid");
  });

  it("Bitcoin: bech32, bech32m and base58check", () => {
    expect(validateAddress("btc", "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq").status).toBe("valid");
    expect(validateAddress("btc", "bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3297").status).toBe("valid");
    expect(validateAddress("btc", "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa").status).toBe("valid");
    expect(validateAddress("btc", "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdx").status).toBe("invalid");
  });

  it("NEAR: named and implicit accounts", () => {
    expect(validateAddress("near", "alice.near").status).toBe("valid");
    expect(validateAddress("near", "a".repeat(64).replace(/a/g, "f")).status).toBe("valid");
    expect(validateAddress("near", "Alice.near").status).toBe("invalid");
  });

  it("marks chains we do not validate as unsupported, never valid", () => {
    expect(validateAddress("aptos", "0x1").status).toBe("unsupported");
    expect(validateAddress("some-new-chain", "abc").status).toBe("unsupported");
  });
});
