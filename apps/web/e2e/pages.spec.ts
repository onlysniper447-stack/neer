import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { ASSETS, E2E_ADDRESSES, TOKENS } from "@neer/fixtures/scenarios";
import { describeSend, pasteAddress } from "./helpers";

/** Every page in the menu plus the core flows. */
const PAGES = [
  { path: "/", h1: "Check before you send." },
  { path: "/tools", h1: "Everything you can check with Neer" },
  { path: "/tools/address", h1: "Address checker" },
  { path: "/track", h1: "Swap tracker" },
  { path: "/analytics", h1: "Live numbers, no estimates" },
  { path: "/developers", h1: "Neer API" },
  { path: "/resources", h1: "How Neer keeps a deposit safe" },
] as const;

function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

async function axe(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"]).analyze();
  return results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")})`);
}

async function noHorizontalScroll(page: Page) {
  const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  expect(sw, `page is ${sw}px wide in a ${cw}px viewport`).toBeLessThanOrEqual(cw);
}

for (const p of PAGES) {
  test(`${p.path} renders with no console errors`, async ({ page }) => {
    const errors = watchConsole(page);
    const res = await page.goto(p.path);
    expect(res?.status()).toBe(200);
    expect(res?.headers()["content-security-policy"]).toMatch(/'nonce-/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(p.h1);
    await page.waitForLoadState("networkidle");
    expect(errors).toEqual([]);
  });

  test(`${p.path} has no horizontal scroll at 360px`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto(p.path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await noHorizontalScroll(page);
  });

  for (const scheme of ["light", "dark"] as const) {
    test(`${p.path} passes axe (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
      await page.goto(p.path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await axe(page)).toEqual([]);
    });
  }
}

for (const scheme of ["light", "dark"] as const) {
  test(`results and the open menu pass axe (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await pasteAddress(page, E2E_ADDRESSES.safe);
    expect(await axe(page), "send form").toEqual([]);
    await describeSend(page, { network: "Arbitrum", asset: ASSETS.arbUsdc, amount: "5" });
    expect(await axe(page), "safe result").toEqual([]);
    await pasteAddress(page, E2E_ADDRESSES.issue382);
    await describeSend(page, { network: "Base", asset: ASSETS.baseEth, amount: "0.17" });
    await expect(page.getByTestId("result")).toHaveAttribute("data-verdict", "block");
    expect(await axe(page), "block result").toEqual([]);
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(page.getByRole("dialog", { name: "Neer menu" })).toBeVisible();
    expect(await axe(page), "menu").toEqual([]);
  });
}

test("result page has no horizontal scroll at 360px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await pasteAddress(page, E2E_ADDRESSES.issue382);
  await noHorizontalScroll(page);
  await describeSend(page, { network: "Base", asset: ASSETS.baseEth, amount: "0.17" });
  await noHorizontalScroll(page);
});

test("address checker: checksum, canonical form and lookalike compare", async ({ page }) => {
  await page.goto("/tools/address");
  await page.getByLabel("Address", { exact: true }).fill("0x2527d02599ba641c19fea793cd0f167589a0f10d");
  await page.getByRole("button", { name: "Check address" }).click();
  const evm = page.getByTestId("match-evm");
  await expect(evm).toContainText("No checksum");
  await expect(evm.getByTestId("normalized")).toHaveText("0x2527D02599Ba641c19FEa793cD0F167589a0f10D");
  await expect(evm).toContainText("Base");

  await page.getByLabel("Compare with").fill("0x2527000000000000000000000000000000a0f10d");
  await page.getByRole("button", { name: "Check address" }).click();
  await expect(page.getByTestId("compare-result")).toHaveAttribute("data-kind", "lookalike");

  await page.getByLabel("Address", { exact: true }).fill("0x2527d02599Ba641c19FEa793cD0F167589a0f10D");
  await page.getByRole("button", { name: "Check address" }).click();
  await expect(page.getByTestId("address-invalid")).toContainText("checksum");
});

test("analytics shows the live token list counts and the rules catalog", async ({ page }) => {
  await page.goto("/analytics");
  await expect(page.getByTestId("stat-tokens")).toHaveText(String(TOKENS.length));
  await expect(page.getByTestId("stat-networks")).toHaveText(String(new Set(TOKENS.map((t) => t.blockchain)).size));
  await expect(page.getByTestId("rule-network")).toContainText("Can block");
  await expect(page.getByTestId("rule-incident")).toContainText("Note only");
});

test("local stats count this browser's checks and can be cleared", async ({ page }) => {
  await page.goto("/analytics");
  await expect(page.getByTestId("local-stats")).toContainText("No checks from this browser yet");
  await pasteAddress(page, E2E_ADDRESSES.safe);
  await describeSend(page, { network: "Arbitrum", asset: ASSETS.arbUsdc, amount: "5" });
  await page.goto("/analytics");
  await expect(page.getByTestId("local-total")).toHaveText("1");
  const stored = await page.evaluate(() => localStorage.getItem("neer:local-stats:v1") ?? "");
  expect(stored).not.toContain(E2E_ADDRESSES.safe.slice(2, 10));
  await page.getByRole("button", { name: "Clear these stats" }).click();
  await expect(page.getByTestId("local-stats")).toContainText("No checks from this browser yet");
});

test("API docs: try-it calls the real endpoint", async ({ page }) => {
  await page.goto("/developers");
  await page.getByRole("button", { name: "Send GET /api/v1/track" }).click();
  await expect(page.getByTestId("try-track-result")).toHaveAttribute("data-status", /^\d{3}$/);
  await expect(page.getByTestId("try-track-result")).toContainText("requestId");
  await page.getByRole("button", { name: "Send POST /api/v1/preflight" }).click();
  await expect(page.getByTestId("try-preflight-result")).toContainText('"verdict"');
});

test("resources links to the official sources", async ({ page }) => {
  await page.goto("/resources");
  const hrefs = await page.getByTestId("external-link").evaluateAll((els) => els.map((e) => e.getAttribute("href")));
  expect(hrefs).toEqual(
    expect.arrayContaining([
      "https://docs.near-intents.org",
      "https://near.com/support",
      "https://near.com/terms",
      "https://explorer.near-intents.org",
      "https://github.com/near/intents/issues/382",
    ]),
  );
  for (const a of await page.getByTestId("external-link").all()) {
    await expect(a).toHaveAttribute("rel", "noopener noreferrer");
  }
});

test("tools: coming-later items aren't links", async ({ page }) => {
  await page.goto("/tools");
  await expect(page.getByText("Refund helper")).toBeVisible();
  await expect(page.getByRole("link", { name: /Refund helper/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Deposit preflight/ }).first()).toHaveAttribute("href", "/");
});

test("swap tracker page: paste an address and track it", async ({ page, request }) => {
  await request.post("http://127.0.0.1:4010/__reset");
  await page.goto("/track");
  await page.getByLabel("Deposit address").fill(E2E_ADDRESSES.safe);
  await page.getByRole("button", { name: "Track deposit" }).click();
  await page.waitForURL(/\/track\?address=/);
  await expect(page.getByTestId("tracker")).toHaveAttribute("data-status", "PENDING_DEPOSIT");
});
