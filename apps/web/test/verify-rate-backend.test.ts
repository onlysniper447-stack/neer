import { afterEach, beforeEach, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  configs: [] as { prefix: string; limiter: { max: number; window: string } }[],
  limit: vi.fn(),
}));
vi.mock("@upstash/redis", () => ({ Redis: { fromEnv: () => ({ fake: true }) } }));
vi.mock("@upstash/ratelimit", () => ({ Ratelimit: class {
  static slidingWindow(max: number, window: string) { return { max, window }; }
  private prefix: string;
  constructor(options: { prefix: string; limiter: { max: number; window: string } }) { fake.configs.push(options); this.prefix = options.prefix; }
  limit(id: string) { return fake.limit(this.prefix, id); }
} }));
beforeEach(() => {
  fake.configs.length = 0; fake.limit.mockReset(); vi.resetModules();
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://fake-redis.invalid");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "FAKE_TEST_TOKEN_NO_NETWORK");
  vi.stubEnv("NEER_DISABLE_RATE_LIMIT", "0");
  vi.useFakeTimers(); vi.setSystemTime(1_000_000);
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

it("uses an independent verify Redis namespace at60/min and leaves old limits intact", async () => {
  const backend = await import("@/lib/server/rate-limit");
  expect(backend.rateLimitBackend).toBe("upstash");
  expect(fake.configs.map(({ prefix, limiter }) => ({ prefix, ...limiter }))).toEqual([
    { prefix: "neer:rl:preflight", max: 30, window: "60 s" },
    { prefix: "neer:rl:track", max: 60, window: "60 s" },
    { prefix: "neer:rl:check-page", max: 30, window: "60 s" },
    { prefix: "neer:rl:verify", max: 60, window: "60 s" },
  ]);
  fake.limit.mockResolvedValue({ success: false, remaining: 0, reset: Date.now() + 1250 });
  expect(await backend.rateLimit("verify", "192.0.2.15")).toEqual({ ok: false, remaining: 0, retryAfterSec: 2 });
  expect(fake.limit).toHaveBeenCalledWith("neer:rl:verify", "192.0.2.15");
});
it("Redis failure falls back to60/min instance memory without printing the exception", async () => {
  const backend = await import("@/lib/server/rate-limit");
  fake.limit.mockRejectedValue(new Error("FAKE_SENSITIVE_REDIS_ERROR"));
  const logger = vi.spyOn(console, "error").mockImplementation(() => {});
  for (let i=0;i<60;i++) expect((await backend.rateLimit("verify", "192.0.2.16")).ok).toBe(true);
  expect(await backend.rateLimit("verify", "192.0.2.16")).toEqual({ ok: false, remaining: 0, retryAfterSec: 60 });
  expect(logger).not.toHaveBeenCalled(); logger.mockRestore();
});
