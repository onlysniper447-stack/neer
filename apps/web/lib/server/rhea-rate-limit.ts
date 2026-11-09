import "./node-only";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import type { LimitResult } from "./rate-limit-node";

/**
 * Separate buckets for the RHEA routes, so RHEA traffic can never use up the
 * verifier's or preflight's limits. Kept out of rate-limit-node.ts on purpose:
 * that file is part of the pinned verifier contract.
 */
export type RheaBucket = "rhea-quote" | "rhea-tokens";
export const RHEA_LIMITS: Record<RheaBucket, { max: number; windowSec: number }> = {
  "rhea-quote": { max: 20, windowSec: 60 },
  "rhea-tokens": { max: 60, windowSec: 60 },
};

const upstash =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? (() => {
        const redis = Redis.fromEnv();
        const make = (b: RheaBucket) =>
          new Ratelimit({ redis, prefix: `neer:rl:${b}`, limiter: Ratelimit.slidingWindow(RHEA_LIMITS[b].max, `${RHEA_LIMITS[b].windowSec} s`) });
        return { "rhea-quote": make("rhea-quote"), "rhea-tokens": make("rhea-tokens") } as Record<RheaBucket, Ratelimit>;
      })()
    : null;

const MAX_KEYS = 10_000;
const hits = new Map<string, number[]>();

export function rheaMemoryLimit(bucket: RheaBucket, id: string, now = Date.now()): LimitResult {
  const { max, windowSec } = RHEA_LIMITS[bucket];
  const windowMs = windowSec * 1000;
  const key = `${bucket}:${id}`;
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= max) {
    hits.set(key, list);
    return { ok: false, remaining: 0, retryAfterSec: Math.max(1, Math.ceil((list[0]! + windowMs - now) / 1000)) };
  }
  list.push(now);
  hits.delete(key);
  hits.set(key, list);
  if (hits.size > MAX_KEYS) {
    const oldest = hits.keys().next().value;
    if (oldest !== undefined) hits.delete(oldest);
  }
  return { ok: true, remaining: max - list.length, retryAfterSec: 0 };
}

export function resetRheaLimits() {
  hits.clear();
}

export async function rheaRateLimit(bucket: RheaBucket, id: string): Promise<LimitResult> {
  if (process.env.NEER_DISABLE_RATE_LIMIT === "1" && process.env.NEER_TEST_RHEA_UPSTREAM) {
    return { ok: true, remaining: RHEA_LIMITS[bucket].max, retryAfterSec: 0 };
  }
  if (!upstash) return rheaMemoryLimit(bucket, id);
  try {
    const r = await upstash[bucket].limit(id);
    return { ok: r.success, remaining: r.remaining, retryAfterSec: r.success ? 0 : Math.max(1, Math.ceil((r.reset - Date.now()) / 1000)) };
  } catch {
    return rheaMemoryLimit(bucket, id);
  }
}
