import { expect, test, type Page } from "@playwright/test";

const SECTIONS = [
  { name: "Tools", path: "/tools", h1: "Everything you can check with Neer" },
  { name: "Analytics", path: "/analytics", h1: "Live numbers, no estimates" },
  { name: "API", path: "/developers", h1: "Neer API" },
  { name: "Resources", path: "/resources", h1: "How Neer keeps a deposit safe" },
] as const;

const menuButton = (page: Page) => page.getByRole("button", { name: "Open menu" });
const menu = (page: Page) => page.getByRole("dialog", { name: "Neer menu" });

test("the menu button sits top left, before the logo, with the theme toggle on the right", async ({ page }) => {
  await page.goto("/");
  const btn = await menuButton(page).boundingBox();
  const logo = await page.getByRole("link", { name: "Neer home" }).boundingBox();
  const theme = await page.getByRole("button", { name: /theme/i }).boundingBox();
  expect(btn && logo && theme).toBeTruthy();
  expect(btn!.x).toBeLessThan(logo!.x);
  expect(btn!.x).toBeLessThan(40);
  expect(theme!.x).toBeGreaterThan(logo!.x);
  expect(btn!.width).toBeGreaterThanOrEqual(44);
  expect(btn!.height).toBeGreaterThanOrEqual(44);
});

test("opens with a click and closes with the close button, returning focus", async ({ page }) => {
  await page.goto("/");
  await expect(menuButton(page)).toHaveAttribute("aria-expanded", "false");
  await menuButton(page).click();
  await expect(menu(page)).toBeVisible();
  // The page behind the open drawer is hidden from assistive tech, so find the button by test id.
  await expect(page.getByTestId("menu-button")).toHaveAttribute("aria-expanded", "true");
  const nav = menu(page).getByRole("navigation", { name: "Main" });
  for (const s of SECTIONS) await expect(nav.getByRole("link", { name: new RegExp(`^${s.name}\\b`) })).toBeVisible();
  for (const t of ["Deposit preflight", "Swap tracker", "Address checker"]) await expect(nav.getByRole("link", { name: t })).toBeVisible();
  await menu(page).getByRole("button", { name: "Close menu" }).click();
  await expect(menu(page)).toBeHidden();
  await expect(menuButton(page)).toBeFocused();
});

test("Esc closes the menu", async ({ page }) => {
  await page.goto("/resources");
  await menuButton(page).click();
  await expect(menu(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu(page)).toBeHidden();
  await expect(menuButton(page)).toBeFocused();
});

test("keyboard only: Tab to the button, Enter opens, focus stays trapped, Esc closes", async ({ page }) => {
  await page.goto("/tools");
  await page.keyboard.press("Tab"); // skip link
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(menuButton(page)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(menu(page)).toBeVisible();
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press("Tab");
    const inside = await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));
    expect(inside).toBe(true);
  }
  await page.keyboard.press("Shift+Tab");
  expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(menu(page)).toBeHidden();
  await expect(menuButton(page)).toBeFocused();
});

test("the current page is marked in the menu", async ({ page }) => {
  await page.goto("/tools/address");
  await menuButton(page).click();
  await expect(menu(page).getByRole("link", { name: "Address checker" })).toHaveAttribute("aria-current", "page");
});

for (const s of SECTIONS) {
  test(`menu → ${s.name} opens ${s.path} and closes the drawer`, async ({ page }) => {
    await page.goto("/");
    await menuButton(page).click();
    await menu(page).getByRole("navigation", { name: "Main" }).getByRole("link", { name: new RegExp(`^${s.name}\\b`) }).click();
    await page.waitForURL(`**${s.path}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(s.h1);
    await expect(menu(page)).toBeHidden();
  });
}
