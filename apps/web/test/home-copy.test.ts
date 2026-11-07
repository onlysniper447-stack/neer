import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const home = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const privacy = readFileSync(new URL("../app/(product)/privacy/page.tsx", import.meta.url), "utf8");
const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
const plain = (text: string) => text.replace(/<[^>]*>/g, "").replace(/\{[^}]*\}/g, " ").trim();
const words = (text: string) => text.trim().split(/\s+/).length;

describe("published homepage and privacy copy", () => {
  it("keeps the title, description and hero distinct without delivery promises", () => {
    expect(layout).toContain('default: "Neer | Review before sending"');
    expect(layout).toContain("Understand quote mismatches and warnings before deciding whether to send funds.");
    expect(home).toContain("Check whether your deposit details");
    expect(home).toContain("match your quote.");
    expect(home).not.toMatch(/make your move|Your wallet\. Your decision\.|Stuck transfers|\[VERIFY\]/);
    expect(layout).not.toContain("so the money lands where you meant");
  });

  it("names actual compared fields and states the limits", () => {
    expect(home).toContain("deposit address, chosen network, token, amount and required memo");
    expect(home).toContain("quote’s origin network, not just a list of supported networks");
    expect(home).toContain("required input or minimum, depending on swap type");
    expect(home).toContain("expired quote returns “Don’t send”");
    expect(home).toContain("no result guarantees success");
    expect(home).toContain("Neer cannot recover funds after you send a transfer.");
    expect(home).toContain("do not verify the counterparty or guarantee delivery");
  });

  it("discloses caching, browser timestamps and theme, and Upstash IP keys", () => {
    expect(privacy).toContain("cached in server memory, keyed by address and memo");
    expect(privacy).toContain("reuse window is not a deletion deadline");
    expect(privacy).toContain("first and latest check times");
    expect(privacy).toContain("theme preference in localStorage");
    expect(privacy).toContain("When Upstash Redis is configured, that key is sent to Upstash");
    expect(privacy).toContain("Browser history and hosting or upstream request logs may retain those URLs");
    expect(home).toContain('href="/privacy"');
    expect(home).toContain("Independent project, not affiliated with NEAR Foundation.");
  });

  it("keeps new headings below 12 words and paragraphs below 30", () => {
    for (const source of [home, privacy]) {
      for (const match of source.matchAll(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/g)) {
        const heading = plain(match[1] ?? "");
        if (heading) expect(words(heading), heading).toBeLessThan(12);
      }
      for (const match of source.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)) {
        const paragraph = plain(match[1] ?? "");
        if (paragraph) expect(words(paragraph), paragraph).toBeLessThan(30);
      }
    }
  });
});
