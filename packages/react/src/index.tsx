import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * @neer/react: gate a "Send" button on a Neer preflight.
 *
 * Fail-closed: `canSend` is true only when the latest check returned "safe",
 * matches the current inputs, and is younger than `maxAgeMs`. Errors, loading,
 * stale results, "check" and "block" all keep the button disabled.
 *
 * The component never touches a wallet. It only POSTs the declared send to
 * `${endpoint}/api/v1/preflight`.
 */

export type Verdict = "safe" | "check" | "block";

export interface NeerDeposit {
  address: string;
  memo?: string | null;
}

export interface NeerTransfer {
  /** 1Click blockchain id, e.g. "eth", "base", "arb". */
  chain: string;
  /** EVM chain id from the wallet, if known. A mismatch with `chain` blocks. */
  chainId?: number;
  /** "native", a token contract, or a 1Click assetId. */
  asset: string;
  /** Amount in base units, as a decimal string. */
  amount: string;
  memo?: string | null;
  from?: string;
  to?: string;
  source?: "wallet" | "exchange" | "unknown";
  /** Unsigned draft tx, so Neer can decode what will really be sent. */
  tx?: { to: string; data?: string; value?: string; chainId?: number };
}

export interface NeerCheck {
  id: string;
  severity: "pass" | "info" | "unknown" | "warn" | "block";
  title: string;
  headline: string;
  message: string;
}

export interface NeerResult {
  verdict: Verdict;
  label: string;
  headline: string;
  message: string;
  checks: NeerCheck[];
  serverTime: string;
  requestId?: string;
  rulesVersion: string;
  checksHash: string;
}

export type NeerState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "done"; result: NeerResult; checkedAt: number }
  | { status: "error"; message: string; result?: NeerResult };

export interface NeerGuardValue {
  state: NeerState;
  /** True only for a fresh "safe" verdict on exactly these inputs. */
  canSend: boolean;
  verdict: Verdict | null;
  /** The first problem to show next to the button, if any. */
  reason: string | null;
  recheck: () => void;
}

export interface UseNeerPreflightOptions {
  /** Origin of the Neer deployment, e.g. "https://neer.example.com". No trailing slash. */
  endpoint: string;
  deposit: NeerDeposit | null;
  transfer: NeerTransfer | null;
  /** A verdict older than this stops allowing sends. Default 60 s. */
  maxAgeMs?: number;
  /** Wait this long after inputs change before checking. Default 300 ms. */
  debounceMs?: number;
  fetch?: typeof fetch;
}

function firstProblem(result: NeerResult): string | null {
  const order: NeerCheck["severity"][] = ["block", "warn", "unknown"];
  for (const sev of order) {
    const c = result.checks.find((x) => x.severity === sev);
    if (c) return c.message;
  }
  return result.verdict === "safe" ? null : result.message;
}

function isResult(x: unknown): x is NeerResult {
  if (!x || typeof x !== "object") return false;
  const r = x as Record<string, unknown>;
  return (r.verdict === "safe" || r.verdict === "check" || r.verdict === "block") && Array.isArray(r.checks) && typeof r.serverTime === "string";
}

