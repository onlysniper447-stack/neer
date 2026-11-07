import type { NeerResult } from "./index.js";

const REQUIRED = ["signature", "used", "time", "lookalike", "network", "token", "amount", "exchange"];
const SEVERITIES = ["pass", "info", "unknown", "warn", "block"];

function record(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

export function isResult(x: unknown): x is NeerResult {
  if (!record(x) || !["safe", "check", "block"].includes(String(x.verdict))) return false;
  if (!["label", "headline", "message", "rulesVersion", "serverTime", "checksHash"].every((k) => typeof x[k] === "string")) return false;
  if (!Number.isFinite(Date.parse(x.serverTime as string)) || !/^[0-9a-f]{64}$/i.test(x.checksHash as string)) return false;
  if (!Array.isArray(x.checks) || x.checks.length > 64 || !x.checks.every((c) => record(c) && typeof c.id === "string" && SEVERITIES.includes(String(c.severity)) && ["title", "headline", "message"].every((k) => typeof c[k] === "string"))) return false;
  const checks = x.checks as NeerResult["checks"];
  if (new Set(checks.map((c) => c.id)).size !== checks.length) return false;
  if (x.verdict !== "safe") return true;
  if (!REQUIRED.every((id) => checks.some((c) => c.id === id && c.severity === "pass")) || checks.some((c) => !["pass", "info"].includes(c.severity))) return false;
  return record(x.quote) && x.quote.verified === true && typeof x.quote.sendBefore === "string" && Number.isFinite(Date.parse(x.quote.sendBefore)) && Number.isFinite(safeUntil(x as unknown as NeerResult));
}

export function safeUntil(result: NeerResult): number {
  const value = result.checks.find((c) => c.id === "time")?.expected?.safeUntil;
  return typeof value === "string" ? Date.parse(value) : NaN;
}
