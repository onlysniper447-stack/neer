import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const tools = readFileSync(new URL("../app/(product)/tools/page.tsx", import.meta.url), "utf8");

describe("available tools", () => {
  it("lists only the three implemented routes, with no promised future capabilities", () => {
    expect([...tools.matchAll(/href: "([^"]+)"/g)].map((m) => m[1]!)).toEqual(["/check", "/track", "/tools/address"]);
    expect(tools).not.toMatch(/Refund helper|Signed verdicts|Coming later|when to expect|const LATER/);
  });

  it("states the limits of tracking and address checks", () => {
    expect(tools).toContain("status reported by NEAR Intents");
    expect(tools).toContain("does not independently confirm delivery or refunds");
    expect(tools).toContain("does not prove the network, ownership or account existence");
    const descriptions = [...tools.matchAll(/text: "([^"]+)"/g)].map((m) => m[1]!);
    expect(descriptions).toHaveLength(3);
    expect(descriptions.every((text) => text.split(/\s+/).length < 30)).toBe(true);
  });
});
