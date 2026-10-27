import { expect, test } from "@playwright/test";
import { E2E_ADDRESSES } from "@neer/fixtures/scenarios";
import { MOCK } from "./helpers";

test.beforeEach(async ({ request }) => {
  await request.post(`${MOCK}/__reset`);
});

test("tracker follows a deposit from waiting to delivered, then stops polling", async ({ page }) => {
  const calls: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/v1/track")) calls.push(r.url());
  });
  await page.goto(`/track?address=${E2E_ADDRESSES.progress}`);
  const tracker = page.getByTestId("tracker");
  await expect(tracker).toHaveAttribute("data-status", "PENDING_DEPOSIT");
  await expect(tracker).toHaveAttribute("data-status", "KNOWN_DEPOSIT_TX", { timeout: 15_000 });
  await expect(page.getByRole("link", { name: /Open/ }).first()).toHaveAttribute("href", /^https:\/\/arbiscan\.io\/tx\//);
  await expect(tracker).toHaveAttribute("data-status", "PROCESSING", { timeout: 15_000 });
  await expect(tracker).toHaveAttribute("data-status", "SUCCESS", { timeout: 15_000 });
  await expect(page.getByTestId("verdict")).toHaveAttribute("data-tone", "safe");
  await expect(page.locator('[data-step="outcome"]')).toHaveAttribute("data-state", "done");
  const settled = calls.length;
  await page.waitForTimeout(7_000);
  expect(calls.length).toBe(settled);
});

test("tracker for an unknown address says don't send", async ({ page }) => {
  await page.goto(`/track?address=${E2E_ADDRESSES.notFound}`);
  await expect(page.getByTestId("tracker")).toHaveAttribute("data-status", "NOT_FOUND");
  await expect(page.getByTestId("verdict-headline")).toHaveText("We can't find this quote");
});

test("tracker keeps trying when 1Click is down", async ({ page }) => {
  await page.goto(`/track?address=${E2E_ADDRESSES.upstreamDown}`);
  await expect(page.getByText("Can't check right now. NEAR Intents didn't answer.")).toBeVisible();
});
