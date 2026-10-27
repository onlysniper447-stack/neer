import { defineConfig, devices } from "@playwright/test";
import { TEST_PUBLIC_KEY } from "@neer/fixtures/scenarios";

const MOCK_PORT = 4010;
const APP_PORT = 3100;

/**
 * Runs the production build (`next build` first) against a local mock of the
 * 1Click API. Nothing here talks to the real 1Click service.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: { baseURL: `http://127.0.0.1:${APP_PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "e2e", testIgnore: /screenshots\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", testMatch: /(paste-flow|nav|pages)\.spec\.ts/, use: { ...devices["Pixel 7"] } },
    { name: "screenshots", testMatch: /screenshots\.spec\.ts/ },
  ],
  webServer: [
    {
      command: `tsx e2e/mock-1click.ts`,
      url: `http://127.0.0.1:${MOCK_PORT}/v0/tokens`,
      env: { MOCK_PORT: String(MOCK_PORT) },
      reuseExistingServer: false,
      stdout: "ignore",
    },
    {
      command: `next start --port ${APP_PORT} --hostname 127.0.0.1`,
      url: `http://127.0.0.1:${APP_PORT}/`,
      env: {
        NEER_TEST_UPSTREAM: `http://127.0.0.1:${MOCK_PORT}`,
        NEER_TEST_QUOTE_PUBKEY: TEST_PUBLIC_KEY,
        NEER_DISABLE_RATE_LIMIT: "1",
        NEER_CORS_ORIGINS: "https://wallet.example",
        UPSTASH_REDIS_REST_URL: "",
        UPSTASH_REDIS_REST_TOKEN: "",
      },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
