import {
  ErrorBodySchema,
  QuoteResponseSchema,
  StatusResponseSchema,
  TokenListSchema,
  type Lookup,
  type QuoteResponse,
  type Token,
} from "@neer/core";

export const ONE_CLICK_BASE_URL = "https://1click.chaindefuser.com";

export interface OneClickClientOptions {
  baseUrl?: string;
  /** Partner JWT. Server-side only; never ship it to a browser. */
  jwt?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
  now?: () => Date;
}

export type TokensResult = { ok: true; tokens: Token[] } | { ok: false; reason: "timeout" | "network" | "bad_status" | "invalid_response" };

export type QuoteResult =
  | { ok: true; quote: QuoteResponse }
  | { ok: false; reason: "timeout" | "network" | "bad_status" | "invalid_response"; status?: number; message?: string };

type Raw =
  | { kind: "ok"; status: number; body: unknown }
  | { kind: "http"; status: number; body: unknown }
  | { kind: "timeout" }
  | { kind: "network"; detail: string };

export class OneClickClient {
  private readonly baseUrl: string;
  private readonly jwt?: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;

  constructor(opts: OneClickClientOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? ONE_CLICK_BASE_URL).replace(/\/+$/, "");
    this.jwt = opts.jwt;
    this.timeoutMs = opts.timeoutMs ?? 8000;
    this.fetchImpl = opts.fetch ?? fetch;
    this.now = opts.now ?? (() => new Date());
  }

  private async request(path: string, init: RequestInit = {}): Promise<Raw> {
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    if (this.jwt) headers.set("authorization", `Bearer ${this.jwt}`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.baseUrl}${path}`, { ...init, headers, signal: controller.signal, cache: "no-store" });
      let body: unknown = null;
      const text = await res.text();
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          body = { message: "non-JSON response" };
        }
      }
      return res.ok ? { kind: "ok", status: res.status, body } : { kind: "http", status: res.status, body };
    } catch (err) {
      if (controller.signal.aborted) return { kind: "timeout" };
      return { kind: "network", detail: err instanceof Error ? err.message : String(err) };
    } finally {
      clearTimeout(timer);
    }
  }

  /** GET /v0/status. 404 means 1Click has no quote for this address (and memo). */
  async getStatus(depositAddress: string, depositMemo?: string | null): Promise<Lookup> {
    const qs = new URLSearchParams({ depositAddress });
    if (depositMemo) qs.set("depositMemo", depositMemo);
    const raw = await this.request(`/v0/status?${qs.toString()}`);
    if (raw.kind === "timeout") return { kind: "error", reason: "timeout" };
    if (raw.kind === "network") return { kind: "error", reason: "network", detail: raw.detail };
    if (raw.kind === "http") {
      if (raw.status === 404) return { kind: "not_found" };
      if (raw.status === 429) return { kind: "error", reason: "rate_limited" };
      return { kind: "error", reason: "bad_status", detail: `HTTP ${raw.status}` };
    }
    const parsed = StatusResponseSchema.safeParse(raw.body);
    if (!parsed.success) {
      return { kind: "error", reason: "invalid_response", detail: parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
    }
    return { kind: "found", status: parsed.data, fetchedAt: this.now() };
  }

  /** GET /v0/tokens. */
  async getTokens(): Promise<TokensResult> {
    const raw = await this.request("/v0/tokens");
    if (raw.kind === "timeout" || raw.kind === "network") return { ok: false, reason: raw.kind };
    if (raw.kind === "http") return { ok: false, reason: "bad_status" };
    const parsed = TokenListSchema.safeParse(raw.body);
    if (!parsed.success) return { ok: false, reason: "invalid_response" };
    return { ok: true, tokens: parsed.data };
  }

  /**
   * POST /v0/quote. Used only by the smoke test script; the Neer app never creates quotes.
   * Requesting a quote never moves funds.
   */
  async requestQuote(body: Record<string, unknown>): Promise<QuoteResult> {
    const raw = await this.request("/v0/quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (raw.kind === "timeout" || raw.kind === "network") return { ok: false, reason: raw.kind };
    if (raw.kind === "http") {
      const msg = ErrorBodySchema.safeParse(raw.body);
      return { ok: false, reason: "bad_status", status: raw.status, message: msg.success ? msg.data.message : undefined };
    }
    const parsed = QuoteResponseSchema.safeParse(raw.body);
    if (!parsed.success) return { ok: false, reason: "invalid_response" };
    return { ok: true, quote: parsed.data };
  }
}
