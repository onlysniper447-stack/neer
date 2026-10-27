import { expect, test } from "@playwright/test";
import { ASSETS, E2E_ADDRESSES } from "@neer/fixtures/scenarios";
import { describeSend, pasteAddress } from "./helpers";

test("matching send gets Safe to send, with exact amount and a tracker link", async ({ page }) => {
  await pasteAddress(page, E2E_ADDRESSES.safe);
  await expect(page.getByTestId("route")).toContainText("5 USDC on Arbitrum → 4.735314 USDC on Solana");
  await describeSend(page, { network: "Arbitrum", asset: ASSETS.arbUsdc, amount: "5" });
  await expect(page.getByTestId("result")).toHaveAttribute("data-verdict", "safe");
  await expect(page.getByTestId("verdict")).toContainText("Safe to send");
  await expect(page.getByTestId("send-exactly")).toHaveText("5 USDC on Arbitrum");
  await expect(page.getByTestId("address-chip")).toHaveText(E2E_ADDRESSES.safe);
  await expect(page.getByTestId("countdown")).toBeVisible();
  await page.getByRole("link", { name: "Track this deposit" }).click();
  await page.waitForURL(/\/track\?address=/);
  await expect(page.getByTestId("tracker")).toHaveAttribute("data-status", "PENDING_DEPOSIT");
});

test("near/intents#382: ETH on Base to an Ethereum quote is blocked, and the fix works", async ({ page }) => {
  await pasteAddress(page, E2E_ADDRESSES.issue382);
  await expect(page.getByTestId("route")).toContainText("0.17 ETH on Ethereum");
  await describeSend(page, { network: "Base", asset: ASSETS.baseEth, amount: "0.17" });
  await expect(page.getByTestId("result")).toHaveAttribute("data-verdict", "block");
  await expect(page.getByTestId("verdict")).toContainText("Don't send");
  await expect(page.getByTestId("check-network")).toHaveAttribute("data-severity", "block");
  await expect(page.getByTestId("check-network")).toContainText("This address is for Ethereum. You chose Base.");

  await page.getByRole("button", { name: "Switch to Ethereum" }).click();
  await expect(page.getByRole("radio", { name: "Ethereum" })).toBeChecked();
  await page.getByLabel("Token").selectOption(ASSETS.ethEth);
  await page.getByRole("button", { name: "Run checks" }).click();
  await expect(page.getByTestId("result")).toHaveAttribute("data-verdict", "safe");
});

test("sending too little is blocked with the amount it needs", async ({ page }) => {
  await pasteAddress(page, E2E_ADDRESSES.safe);
  await describeSend(page, { network: "Arbitrum", asset: ASSETS.arbUsdc, amount: "4.5" });
  await expect(page.getByTestId("result")).toHaveAttribute("data-verdict", "block");
  await expect(page.getByTestId("check-amount")).toContainText("Too little. This swap needs 5 USDC.");
});

test("sending from an exchange is a Check first, not Safe", async ({ page }) => {
  await pasteAddress(page, E2E_ADDRESSES.safe);
  await describeSend(page, { network: "Arbitrum", asset: ASSETS.arbUsdc, amount: "5", source: "An exchange" });
  await expect(page.getByTestId("result")).toHaveAttribute("data-verdict", "check");
  await expect(page.getByTestId("check-exchange")).toHaveAttribute("data-severity", "warn");
});

test("a quote near its deadline is Check first with a countdown", async ({ page }) => {
  await pasteAddress(page, E2E_ADDRESSES.warnExpiry);
  await describeSend(page, { network: "Arbitrum", asset: ASSETS.arbUsdc, amount: "5" });
  await expect(page.getByTestId("result")).toHaveAttribute("data-verdict", "check");
  await expect(page.getByTestId("check-time")).toHaveAttribute("data-severity", "warn");
  await expect(page.getByTestId("countdown")).toHaveAttribute("data-state", "check");
});

test("an expired quote stops before asking how you'll send", async ({ page }) => {
  await pasteAddress(page, E2E_ADDRESSES.expired);
  await expect(page.getByTestId("result")).toHaveAttribute("data-verdict", "block");
  await expect(page.getByTestId("check-time")).toContainText("This quote has expired.");
  await expect(page.getByRole("button", { name: "Run checks" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Check a new address" })).toBeVisible();
});

test("an already used address stops", async ({ page }) => {
  await pasteAddress(page, E2E_ADDRESSES.used);
  await expect(page.getByTestId("result")).toHaveAttribute("data-verdict", "block");
  await expect(page.getByTestId("check-used")).toContainText("This address was already used.");
});

test("an unknown address is Don't send, not an error page", async ({ page }) => {
  await pasteAddress(page, E2E_ADDRESSES.notFound);
  await expect(page.getByTestId("verdict")).toContainText("Don't send");
  await expect(page.getByTestId("verdict-headline")).toHaveText("We can't find this quote");
  await expect(page.getByRole("link", { name: "Paste a different address" })).toBeVisible();
});

test("1Click being down fails closed", async ({ page }) => {
  await pasteAddress(page, E2E_ADDRESSES.upstreamDown);
  await expect(page.getByTestId("result")).toHaveAttribute("data-verdict", "check");
  await expect(page.getByTestId("verdict")).toContainText("Can't check right now");
  await expect(page.getByRole("link", { name: "Retry" })).toBeVisible();
});

test("memo deposits: right memo is Safe, missing memo is blocked", async ({ page }) => {
  await pasteAddress(page, E2E_ADDRESSES.memo, "4207198");
  await expect(page.getByTestId("route")).toContainText("on Stellar");
  await describeSend(page, { network: "Stellar", asset: ASSETS.stellarUsdc, amount: "1100", memo: "4207198" });
  await expect(page.getByTestId("result")).toHaveAttribute("data-verdict", "safe");

  await page.getByRole("button", { name: "Change how I'll send" }).click();
  await page.getByLabel("Memo you'll add").fill("");
  await page.getByRole("button", { name: "Run checks" }).click();
  await expect(page.getByTestId("result")).toHaveAttribute("data-verdict", "block");
  await expect(page.getByTestId("check-memo")).toContainText("Memo missing.");
});

test("rejects input that isn't an address before calling anything", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Deposit address").fill("send 0.1 eth to my friend");
  await page.getByRole("button", { name: "Check address" }).click();
  await expect(page.getByText("This contains characters a deposit address never")).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});
