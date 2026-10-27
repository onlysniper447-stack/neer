import { beforeEach, describe, expect, it } from "vitest";
import { clientIp, memoryLimit, resetMemoryLimits } from "@/lib/server/rate-limit";

describe("memoryLimit (fallback when Upstash is not configured)", () => {
  beforeEach(() => resetMemoryLimits());

  it("allows 30 preflights a minute per IP, then refuses with a retry time", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 30; i++) expect(memoryLimit("preflight", "1.2.3.4", t0 + i).ok).toBe(true);
    const r = memoryLimit("preflight", "1.2.3.4", t0 + 30);
    expect(r.ok).toBe(false);
    expect(r.retryAfterSec).toBe(60);
    expect(memoryLimit("preflight", "5.6.7.8", t0 + 30).ok).toBe(true);
  });

  it("is a sliding window", () => {
    const t0 = 2_000_000;
    for (let i = 0; i < 30; i++) memoryLimit("preflight", "ip", t0);
    expect(memoryLimit("preflight", "ip", t0 + 59_999).ok).toBe(false);
    expect(memoryLimit("preflight", "ip", t0 + 60_000).ok).toBe(true);
  });

  it("buckets are independent", () => {
    for (let i = 0; i < 30; i++) memoryLimit("preflight", "ip", 0);
    expect(memoryLimit("track", "ip", 0).ok).toBe(true);
  });
});

describe("clientIp", () => {
  it("uses the first X-Forwarded-For hop", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }))).toBe("203.0.113.9");
  });
  it("falls back to X-Real-IP, then 'unknown'", () => {
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