export function useNeerPreflight(opts: UseNeerPreflightOptions): NeerGuardValue {
  const { endpoint, deposit, transfer, maxAgeMs = 60_000, debounceMs = 300 } = opts;
  const fetchImpl = opts.fetch ?? globalThis.fetch;
  const key = deposit && transfer ? JSON.stringify([endpoint, deposit, transfer]) : null;
  const [state, setState] = useState<NeerState>({ status: "idle" });
  const [stateKey, setStateKey] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [nonce, setNonce] = useState(0);
  const fetchRef = useRef(fetchImpl);
  useEffect(() => {
    fetchRef.current = fetchImpl;
  });

  useEffect(() => {
    if (!key) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setState({ status: "checking" });
      setStateKey(key);
      setStale(false);
      try {
        const res = await fetchRef.current(`${endpoint}/api/v1/preflight`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ deposit, transfer }),
          signal: ctrl.signal,
        });
        const json: unknown = await res.json().catch(() => null);
        if (ctrl.signal.aborted) return;
        if (isResult(json) && res.ok) {
          setState({ status: "done", result: json, checkedAt: Date.now() });
        } else {
          const err = (json as { error?: { message?: string } } | null)?.error?.message;
          setState({ status: "error", message: err ?? `Neer returned HTTP ${res.status}. Don't send yet.`, ...(isResult(json) ? { result: json } : {}) });
        }
      } catch (e) {
        if (ctrl.signal.aborted) return;
        setState({ status: "error", message: e instanceof Error && e.name === "TimeoutError" ? "Neer timed out. Don't send yet." : "Couldn't reach Neer. Don't send yet." });
      }
    }, debounceMs);
    return () => {
      ctrl.abort();
      clearTimeout(timer);
    };
  }, [key, nonce, debounceMs]); // key captures endpoint, deposit and transfer by value

  useEffect(() => {
    if (state.status !== "done") return;
    const t = setTimeout(() => setStale(true), Math.max(0, state.checkedAt + maxAgeMs - Date.now()));
    return () => clearTimeout(t);
  }, [state, maxAgeMs]);

  const recheck = useCallback(() => setNonce((n) => n + 1), []);

  const current = key !== null && stateKey === key;
  const effective: NeerState = current ? state : key ? { status: "checking" } : { status: "idle" };
  const result = effective.status === "done" ? effective.result : effective.status === "error" ? effective.result : undefined;
  const canSend = effective.status === "done" && effective.result.verdict === "safe" && !stale;
  const reason =
    effective.status === "error"
      ? effective.message
      : effective.status === "done"
        ? stale && effective.result.verdict === "safe"
          ? "This check is out of date. Check again before you send."
          : firstProblem(effective.result)
        : null;
  return { state: effective, canSend, verdict: result?.verdict ?? null, reason, recheck };
}

export interface NeerGuardProps extends UseNeerPreflightOptions {
  children: (guard: NeerGuardValue) => ReactNode;
}

/**
 * Render-prop wrapper around useNeerPreflight.
 *
 * <NeerGuard endpoint="https://neer.example.com" deposit={{ address }} transfer={send}>
 *   {({ canSend, reason }) => <button disabled={!canSend} title={reason ?? undefined}>Send</button>}
 * </NeerGuard>
 */
export function NeerGuard({ children, ...opts }: NeerGuardProps) {
  return <>{children(useNeerPreflight(opts))}</>;
}

const TONE: Record<Verdict | "pending", { fg: string; bg: string; word: string }> = {
  safe: { fg: "#065f46", bg: "#ecfdf5", word: "Safe to send" },
  check: { fg: "#92400e", bg: "#fffbeb", word: "Check this" },
  block: { fg: "#991b1b", bg: "#fef2f2", word: "Don't send" },
  pending: { fg: "#334155", bg: "#f8fafc", word: "Checking…" },
};

/** Small default status line (inline styles, no CSS needed). Optional. */
export function NeerStatus({ guard }: { guard: NeerGuardValue }) {
  const { state, verdict, reason } = guard;
  if (state.status === "idle") return null;
  const tone = state.status === "checking" ? TONE.pending : state.status === "error" && !verdict ? TONE.check : TONE[verdict ?? "check"];
  const word = state.status === "error" && !verdict ? "Can't check right now" : tone.word;
  return (
    <div role="status" aria-live="polite" data-neer-verdict={verdict ?? state.status} style={{ color: tone.fg, background: tone.bg, padding: "8px 12px", borderRadius: 8, fontSize: 14 }}>
      <strong>{word}</strong>
      {reason ? <span>. {reason}</span> : null}
    </div>
  );
}
