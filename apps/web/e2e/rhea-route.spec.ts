import { expect, test, type Page } from "@playwright/test";

const RHEA_MOCK = "http://127.0.0.1:4011";
const BASE_USDC_ASSET = "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near";
const READ_ONLY = new Set(["/get_chain_prices", "/api/swap/supported_to_tokens", "/api/v2/swap/quote"]);

async function rheaCalls(page: Page): Promise<{ method: string; path: string; auth: boolean }[]> {
  return (await page.request.get(`${RHEA_MOCK}/__calls`)).json();
}

test.beforeEach(async ({ page }) => {
  await page.request.post(`${RHEA_MOCK}/__reset`);
});

test("tools page links to the RHEA route estimate", async ({ page }) => {
  await page.goto("/tools");
  await page.getByRole("link", { name: /RHEA route estimate/ }).click();
  await expect(page).toHaveURL(/\/tools\/rhea-route$/);
  await expect(page.getByRole("heading", { level: 1, name: "RHEA route estimate" })).toBeVisible();
});

test("the /check menu has one RHEA link; the footer does not", async ({ page }) => {
  await page.goto("/check");
  await page.getByTestId("menu-button").click();
  await expect(page.getByTestId("menu").getByRole("link", { name: "RHEA route estimate" })).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "RHEA route estimate" })).toHaveCount(0);
});

test("the homepage has no RHEA link and no menu", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("menu-button")).toHaveCount(0);
  await expect(page.getByText(/RHEA/)).toHaveCount(0);
});

test("asks for a sender address instead of inventing one", async ({ page }) => {
  await page.goto("/tools/rhea-route");
  await expect(page.getByLabel("Token you send")).toHaveValue("0x833589fcd6edb6e08f4c7c32d4f71b54bda02913");
  await page.getByLabel("Amount you send").fill("10");
  await page.getByRole("button", { name: "Get RHEA estimate" }).click();
  await expect(page.getByTestId("rhea-error")).toContainText("Enter the public address you would send from");
  expect((await rheaCalls(page)).some((c) => c.path === "/api/v2/swap/quote")).toBe(false);
});

test("shows RHEA's estimate and prefills a Neer check without an address", async ({ page }) => {
  await page.goto("/tools/rhea-route");
  await expect(page.getByLabel("Token you send")).toHaveValue("0x833589fcd6edb6e08f4c7c32d4f71b54bda02913");
  await expect(page.getByLabel("Token you receive")).not.toHaveValue("");
  await page.getByLabel("Amount you send").fill("10");
  await page.getByLabel("Your source address (public, optional)").fill("0x000000000000000000000000000000000000dEaD");
  await page.getByLabel("Destination address (public, optional)").fill("neer-demo.near");
  await page.getByRole("button", { name: "Get RHEA estimate" }).click();

  const quote = page.getByTestId("rhea-quote");
  await expect(quote).toBeVisible();
  await expect(page.getByTestId("rhea-router")).toHaveText("nearintents");
  await expect(page.getByTestId("rhea-amount-in")).toHaveText("10 USDC on Base");
  await expect(page.getByTestId("rhea-estimated")).toHaveText("9.95 USDC on NEAR");
  await expect(page.getByTestId("rhea-minimum")).toHaveText("9.90025 USDC");
  await expect(quote).toContainText("It can change or expire before you swap.");
  const trade = quote.getByRole("link", { name: /RHEA's trade app/ });
  await expect(trade).toHaveAttribute("href", "https://x.rhea.finance/en/trade");
  await expect(trade).toHaveAttribute("target", "_blank");
  await expect(trade).toHaveAttribute("rel", "noopener noreferrer");

  // No remote images anywhere on the page.
  for (const src of await page.locator("img").evaluateAll((imgs) => imgs.map((i) => (i as HTMLImageElement).src))) {
    expect(new URL(src).origin).toBe(new URL(page.url()).origin);
  }

  await page.getByTestId("rhea-check-link").click();
  await page.waitForURL(/\/check\?/);
  const url = new URL(page.url());
  expect([...url.searchParams.keys()]).toEqual(["network", "token", "amount"]);
  expect(url.searchParams.get("network")).toBe("base");
  expect(url.searchParams.get("token")).toBe(BASE_USDC_ASSET);
  expect(url.searchParams.get("amount")).toBe("10");
  await expect(page.getByLabel("Deposit address")).toHaveValue("");
  await expect(page.getByLabel("Sending network ID")).toHaveValue("base");
  await expect(page.getByLabel("Token asset ID")).toHaveValue(BASE_USDC_ASSET);
  await expect(page.getByLabel("Amount in human units")).toHaveValue("10");
  await expect(page.getByTestId("deep-link-check").getByRole("alert")).toHaveText("Paste the deposit address from your swap app into Deposit address, review the other details, then run checks.");

  const calls = await rheaCalls(page);
  expect(calls.every((c) => READ_ONLY.has(c.path))).toBe(true);
  expect(calls.filter((c) => c.path === "/api/v2/swap/quote")).toEqual([{ method: "POST", path: "/api/v2/swap/quote", auth: true }]);
  expect(calls.filter((c) => c.path !== "/api/v2/swap/quote").every((c) => !c.auth)).toBe(true);
});

test("a non-NEAR Intents route offers no Neer check", async ({ page }) => {
  await page.goto("/tools/rhea-route");
  await expect(page.getByLabel("Token you send")).toHaveValue("0x833589fcd6edb6e08f4c7c32d4f71b54bda02913");
  await page.getByLabel("Amount you send").fill("1");
  await page.getByLabel("Your source address (public, optional)").fill("0x0000000000000000000000000000000000001111");
  await page.getByRole("button", { name: "Get RHEA estimate" }).click();
  await expect(page.getByTestId("rhea-router")).toHaveText("lifi");
  await expect(page.getByTestId("rhea-check-link")).toHaveCount(0);
  await expect(page.getByTestId("rhea-check-note")).toContainText("Neer checks NEAR Intents deposit addresses only");
});

test("RHEA API routes refuse cross-site requests", async ({ request }) => {
  const res = await request.post("/api/v1/rhea/quote", { headers: { Origin: "https://evil.example" }, data: {} });
  expect(res.status()).toBe(403);
  expect(res.headers()["access-control-allow-origin"]).toBeUndefined();
});
