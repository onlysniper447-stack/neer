import { expect, type Page } from "@playwright/test";

export const MOCK = "http://127.0.0.1:4010";

export async function pasteAddress(page: Page, address: string, memo?: string) {
  await page.goto("/");
  await page.getByLabel("Deposit address").fill(address);
  if (memo !== undefined) {
    await page.getByRole("button", { name: "+ This swap has a memo" }).click();
    await page.getByLabel("Memo", { exact: true }).fill(memo);
  }
  await page.getByRole("button", { name: "Check address" }).click();
  await page.waitForURL(/\/check\?/);
}

export async function describeSend(page: Page, opts: { network: string; asset: string; amount: string; source?: "My own wallet" | "An exchange"; memo?: string }) {
  await page.getByRole("radiogroup", { name: "Network" }).getByText(opts.network, { exact: true }).click();
  await page.getByLabel("Token").selectOption(opts.asset);
  await page.getByLabel("Amount you'll send").fill(opts.amount);
  if (opts.memo !== undefined) await page.getByLabel("Memo you'll add").fill(opts.memo);
  await page.getByText(opts.source ?? "My own wallet", { exact: true }).click();
  await page.getByRole("button", { name: "Run checks" }).click();
  await expect(page.getByTestId("result")).toBeVisible();
}
