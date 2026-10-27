import { DeclaredTransferSchema, preflight, type CheckResult, type DeclaredTransferInput, type Lookup, type PreflightResult, type QuoteResponse, type StatusResponse } from "../src/index.js";
import { TEST_PUBLIC_KEY, TOKENS, makeStatus } from "../../../fixtures/src/scenarios.js";

export const NOW = new Date("2026-11-07T12:51:00.000Z");

/** Recorded live token list with prices re-stamped as fresh at NOW (the list was recorded on 27 Oct). */
export const FRESH_TOKENS = TOKENS.map((t) => ({ ...t, priceUpdatedAt: new Date(NOW.getTime() - 60_000).toISOString() }));

export function found(status: StatusResponse, fetchedAt: Date = NOW): Lookup {
  return { kind: "found", status, fetchedAt };
}

export function run(
  qr: QuoteResponse,
  transfer: DeclaredTransferInput,
  opts: { pasted?: string; memo?: string | null; status?: StatusResponse["status"]; now?: Date; lookup?: Lookup; tokens?: typeof TOKENS; quote?: QuoteResponse | null } = {},
): PreflightResult {
  const now = opts.now ?? NOW;
  return preflight({
    depositAddress: opts.pasted ?? qr.quote.depositAddress!,
    depositMemo: opts.memo ?? null,
    lookup: opts.lookup ?? found(makeStatus(qr, opts.status ?? "PENDING_DEPOSIT", now), now),
    quote: opts.quote ?? null,
    transfer: DeclaredTransferSchema.parse(transfer),
    tokens: opts.tokens ?? FRESH_TOKENS,
    now,
    quotePublicKey: TEST_PUBLIC_KEY,
  });
}

export function check(res: PreflightResult, id: CheckResult["id"]): CheckResult {
  const c = res.checks.find((x) => x.id === id);
  if (!c) throw new Error(`check ${id} missing; have ${res.checks.map((x) => x.id).join(",")}`);
  return c;
}
