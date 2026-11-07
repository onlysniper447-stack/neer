import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { z } from "zod";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FINDING_CODES, VERIFY_VERSION, VerifyInputSchema, type Finding, type VerifyInput } from "../src/index.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const guide = read("docs/integrations/agents.md");
const snippets = [...guide.matchAll(/```typescript\n([\s\S]*?)\n```/g)];
const snippet = snippets[0]![1]!;
const input: VerifyInput = { depositAddress: "FAKE_DEPOSIT_ADDRESS", network: "eth", token: "nep141:fake-usdc.omft.near", amount: "5", source: "unknown" };
type Review = (finding: Finding, checkedAt: string) => Promise<boolean>;
type Example = (input: VerifyInput, review: Review, origin: string) => Promise<{status: string}>;
const js = ts.transpileModule(snippet, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replace(/^import[\s\S]*?from ["'][^"']+["'];?\n/gm, "");
const example = new Function("z", "FINDING_CODES", "VERIFY_VERSION", "VerifyInputSchema", js + "\nreturn verifyBeforeTransfer;")(z, FINDING_CODES, VERIFY_VERSION, VerifyInputSchema) as Example;
const stop = "Do not send funds until verification succeeds.";
function result() {
 return { status: "pass", findings: [] as Finding[], quote: { verified: true, network: "eth", token: input.token, amount: "5000000", minimumAmount: "1", expiresAt: new Date(Date.now() + 300_000).toISOString(), swapType: "EXACT_INPUT" }, checkedAt: new Date().toISOString(), version: VERIFY_VERSION };
}
function response(body: unknown, status = 200, version = VERIFY_VERSION) {
 return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "X-Neer-Verify-Version": version } });
}
const warn: Finding = { code: "SOURCE_UNKNOWN", severity: "warn", message: "FAKE_WARNING", fix: "FAKE_REVIEW" };
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("actual integration documentation", () => {
 it("extracts the one actual TypeScript snippet and type-checks it with strict workspace resolution", () => {
  expect(snippets).toHaveLength(1);
  const path = resolve(root, "packages/verify/test/__integration-example.ts");
  const options: ts.CompilerOptions = { noEmit: true, strict: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, skipLibCheck: true, baseUrl: root, paths: { "@neer/verify": ["packages/verify/src/index.ts"] }, lib: ["lib.es2022.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"] };
  // Resolve the real local source: concurrent tsup --clean must not race a self-package dist lookup.
  const host = ts.createCompilerHost(options); const originalRead = host.readFile; const originalExists = host.fileExists;
  host.readFile = file => file === path ? snippet : originalRead(file);
  host.fileExists = file => file === path || originalExists(file);
  const program = ts.createProgram([path], options, host);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  expect(diagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, "\n"))).toEqual([]);
 }, 30_000);
 it("keeps the exact transfer rule, truthful release state, two draft markers and a PR draft under 300 whitespace words", () => {
  expect(guide).toContain("Do not send funds unless status is pass or the user has acknowledged each warn finding.");
  expect(guide).toContain("unpublished"); expect(guide).toContain("not on the production default origin");
  for (const path of ["outreach/pr-draft.md", "outreach/issue-draft.md"]) expect(read(path)).toContain("DRAFT — requires human review before sending.");
  expect(read("outreach/pr-draft.md").trim().split(/\s+/).length).toBeLessThan(300);
 });
 it("documents exactly the ten accepted query parameters and a fake button without memos", () => {
  const doc = read("docs/integrations/swap-apps.md");
  const names = [...doc.matchAll(/^\| (address|network|token|amount|memo|lookupMemo|source|chainId|from|to) \|/gm)].map(m => m[1]);
  expect(names).toEqual(["address", "network", "token", "amount", "memo", "lookupMemo", "source", "chainId", "from", "to"]);
  const button = doc.match(/```html\n([^\n]+)\n```/)![1]!;
  expect(button).toContain("FAKE_DEPOSIT_ADDRESS"); expect(button).not.toMatch(/(?:lookupMemo|memo)=/);
 });
 it("returns a fresh pass without an acknowledgement or any transfer call", async () => {
  const fetch = vi.fn().mockResolvedValue(response(result())); vi.stubGlobal("fetch", fetch); const review = vi.fn();
  expect((await example(input, review, "https://qa.example.invalid")).status).toBe("pass"); expect(review).not.toHaveBeenCalled();
  expect(fetch).toHaveBeenCalledOnce(); const [url, init] = fetch.mock.calls[0]!;
  expect(String(url)).toBe("https://qa.example.invalid/api/v1/verify"); expect(init).toMatchObject({method: "POST", credentials: "omit", redirect: "error"});
  expect(JSON.parse(init.body as string)).toEqual(input);
 });
 it("requires acknowledgement of every warning from this exact returned result", async () => {
  const r = result(); r.status = "warn"; r.findings = [warn, {...warn, code: "QUOTE_NEAR_EXPIRY"}];
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(r))); const review = vi.fn().mockResolvedValue(true);
  expect((await example(input, review, "http://127.0.0.1:3000")).status).toBe("warn");
  expect(review.mock.calls).toEqual(r.findings.map(f => [f, r.checkedAt]));
 });
 it("refuses a declined warning", async () => {
  const r = result(); r.status = "warn"; r.findings = [warn]; vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(r)));
  await expect(example(input, async () => false, "https://qa.example.invalid")).rejects.toThrow(stop);
 });
 it("never requests acknowledgement to override a block", async () => {
  const r = result(); r.status = "block"; r.findings = [{...warn, code: "QUOTE_UNAVAILABLE", severity: "block"}];
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(r))); const review = vi.fn().mockResolvedValue(true);
  await expect(example(input, review, "https://qa.example.invalid")).rejects.toThrow(stop); expect(review).not.toHaveBeenCalled();
 });
 it.each([400, 405, 429, 500])("fails closed on HTTP %i without exposing a response body", async status => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({error: "FAKE_SENSITIVE_MEMO"}, status)));
  await expect(example(input, async () => true, "https://qa.example.invalid")).rejects.toThrow(stop);
 });
 it.each(["unknown-version", "unknown-code", "contradiction", "extra", "null-quote", "missing-expiry", "expired", "stale", "future"]) ("fails closed on %s response", async variant => {
  const r = result(); let body: unknown = r; let version = VERIFY_VERSION;
  if (variant === "unknown-version") version = "9.0.0";
  if (variant === "unknown-code") body = {...r, status: "warn", findings: [{...warn, code: "FAKE_UNKNOWN_CODE"}]};
  if (variant === "contradiction") body = {...r, findings: [warn]};
  if (variant === "extra") body = {...r, address: "FAKE_SENSITIVE_ADDRESS"};
  if (variant === "null-quote") body = {...r, quote: null};
  if (variant === "missing-expiry") body = {...r, quote: {...r.quote, expiresAt: null}};
  if (variant === "expired") r.quote.expiresAt = new Date(Date.now() - 1000).toISOString();
  if (variant === "stale") r.checkedAt = new Date(Date.now() - 61_000).toISOString();
  if (variant === "future") r.checkedAt = new Date(Date.now() + 6000).toISOString();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(body, 200, version)));
  await expect(example(input, async () => true, "https://qa.example.invalid")).rejects.toThrow(stop);
 });
 it("rechecks expiry after human review", async () => {
  vi.useFakeTimers(); const next = result(); next.status = "warn"; next.findings = [warn]; vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(next)));
  await expect(example(input, async () => { vi.setSystemTime(Date.now() + 301_000); return true; }, "https://qa.example.invalid")).rejects.toThrow(stop);
 });
 it.each(["http://public.example.invalid", "https://user:FAKE_SECRET@qa.example.invalid", "https://qa.example.invalid/path", "https://qa.example.invalid?memo=FAKE", "https://qa.example.invalid/#x"]) ("rejects unreviewable origin %s before fetch", async origin => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  await expect(example(input, async () => true, origin)).rejects.toThrow(stop); expect(fetch).not.toHaveBeenCalled();
 });
 it("rejects deferred input before fetch and sanitizes thrown errors without logging", async () => {
  const fetch = vi.fn().mockRejectedValue(new Error("FAKE_ADDRESS_AND_MEMO")); vi.stubGlobal("fetch", fetch);
  const logs = [vi.spyOn(console, "log"), vi.spyOn(console, "warn"), vi.spyOn(console, "error")];
  await expect(example({...input, quoteId: "FAKE_DEFERRED"} as VerifyInput, async () => true, "https://qa.example.invalid")).rejects.toThrow(stop);
  expect(fetch).not.toHaveBeenCalled();
  await expect(example(input, async () => true, "https://qa.example.invalid")).rejects.toThrow(stop);
  for (const log of logs) expect(log).not.toHaveBeenCalled();
 });
 it.each(["invalid-json", "oversized", "bad-type"]) ("rejects %s body", async variant => {
  const raw = variant === "oversized" ? "x".repeat(65_537) : "not-json";
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(raw, {headers: {"Content-Type": variant === "bad-type" ? "text/html" : "application/json", "X-Neer-Verify-Version": VERIFY_VERSION}})));
  await expect(example(input, async () => true, "https://qa.example.invalid")).rejects.toThrow(stop);
 });
 it("aborts a hung request after ten seconds with a sanitized error", async () => {
  vi.useFakeTimers(); vi.stubGlobal("fetch", vi.fn((_url: URL, init: RequestInit) => new Promise((_resolve, reject) => {init.signal!.addEventListener("abort", () => reject(new Error("FAKE_SECRET_TIMEOUT")), {once: true});})));
  const pending = expect(example(input, async () => true, "https://qa.example.invalid")).rejects.toThrow(stop);
  await vi.advanceTimersByTimeAsync(10_001); await pending;
 });
});
