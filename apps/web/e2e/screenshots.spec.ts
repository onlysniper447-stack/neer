import path from "node:path";
import { fileURLToPath } from "node:url";
import { devices, expect, test, type Page } from "@playwright/test";
import { ASSETS, E2E_ADDRESSES } from "@neer/fixtures/scenarios";
import { MOCK, describeSend, pasteAddress } from "./helpers";

/** Writes review screenshots to <repo>/screenshots/v2. Run with `pnpm --filter @neer/web screenshots`. */
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../screenshots/v2");

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { defaultBrowserType, ...pixel7 } = devices["Pixel 7"];
const FORMS = {
  mobile: pixel7,
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
} as const;

async function shot(page: Page, name: string, fullPage = true) {
  if (fullPage) await page.evaluate(() => window.scrollTo(0, 0)); // keep the sticky header at the top of full-page shots
  await page.waitForTimeout(450); // let the reveal animation settle
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage });
}

for (const form of ["mobile", "desktop"] as const) {
  for (const scheme of ["light", "dark"] as const) {
    test.describe(`${form} ${scheme}`, () => {
      test.use({ ...FORMS[form], colorScheme: scheme });
      const n = (id: string) => `${form}-${scheme}-${id}`;

      test("landing and menu", async ({ page }) => {
        await page.goto("/");
        await shot(page, n("01-landing"));
        await page.getByRole("button", { name: "Open menu" }).click();
        await expect(page.getByRole("dialog", { name: "Neer menu" })).toBeVisible();
        await shot(page, n("02-landing-menu-open"), false);
      });

      test("preflight results", async ({ page }) => {
        await pasteAddress(page, E2E_ADDRESSES.safe);
        await shot(page, n("03-describe-send"));
        await describeSend(page, { network: "Arbitrum", asset: ASSETS.arbUsdc, amount: "5" });
        await expect(page.getByTestId("result")).toHaveAttribute("data-verdict", "safe");
        await shot(page, n("04-result-pass"));

        await pasteAddress(page, E2E_ADDRESSES.warnExpiry);
        await describeSend(page, { network: "Arbitrum", asset: ASSETS.arbUsdc, amount: "5" });
        await expect(page.getByTestId("result")).toHaveAttribute("data-verdict", "check");
        await shot(page, n("05-result-warn"));

        await pasteAddress(page, E2E_ADDRESSES.issue382);
        await describeSend(page, { network: "Base", asset: ASSETS.baseEth, amount: "0.17" });
        await expect(page.getByTestId("result")).toHaveAttribute("data-verdict", "block");
        await shot(page, n("06-result-block"));
      });

      test("tracker", async ({ page, request }) => {
        await request.post(`${MOCK}/__reset`);
        await page.goto("/track");
        await shot(page, n("07-tracker-empty"));
        await page.goto(`/track?address=${E2E_ADDRESSES.progress}`);
        const tracker = page.getByTestId("tracker");
        await expect(tracker).toHaveAttribute("data-status", "PENDING_DEPOSIT");
        await shot(page, n("08-tracker-waiting"));
        await expect(tracker).toHaveAttribute("data-status", "SUCCESS", { timeout: 30_000 });
        await shot(page, n("09-tracker-done"));
      });

      test("menu pages", async ({ page }) => {
        await page.goto("/tools");
        await shot(page, n("10-tools"));
        await page.goto("/tools/address");
        await page.getByLabel("Address", { exact: true }).fill("0x2527d02599ba641c19fea793cd0f167589a0f10d");
        await page.getByLabel("Compare with").fill("0x2527000000000000000000000000000000a0f10d");
        await page.getByRole("button", { name: "Check address" }).click();
        await expect(page.getByTestId("compare-result")).toBeVisible();
        await shot(page, n("11-address-checker"));
        await page.goto("/analytics");
        await expect(page.getByTestId("stat-tokens")).toBeVisible();
        await shot(page, n("12-analytics"));
        await page.goto("/developers");
        await shot(page, n("13-api-docs"));
        await page.goto("/resources");
        await shot(page, n("14-resources"));
      });
    });
  }
}
