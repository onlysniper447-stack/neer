import { Readable } from "node:stream";
import type { NextApiRequest, NextApiResponse } from "next";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { VERIFY_VERSION } from "@neer/verify";
import { readJsonBody } from "@/lib/server/read-json-body";

vi.mock("@/lib/server/verify-handler", () => ({ handleVerifyRequest: vi.fn() }));
const { handleVerifyRequest } = await import("@/lib/server/verify-handler");
const { handleVerifyNodeRequest } = await import("@/lib/server/verify-node");
const SECRET = "FAKE_PRIVATE_TRANSPORT_DETAIL_123.987654";
let logger = vi.fn();
beforeEach(() => {
  logger = vi.fn(); vi.spyOn(console, "info").mockImplementation(logger);
  vi.mocked(handleVerifyRequest).mockReset().mockResolvedValue(Response.json({ accepted: true }));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function sink() {
  const headers = new Map<string, string>(); let body = "";
  const target = {
    statusCode: 0, headersSent: false, writableEnded: false, destroyed: false,
    setHeader: vi.fn((name: string, value: string) => { headers.set(name.toLowerCase(), value); }),
    end: vi.fn((value?: Uint8Array) => { body = value ? Buffer.from(value).toString("utf8") : ""; target.writableEnded = true; }),
    destroy: vi.fn(),
  };
  return { target: target as unknown as NextApiResponse, raw: target, headers, body: () => body };
}
function incoming(chunks: Buffer[], headers: Record<string, string | string[] | undefined> = {}) {
  return Object.assign(Readable.from(chunks, { autoDestroy: false }), {
    method: "POST", headers: { "content-type": "application/json", ...headers },
  }) as unknown as NextApiRequest;
}
function safeHeaders(response: ReturnType<typeof sink>) {
  expect(response.headers.get("x-neer-verify-version")).toBe(VERIFY_VERSION);
  expect(response.headers.get("access-control-allow-origin")).toBe("*");
  expect(response.headers.has("access-control-allow-credentials")).toBe(false);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("content-security-policy")).toBe("default-src 'none'; frame-ancestors 'none'");
}
function safeLogs() {
  for (const [value] of logger.mock.calls) {
    const parsed = JSON.parse(String(value));
    expect(Object.keys(parsed).sort()).toEqual(["findingCodes", "status", "timestamp", "version"]);
    expect(String(value)).not.toContain(SECRET);
  }
}

it.each(["GET", "HEAD", "PUT", "PATCH", "DELETE", "TRACE", "CONNECT", "PROPFIND", "REPORT", "FAKE_METHOD"])("guards%s before headers, stream or Fetch Request construction", async (method) => {
  const nativeRequest = vi.fn(() => { throw new Error(SECRET); }); vi.stubGlobal("Request", nativeRequest);
  const raw = { method, get headers() { throw new Error(SECRET); }, iterator: () => { throw new Error(SECRET); } } as unknown as NextApiRequest;
  const response = sink(); await handleVerifyNodeRequest(raw, response.target);
  expect(response.raw.statusCode).toBe(405); safeHeaders(response);
  expect(response.headers.get("allow")).toBe("POST, OPTIONS");
  expect(response.headers.get("content-type")).toBe("application/json");
  expect(response.body()).toBe(method === "HEAD" ? "" : JSON.stringify({ error: "method_not_allowed" }));
  expect(nativeRequest).not.toHaveBeenCalled(); expect(handleVerifyRequest).not.toHaveBeenCalled(); safeLogs();
});
it("OPTIONS204 is empty before headers/body access", async () => {
  const raw = { method: "OPTIONS", get headers() { throw new Error(SECRET); } } as unknown as NextApiRequest;
  const response = sink(); await handleVerifyNodeRequest(raw, response.target);
  expect(response.raw.statusCode).toBe(204); expect(response.body()).toBe(""); safeHeaders(response);
  expect(handleVerifyRequest).not.toHaveBeenCalled(); safeLogs();
});
it("POST converts headers/stream without constructing Fetch Request", async () => {
  const nativeRequest = vi.fn(() => { throw new Error(SECRET); }); vi.stubGlobal("Request", nativeRequest);
  vi.mocked(handleVerifyRequest).mockImplementation(async (request) => {
    expect(request.method).toBe("POST"); expect(request.headers.get("x-test-array")).toBe("first, second");
    expect(request.headers.has("x-undefined")).toBe(false);
    const parsed = await readJsonBody(request); expect(parsed).toEqual({ ok: true, value: { fake: true } });
    return Response.json({ accepted: true });
  });
  const response = sink(); await handleVerifyNodeRequest(incoming([Buffer.from('{"fake":true}')], { "x-test-array": ["first", "second"], "x-undefined": undefined }), response.target);
  expect(response.raw.statusCode).toBe(200); expect(response.body()).toBe('{"accepted":true}'); expect(nativeRequest).not.toHaveBeenCalled();
});
it("oversized-body cancellation drains without destroying the request socket", async () => {
  const request = incoming([Buffer.alloc(70 * 1024, 65), Buffer.from("FAKE_TAIL")]);
  const destroy = vi.spyOn(request, "destroy"); const resume = vi.spyOn(request, "resume");
  vi.mocked(handleVerifyRequest).mockImplementation(async (value) => {
    const parsed = await readJsonBody(value);
    expect(parsed).toEqual({ ok: false, message: "Request body is too large." });
    return Response.json({ error: "invalid_input" }, { status: 400 });
  });
  const response = sink(); await handleVerifyNodeRequest(request, response.target);
  expect(response.raw.statusCode).toBe(400); expect(destroy).not.toHaveBeenCalled(); expect(resume).toHaveBeenCalled();
});
it.each([Buffer.from("{"), Buffer.from([255])])("shared reader rejects malformed/invalidUTF8 transport bytes", async (bytes) => {
  vi.mocked(handleVerifyRequest).mockImplementation(async (value) => {
    expect(await readJsonBody(value)).toEqual({ ok: false, message: "Request body must be valid UTF-8 JSON." });
    return Response.json({ error: "invalid_input" }, { status: 400 });
  });
  const response = sink(); await handleVerifyNodeRequest(incoming([bytes]), response.target); expect(response.raw.statusCode).toBe(400);
});
it("header setup exceptions get a safe500 without logging exception text", async () => {
  const response = sink(); const request = { method: "POST", get headers() { throw new Error(SECRET); } } as unknown as NextApiRequest;
  await handleVerifyNodeRequest(request, response.target);
  expect(response.raw.statusCode).toBe(500); expect(response.body()).toBe('{"error":"internal_error"}'); safeHeaders(response); safeLogs();
});
it("body stream setup exceptions get the same sanitized500", async () => {
  const response = sink(); const request = { method: "POST", headers: {}, iterator: () => { throw new Error(SECRET); } } as unknown as NextApiRequest;
  await handleVerifyNodeRequest(request, response.target); expect(response.raw.statusCode).toBe(500); safeHeaders(response); safeLogs();
});
it("unexpected shared-handler errors never escape to framework logging", async () => {
  vi.mocked(handleVerifyRequest).mockRejectedValue(new Error(SECRET));
  const response = sink(); await handleVerifyNodeRequest(incoming([]), response.target);
  expect(response.raw.statusCode).toBe(500); expect(response.body()).not.toContain(SECRET); safeHeaders(response); safeLogs();
});
it("does not rethrow a failed response write or echo its error", async () => {
  const response = sink(); response.raw.setHeader.mockImplementation(() => { throw new Error(SECRET); });
  await expect(handleVerifyNodeRequest(incoming([]), response.target)).resolves.toBeUndefined();
  expect(response.raw.destroy).toHaveBeenCalledOnce(); safeLogs();
});
