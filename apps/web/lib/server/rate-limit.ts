import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export type Bucket = "preflight" | "track" | "check-page";

/** Starting values from the spec; tune with real traffic. */
const LIMITS: Record<Bucket, { max: number; windowSec: number }> = {
  preflight: { max: 30, windowSec: 60 },
  track: { max: 60, windowSec: 60 },
  "check-page": { max: 30, windowSec: 60 },
};

export interface LimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}

// ------------------------------------------------------------------ Upstash (when configured)

const upstash =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? (() => {
        const redis = Redis.fromEnv();
        const make = (b: Bucket) =>
          new Ratelimit({ redis, prefix: `neer:rl:${b}`, limiter: Ratelimit.slidingWindow(LIMITS[b].max, `${LIMITS[b].windowSec} s`) });
        return { preflight: make("preflight"), track: make("track"), "check-page": make("check-page") } as Record<Bucket, Ratelimit>;
      })()
    : null;

export const rateLimitBackend = upstash ? "upstash" : "memory";

// ------------------------------------------------------------------ in-memory sliding log (fallback)

const MAX_KEYS = 10_000;
const hits = new Map<string, number[]>();

export function memoryLimit(bucket: Bucket, id: string, now = Date.now()): LimitResult {
  const { max, windowSec } = LIMITS[bucket];
  const windowMs = windowSec * 1000;
  const key = `${bucket}:${id}`;
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= max) {
    hits.set(key, list);
    const retry = Math.max(1, Math.ceil((list[0]! + windowMs - now) / 1000));
    return { ok: false, remaining: 0, retryAfterSec: retry };
  }
  list.push(now);
  hits.delete(key); // re-insert to keep Map order ~ least recently used
  hits.set(key, list);
  if (hits.size > MAX_KEYS) {
    const oldest = hits.keys().next().value;
    if (oldest !== undefined) hits.delete(oldest);
  }
  return { ok: true, remaining: max - list.length, retryAfterSec: 0 };
}

export function resetMemoryLimits() {
  hits.clear();
}

export async function rateLimit(bucket: Bucket, id: string): Promise<LimitResult> {
  if (process.env.NEER_DISABLE_RATE_LIMIT === "1" && process.env.NEER_TEST_UPSTREAM) {
    return { ok: true, remaining: LIMITS[bucket].max, retryAfterSec: 0 };
  }
  if (!upstash) return memoryLimit(bucket, id);
  try {
    const r = await upstash[bucket].limit(id);
    return { ok: r.success, remaining: r.remaining, retryAfterSec: r.success ? 0 : Math.max(1, Math.ceil((r.reset - Date.now()) / 1000)) };
  } catch {
    // Redis unreachable: fall back to this instance's memory rather than failing open.
    return memoryLimit(bucket, id);
  }
}

/** First hop in X-Forwarded-For (set by Vercel and most proxies), else X-Real-IP. */
export function clientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim() || "unknown";
  return headers.get("x-real-ip")?.trim() || "unknown";
}
