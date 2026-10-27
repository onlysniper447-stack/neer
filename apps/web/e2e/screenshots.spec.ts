import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { ASSETS, E2E_ADDRESSES } from "@neer/fixtures/scenarios";
import { MOCK, describeSend, pasteAddress } from "./helpers";

/** Writes review screenshots to <repo>/screenshots. Run with `pnpm screenshots`. */
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../screenshots");

async function shot(page: Page, name: string) {
  await page.waitForTimeout(400); // let the reveal animation settle
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(scheme, () => {
    test.use({ colorScheme: scheme });

    test(`landing (${scheme})`, async ({ page }) => {
      await page.goto("/");
      await shot(page, `01-landing-${scheme}`);
    });

    test(`pass (${scheme})`, async ({ page }) => {
      await pasteAddress(page, E2E_ADDRESSES.safe);
      await shot(page, `02-describe-send-${scheme}`);
      await describeSend(page, { network: "Arbitrum", asset: ASSETS.arbUsdc, amount: "5" });
      await expect(page.getByTestId("result")).toHaveAttribute("data-verdict", "safe");
      await shot(page, `03-pass-${scheme}`);
    });

    test(`warn (${scheme})`, async ({ page }) => {
      await pasteAddress(page, E2E_ADDRESSES.warnExpiry);
      await describeSend(page, { network: "Arbitrum", asset: ASSETS.arbUsdc, amount: "5" });
      await expect(page.getByTestId("result")).toHaveAttribute("data-verdict", "check");
      await shot(page, `04-warn-near-expiry-${scheme}`);
    });

    test(`block #382 (${scheme})`, async ({ page }) => {
      await pasteAddress(page, E2E_ADDRESSES.issue382);
      await describeSend(page, { network: "Base", asset: ASSETS.baseEth, amount: "0.17" });
      await expect(page.getByTestId("result")).toHaveAttribute("data-verdict", "block");
      await shot(page, `05-block-issue382-${scheme}`);
    });

    test(`not found (${scheme})`, async ({ page }) => {
      await pasteAddress(page, E2E_ADDRESSES.notFound);
      await expect(page.getByTestId("verdict")).toBeVisible();
      await shot(page, `06-not-found-${scheme}`);
    });

    test(`tracker (${scheme})`, async ({ page, request }) => {
      await request.post(`${MOCK}/__reset`);
      await page.goto(`/track?address=${E2E_ADDRESSES.progress}`);
      const tracker = page.getByTestId("tracker");
      await expect(tracker).toHaveAttribute("data-status", "PENDING_DEPOSIT");
      await shot(page, `07-tracker-waiting-${scheme}`);
      await expect(tracker).toHaveAttribute("data-status", "PROCESSING", { timeout: 20_000 });
      await shot(page, `08-tracker-swapping-${scheme}`);
      await expect(tracker).toHaveAttribute("data-status", "SUCCESS", { timeout: 15_000 });
      await shot(page, `09-tracker-done-${scheme}`);
    });
  });
}
