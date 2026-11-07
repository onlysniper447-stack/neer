import type { PreflightResult } from "@neer/core";

/** A previous Safe is historical after sixty seconds or the time rule's safety window. */
export function isFreshSafe(result: PreflightResult, now: number): boolean {
  const boundary = result.checks.find((c) => c.id === "time")?.expected?.safeUntil;
  const until = Math.min(Date.parse(result.serverTime) + 60_000, Date.parse(result.quote?.sendBefore ?? ""), typeof boundary === "string" ? Date.parse(boundary) : NaN);
  return result.verdict === "safe" && result.quote?.verified === true && Number.isFinite(now) && Number.isFinite(until) && now < until;
}
