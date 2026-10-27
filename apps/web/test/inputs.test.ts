import { describe, expect, it } from "vitest";
import { MemoSchema, PastedAddressSchema } from "@/lib/inputs";

describe("PastedAddressSchema", () => {
  it.each([
    "0xDF7A93d400159d0f8f40AAe42576d01285EA9e39",
    "GCEDFGXHWR3Z3FFK5UEIUYTF6FUZUBHSJLUBC6X5VG3RPRRJYNI2UQNR",
    "EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2",
    "UQBvW8Z5huBkMJYdnfAEM5JqTNkuWX3diqYENkWsIL0XggGG/+=",
    "alice.near",
    "  0xDF7A93d400159d0f8f40AAe42576d01285EA9e39  ",
  ])("accepts %s", (a) => {
    expect(PastedAddressSchema.safeParse(a).success).toBe(true);
  });

  it("trims surrounding whitespace", () => {
    expect(PastedAddressSchema.parse(" 0xabc ")).toBe("0xabc");
  });

  it.each([
    ["inner space", "0xDF7A93d4 00159d0f8f40AAe42576d01285EA9e39"],
    ["zero-width space", "0xDF7A93d400159d0f8f40AAe4\u200b2576d01285EA9e39"],
    ["Cyrillic a", "0xDF7\u043093d400159d0f8f40AAe42576d01285EA9e39"],
    ["URL", "https://evil.example/0xDF7A"],
    ["too short", "0x"],
    ["too long", "0x" + "a".repeat(200)],
    ["HTML", "<script>"],
  ])("refuses %s", (_, a) => {
    expect(PastedAddressSchema.safeParse(a).success).toBe(false);
  });
});

describe("MemoSchema", () => {
  it("accepts digits and printable ASCII", () => {
    expect(MemoSchema.parse("4207198")).toBe("4207198");
    expect(MemoSchema.parse("ABC-12_x")).toBe("ABC-12_x");
  });
  it("refuses spaces inside, control and non-ASCII characters", () => {
    expect(MemoSchema.safeParse("42 07").success).toBe(false);
    expect(MemoSchema.safeParse("42\u000a07").success).toBe(false);
    expect(MemoSchema.safeParse("４２").success).toBe(false);
  });
});
