import { expect, test } from "@playwright/test";

test("approved homepage has the supplied logo and no product menu or example check", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Neer home" }).locator("img")).toHaveAttribute("src", /neer-logo/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Check the deposit.");
  await expect(page.getByRole("button", { name: "Open menu" })).toHaveCount(0);
  await expect(page.getByLabel("Deposit address")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Small mistakes. Stuck transfers." })).toBeVisible();
  await expect(page.getByText("Built for NEAR Hackathon 2026", { exact: true })).toBeVisible();
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "Tools", exact: true })).toHaveAttribute("href", "/tools");
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "Resources", exact: true })).toHaveAttribute("href", "/resources");
});

test("homepage actions reach the instructions and working deposit entry", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "How it works", exact: true }).click();
  await expect(page).toHaveURL(/#how-it-works$/);
  await expect(page.getByRole("heading", { name: "How Neer works", exact: true })).toBeInViewport();
  await page.getByRole("link", { name: "Check a deposit", exact: true }).click();
  await expect(page).toHaveURL(/\/check$/);
  await expect(page.getByLabel("Deposit address")).toBeVisible();
  await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
});
