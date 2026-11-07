import { expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy, config } from "../proxy";

const pageMatcher = new RegExp("^" + config.matcher[0]!.source + "$");
it.each(["/api/v1/verify", "/v1/verify", "/v1/verify/"])("excludes%s before Fetch request construction", (path) => {
  expect(pageMatcher.test(path)).toBe(false);
});
it.each(["/check", "/", "/v1/preflight", "/v1/verify-extra", "/v1/verify/extra"])("keeps the original page proxy scope for%s", (path) => {
  expect(pageMatcher.test(path)).toBe(true);
});
it("keeps page nonce CSP and never adds API wildcard CORS to unrelated pages", () => {
  const response = proxy(new NextRequest("https://fake.invalid/check"));
  expect(response.headers.get("Content-Security-Policy")).toContain("'nonce-");
  expect(response.headers.get("Content-Security-Policy")).toContain("'strict-dynamic'");
  expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
});
