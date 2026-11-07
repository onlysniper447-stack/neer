import { expect, test } from "@playwright/test";

test("approved homepage has the supplied logo and no product menu or example check", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Neer home" }).locator("img")).toHaveAttribute("src", /neer-logo/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Check whether your deposit details");
  const depositCta = page.getByRole("main").getByRole("link", { name: "Check a deposit", exact: true });
  await expect(depositCta).toHaveAccessibleName("Check a deposit");
  await expect(depositCta).toHaveAttribute("aria-label", "Check a deposit");
  await expect(depositCta.locator("svg")).toHaveAttribute("aria-hidden", "true");
  await expect(page.getByRole("button", { name: "Open menu" })).toHaveCount(0);
  await expect(page.getByLabel("Deposit address")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Neer flags mismatches that need your attention." })).toBeVisible();
  await expect(page.getByText("Built for NEAR Hackathon 2026", { exact: true })).toBeVisible();
  await expect(page.getByText("Independent project, not affiliated with NEAR Foundation.", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Neer cannot recover funds after you send a transfer." })).toBeVisible();
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "Privacy", exact: true })).toHaveAttribute("href", "/privacy");
  await expect(page).toHaveTitle("Neer | Review before sending");
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "Tools", exact: true })).toHaveAttribute("href", "/tools");
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "Resources", exact: true })).toHaveAttribute("href", "/resources");
});

test("homepage actions reach the instructions and working deposit entry", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "How it works", exact: true }).click();
  await expect(page).toHaveURL(/#how-it-works$/);
  await expect(page.getByRole("heading", { name: "Review the findings before deciding whether to send.", exact: true })).toBeInViewport();
  await page.getByRole("link", { name: "Check a deposit", exact: true }).click();
  await expect(page).toHaveURL(/\/check$/);
  await expect(page.getByLabel("Deposit address")).toBeVisible();
  await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
});

test("privacy explains server caching, localStorage and IP-based rate limiting", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("contentinfo").getByRole("link", { name: "Privacy", exact: true }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole("main")).toContainText("Tracker lookups are cached in server memory, keyed by address and memo.");
  await expect(page.getByRole("main")).toContainText("When Upstash Redis is configured, that key is sent to Upstash.");
  await expect(page.getByRole("main")).toContainText("first and latest check times");
  await expect(page.getByRole("main")).toContainText("theme preference in localStorage");
});
