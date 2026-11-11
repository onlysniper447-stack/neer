/**
 * Guards the public verifier contract while other features change.
 * 1. Every verifier, alias, security-header and homepage source file must
 *    match the SHA-256 manifest recorded at production commit 26b01b1, plus
 *    the reviewed `updates` listed in verifier-manifest.json (each with a reason).
 * 2. Recorded HTTP behavior of /api/v1/verify (status, headers, body) must
 *    match the snapshot, using fake data only. Re-recorded deliberately for
 *    verifier 1.1.0 (receiving-address check); see docs/versioning.md.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { currentManifest } from "./verifier-files";
import { bundle, input, NOW } from "../../../../packages/verify/test/fixtures";

vi.mock("@/lib/server/upstream-node", async () => {
  const { PUBLIC_KEY } = await import("../../../../packages/verify/test/fixtures");
  return { getStatus: vi.fn(), getTokens: vi.fn(), quotePublicKeyOverride: PUBLIC_KEY };
});
vi.mock("@/lib/server/rate-limit-node", async (original) => {
  const actual = await original<typeof import("@/lib/server/rate-limit-node")>();
  return { ...actual, rateLimit: vi.fn(async (bucket: Parameters<typeof actual.memoryLimit>[0], id: string) => actual.memoryLimit(bucket, id)) };
});

const upstream = await import("@/lib/server/upstream-node");
const limits = await import("@/lib/server/rate-limit-node");
const { handleVerifyRequest } = await import("@/lib/server/verify-handler");
const verifyPkg = await import("@neer/verify");

const manifest = JSON.parse(readFileSync(new URL("./verifier-manifest.json", import.meta.url), "utf8")) as { baseline: string; files: Record<string, string> };

describe("verifier source manifest", () => {
  it("was recorded at the production baseline", () => {
    expect(manifest.baseline).toBe("26b01b1");
  });
  it("has no added, removed or changed guarded files", () => {
    expect(currentManifest()).toEqual(manifest.files);
  });
});

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(NOW);
  limits.resetMemoryLimits();
  vi.mocked(upstream.getStatus).mockReset().mockResolvedValue(bundle().lookup);
  vi.mocked(upstream.getTokens).mockReset().mockResolvedValue({ tokens: bundle().tokens, fresh: true, fetchedAt: NOW.getTime() });
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

function req(method: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/v1/verify", {
    method,
    headers: { "Content-Type": "application/json", Origin: "https://untrusted.invalid", "X-Forwarded-For": "192.0.2.77", ...headers },
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });
}

async function record(response: Response) {
  const headers = Object.fromEntries([...response.headers.entries()].filter(([k]) => k !== "x-request-id" && k !== "date").sort());
  const text = await response.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch { /* keep raw text */ }
  return { status: response.status, headers, body };
}

const CASES: [string, () => Request][] = [
  ["pass", () => req("POST", input())],
  ["warn: recipient missing (1.1.0; this was pass in 1.0.0)", () => { const b: Record<string, unknown> = { ...input() }; delete b.expectedRecipient; return req("POST", b); }],
  ["block: recipient mismatch", () => req("POST", { ...input(), expectedRecipient: "other-account.near" })],
  ["block: receiving network mismatch", () => req("POST", { ...input(), expectedDestinationChain: "arb" })],
  ["400: expectedRecipient is a link", () => req("POST", { ...input(), expectedRecipient: "https://fake.example/x" })],
  ["warn: source missing", () => { const b: Record<string, unknown> = { ...input() }; delete b.source; return req("POST", b); }],
  ["block: network mismatch", () => req("POST", { ...input(), network: "base" })],
  ["400: deferred quoteId", () => req("POST", { ...input(), quoteId: "fake-quote-id" })],
  ["400: unknown key", () => req("POST", { ...input(), extra: 1 })],
  ["400: invalid JSON", () => req("POST", "{")],
  ["400: oversized body", () => req("POST", JSON.stringify({ pad: "x".repeat(70_000) }))],
  ["OPTIONS preflight", () => req("OPTIONS")],
  ["405 GET", () => req("GET")],
  ["405 PUT", () => req("PUT", input())],
];

describe("verifier HTTP behavior snapshot", () => {
  it("keeps the public exports", () => {
    expect(Object.keys(verifyPkg).sort()).toMatchSnapshot();
    expect(verifyPkg.VERIFY_VERSION).toMatchSnapshot();
  });
  for (const [name, make] of CASES) {
    it(name, async () => {
      expect(await record(await handleVerifyRequest(make()))).toMatchSnapshot();
    });
  }
  it("upstream unavailable stays a 200 block", async () => {
    vi.mocked(upstream.getStatus).mockResolvedValue({ kind: "error", reason: "timeout" });
    expect(await record(await handleVerifyRequest(req("POST", input())))).toMatchSnapshot();
  });
  it("rate limit returns 429 after the verify bucket is exhausted", async () => {
    for (let i = 0; i < 60; i++) await handleVerifyRequest(req("POST", input(), { "X-Forwarded-For": "192.0.2.99" }));
    expect(await record(await handleVerifyRequest(req("POST", input(), { "X-Forwarded-For": "192.0.2.99" })))).toMatchSnapshot();
  });
});
