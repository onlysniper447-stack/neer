/**
 * Live check: drives a running Neer (pointed at the REAL 1Click API) through
 * the paste flow for a fresh deposit address from `pnpm smoke`, and saves
 * screenshots. Sends nothing and signs nothing.
 *
 *   NEER_URL=http://127.0.0.1:3200 LIVE_ADDRESS=0x... tsx scripts/live-check.ts
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, devices } from "@playwright/test";

const base = process.env.NEER_URL ?? "http://127.0.0.1:3200";
const address = process.env.LIVE_ADDRESS;
if (!address) throw new Error("Set LIVE_ADDRESS (run `pnpm smoke` first)");
const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../screenshots");
const ARB_USDC = "nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near";
const BASE_ETH = "nep141:base.omft.near";

const browser = await chromium.launch();
const page = await browser.newPage({ ...devices["Pixel 7"] });

async function run(network: string, asset: string, amount: string, file: string) {
  await page.goto(`${base}/check?address=${address}`);
  await page.getByTestId("route").waitFor();
  console.log("route:", await page.getByTestId("route").textContent());
  await page.getByRole("radiogroup", { name: "Network" }).getByText(network, { exact: true }).click();
  await page.getByLabel("Token").selectOption(asset);
  await page.getByLabel("Amount you'll send").fill(amount);
  await page.getByText("My own wallet", { exact: true }).click();
  await page.getByRole("button", { name: "Run checks" }).click();
  await page.getByTestId("result").waitFor();
  const verdict = await page.getByTestId("result").getAttribute("data-verdict");
  console.log(`${network} ${amount}: verdict=${verdict} - ${await page.getByTestId("verdict-headline").textContent()}`);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(out, file), fullPage: true });
  return verdict;
}

const a = await run("Arbitrum", ARB_USDC, "5", "live-01-pass-real-1click.png");
const b = await run("Base", BASE_ETH, "0.002", "live-02-block-wrong-network-real-1click.png");
await page.goto(`${base}/track?address=${address}`);
await page.getByTestId("tracker").waitFor();
await page.waitForTimeout(1500);
console.log("tracker status:", await page.getByTestId("tracker").getAttribute("data-status"));
await page.screenshot({ path: path.join(out, "live-03-tracker-real-1click.png"), fullPage: true });
await browser.close();
if (a !== "safe" || b !== "block") {
  console.error("unexpected live verdicts");
  process.exit(1);
}
console.log("live check passed");
