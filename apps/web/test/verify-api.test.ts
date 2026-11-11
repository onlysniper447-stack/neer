import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { FINDING_CODES, VERIFY_VERSION } from "@neer/verify";
import { bundle, input, NOW, PUBLIC_KEY, DEPOSIT, sign } from "../../../packages/verify/test/fixtures";

vi.mock("@/lib/server/upstream-node", async () => {
  const { PUBLIC_KEY } = await import("../../../packages/verify/test/fixtures");
  return { getStatus: vi.fn(), getTokens: vi.fn(), quotePublicKeyOverride: PUBLIC_KEY };
});
vi.mock("@/lib/server/rate-limit-node", async (original) => {
  const actual = await original<typeof import("@/lib/server/rate-limit-node")>();
  return { ...actual, rateLimit: vi.fn(async (bucket: Parameters<typeof actual.memoryLimit>[0], id: string) => actual.memoryLimit(bucket, id)) };
});

const upstream = await import("@/lib/server/upstream-node");
const limits = await import("@/lib/server/rate-limit-node");
const service = await import("@/lib/server/verify-service");
const { handleVerifyRequest } = await import("@/lib/server/verify-handler");
const { logVerification, verifyMethodResponse } = await import("@/lib/server/verify-http");
const route = await import("@/pages/api/v1/verify");
let logger: MockInstance;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(NOW);
  limits.resetMemoryLimits();
  vi.mocked(limits.rateLimit).mockReset().mockImplementation(async (bucket, id) => limits.memoryLimit(bucket, id));
  vi.mocked(upstream.getStatus).mockReset().mockResolvedValue(bundle().lookup);
  vi.mocked(upstream.getTokens).mockReset().mockResolvedValue({ tokens: bundle().tokens, fresh: true, fetchedAt: NOW.getTime() });
  logger = vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

function request(body: unknown = input(), method = "POST", headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/v1/verify", { method, headers: { "Content-Type": "application/json", "Origin": "https://untrusted.invalid", "X-Forwarded-For": "192.0.2.10", ...headers }, ...(method === "GET" || method === "HEAD" ? {} : { body: JSON.stringify(body) }) });
}
function assertHeaders(response: Response) {
  expect(response.headers.get("X-Neer-Verify-Version")).toBe(VERIFY_VERSION);
  expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  expect(response.headers.get("Access-Control-Allow-Credentials")).toBeNull();
  expect(response.headers.get("Access-Control-Allow-Methods")).toBe("POST, OPTIONS");
  expect(response.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type");
  expect(response.headers.get("Access-Control-Expose-Headers")).toBe("X-Neer-Verify-Version, Retry-After");
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(response.headers.get("Content-Security-Policy")).toBe("default-src 'none'; frame-ancestors 'none'");
  expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
}
function logs() { return logger.mock.calls.map(([line]) => JSON.parse(String(line)) as Record<string, unknown>); }
function assertSafeLogs(forbidden: string[] = []) {
  for (const record of logs()) {
    expect(Object.keys(record).sort()).toEqual(["findingCodes", "status", "timestamp", "version"]);
    expect(record.version).toBe(VERIFY_VERSION); expect(record.timestamp).toBe(NOW.toISOString());
    expect(typeof record.status).toBe("number");
    expect((record.findingCodes as string[]).every((code) => (FINDING_CODES as readonly string[]).includes(code))).toBe(true);
    for (const value of forbidden) expect(JSON.stringify(record)).not.toContain(value);
  }
}

describe("public verify route", () => {
  it("exports the scoped raw Node adapter with eager parsing disabled", () => {
    expect(route.config.api.bodyParser).toBe(false);
    expect(typeof route.default).toBe("function");
  });
  it("returns the exact public 200 pass shape and uses fresh existing upstream lookup", async () => {
    const response = await handleVerifyRequest(request()); const body = await response.json();
    expect(response.status).toBe(200); assertHeaders(response);
    expect(Object.keys(body).sort()).toEqual(["checkedAt", "findings", "quote", "status", "version"]);
    expect(body).toMatchObject({ status: "pass", findings: [], version: VERIFY_VERSION, quote: { amount: "5", verified: true } });
    expect(upstream.getStatus).toHaveBeenCalledWith(DEPOSIT, null, { dedupe: false });
    expect(limits.rateLimit).toHaveBeenCalledWith("verify", "192.0.2.10");
    expect(logs()).toHaveLength(1); assertSafeLogs([DEPOSIT, "fake-usdc", "192.0.2.10"]);
  });
  it("business warning remains HTTP200 and unknown source never passes", async () => {
    const body: Record<string, unknown> = { ...input() }; delete body.source;
    const response = await handleVerifyRequest(request(body));const result = await response.json();
    expect(response.status).toBe(200);expect(result.status).toBe("warn");
    expect(result.findings).toContainEqual(expect.objectContaining({code:"SOURCE_UNKNOWN",severity:"warn"}));
    assertHeaders(response);
  });
  it("business block remains HTTP200 on a network mismatch", async () => {
    const response=await handleVerifyRequest(request({...input(),network:"base"}));
    expect(response.status).toBe(200);expect(await response.json()).toMatchObject({status:"block",findings:expect.arrayContaining([expect.objectContaining({code:"NETWORK_MISMATCH"})])});
  });
  it("upstream lookup failure is HTTP200 block with QUOTE_UNAVAILABLE and null quote", async () => {
    vi.mocked(upstream.getStatus).mockResolvedValue({kind:"error",reason:"timeout"});
    const response=await handleVerifyRequest(request());assertHeaders(response);
    expect(response.status).toBe(200);expect(await response.json()).toMatchObject({status:"block",quote:null,findings:[expect.objectContaining({code:"QUOTE_UNAVAILABLE",severity:"block"})]});
    expect(logs()[0]?.findingCodes).toEqual(["QUOTE_UNAVAILABLE"]);
  });
  it("a thrown upstream exception is fail-closed and is never logged or returned", async () => {
    vi.mocked(upstream.getStatus).mockRejectedValue(new Error("FAKE_EXCEPTION_"+DEPOSIT));
    const response=await handleVerifyRequest(request());const body=await response.json();
    expect(response.status).toBe(200);expect(body.status).toBe("block");expect(JSON.stringify(body)).not.toContain("FAKE_EXCEPTION_");
    assertSafeLogs([DEPOSIT,"FAKE_EXCEPTION_"]);
  });
  it("uses separate lookup and declared memos and never logs message values", async () => {
    const b=bundle();if(b.lookup.kind!=="found")throw new Error("fake invariant");
    b.lookup.status.quoteResponse.quote.depositMemo="FAKE_LOOKUP_MEMO_SENSITIVE";
    b.lookup.status.quoteResponse=sign(b.lookup.status.quoteResponse);
    vi.mocked(upstream.getStatus).mockResolvedValue(b.lookup);
    const response=await handleVerifyRequest(request({...input(),lookupMemo:"FAKE_LOOKUP_MEMO_SENSITIVE",memo:"FAKE_SEND_MEMO_SENSITIVE",transfer:{chainId:1}}));
    const body=await response.json();expect(body.status).toBe("block");
    expect(body.findings).toContainEqual(expect.objectContaining({code:"MEMO_MISMATCH"}));
    expect(upstream.getStatus).toHaveBeenCalledWith(DEPOSIT,"FAKE_LOOKUP_MEMO_SENSITIVE",{dedupe:false});
    assertSafeLogs([DEPOSIT,"FAKE_LOOKUP_MEMO_SENSITIVE","FAKE_SEND_MEMO_SENSITIVE"]);
  });
  it("unexpected service exception returns generic500 without leaking or logging it", async () => {
    vi.spyOn(service,"verifyService").mockRejectedValue(new Error("FAKE_PRIVATE_ERROR "+DEPOSIT+" FAKE_MEMO FAKE_QUOTE_ID 123.456789"));
    const response=await handleVerifyRequest(request());expect(response.status).toBe(500);assertHeaders(response);
    expect(await response.json()).toEqual({error:"internal_error"});assertSafeLogs([DEPOSIT,"FAKE_PRIVATE_ERROR","FAKE_MEMO","FAKE_QUOTE_ID","123.456789"]);
  });
  it("unexpected limiter exception uses the same sanitized500 response", async () => {
    vi.mocked(limits.rateLimit).mockRejectedValue(new Error(DEPOSIT));
    const response=await handleVerifyRequest(request());expect(response.status).toBe(500);assertHeaders(response);
    expect(await response.json()).toEqual({error:"internal_error"});expect(upstream.getStatus).not.toHaveBeenCalled();assertSafeLogs([DEPOSIT]);
  });
});

const invalidCases: [string, (body: Record<string,unknown>)=>unknown][] = [
  ...["depositAddress","network","token","amount"].map((key):[string,(body:Record<string,unknown>)=>unknown]=>["missing "+key,(b)=>{delete b[key];return b;}]),
  ["null root",()=>null],["array root",()=>[]],["string root",()=>"FAKE_SENSITIVE_ROOT"],
  ["address type",b=>({...b,depositAddress:17})],["empty address",b=>({...b,depositAddress:""})],
  ["short address",b=>({...b,depositAddress:"ab"})],["long address",b=>({...b,depositAddress:"F".repeat(129)})],
  ["address URL",b=>({...b,depositAddress:"https://fake.invalid/private"})],
  ["network type",b=>({...b,network:3})],["network upper case",b=>({...b,network:"ETH"})],["long network",b=>({...b,network:"a".repeat(33)})],
  ["token type",b=>({...b,token:null})],["token shorthand",b=>({...b,token:"USDC"})],["long token",b=>({...b,token:"nep141:"+"a".repeat(256)})],
  ["amount number",b=>({...b,amount:5})],["negative amount",b=>({...b,amount:"-5"})],["empty amount",b=>({...b,amount:" "})],
  ["exponent amount",b=>({...b,amount:"5e6"})],["bad commas",b=>({...b,amount:"50,00"})],["long amount",b=>({...b,amount:"1".repeat(257)})],
  ["precision overflow",b=>({...b,amount:"5.0000001"})],["converted size overflow",b=>({...b,amount:"1".repeat(256)})],
  ["memo spaces",b=>({...b,memo:"FAKE MEMO"})],["memo long",b=>({...b,memo:"M".repeat(129)})],["memo type",b=>({...b,memo:13})],
  ["lookup memo invalid",b=>({...b,lookupMemo:"FAKE\nMEMO"})],["source invalid",b=>({...b,source:"FAKE_SOURCE"})],
  ["transfer null",b=>({...b,transfer:null})],["transfer array",b=>({...b,transfer:[]})],
  ["chain zero",b=>({...b,transfer:{chainId:0}})],["chain fractional",b=>({...b,transfer:{chainId:1.5}})],
  ["chain unsafe",b=>({...b,transfer:{chainId:9007199254740992}})],["sender type",b=>({...b,transfer:{from:1}})],
  ["sender long",b=>({...b,transfer:{from:"F".repeat(129)}})],["recipient empty",b=>({...b,transfer:{to:""}})],
  ["transfer unknown",b=>({...b,transfer:{[DEPOSIT]:"FAKE_SECRET_VALUE"}})],
  ["unknown address key",b=>({...b,[DEPOSIT]:"FAKE_SECRET_VALUE"})],
  ...["quoteId","quote","quotePublicKey","rules","tx"].map((key):[string,(body:Record<string,unknown>)=>unknown]=>["unsupported "+key,b=>({...b,[key]:"FAKE_SECRET_VALUE"})]),
];
describe("strict validation and privacy",()=>{
  it.each(invalidCases)("400: %s",async(_name,change)=>{
    const response=await handleVerifyRequest(request(change({...input()})));expect(response.status).toBe(400);assertHeaders(response);
    const body=await response.json();expect(Object.keys(body).sort()).toEqual(["details","error"]);
    expect(body.error).toBe("invalid_input");expect(body.details.length).toBeGreaterThan(0);expect(body.details.length).toBeLessThanOrEqual(20);
    for(const value of [DEPOSIT,"FAKE_SECRET_VALUE","FAKE_SENSITIVE_ROOT","https://fake.invalid/private"])expect(JSON.stringify(body)).not.toContain(value);
    assertSafeLogs([DEPOSIT,"FAKE_SECRET_VALUE","FAKE_SENSITIVE_ROOT"]);
  });
  it.each(["{", "", "[invalid]"])("400 malformed JSON: %s",async(body)=>{
    const response=await handleVerifyRequest(new Request("http://localhost/api/v1/verify",{method:"POST",headers:{"Content-Type":"application/json"},body}));
    expect(response.status).toBe(400);assertHeaders(response);expect(upstream.getStatus).not.toHaveBeenCalled();
  });
  it("rejects invalid UTF8 without reflecting bytes",async()=>{
    const response=await handleVerifyRequest(new Request("http://localhost/api/v1/verify",{method:"POST",headers:{"Content-Type":"application/json"},body:new Uint8Array([255])}));
    expect(response.status).toBe(400);assertHeaders(response);expect(upstream.getStatus).not.toHaveBeenCalled();
  });
  it("rejects a streamed body above64KiB",async()=>{
    const response=await handleVerifyRequest(request({...input(),memo:"F".repeat(65536)}));
    expect(response.status).toBe(400);expect(await response.json()).toMatchObject({error:"invalid_input",details:[{path:"",message:"Request body is too large."}]});
    expect(upstream.getStatus).not.toHaveBeenCalled();assertSafeLogs([DEPOSIT]);
  });
  it("rejects non-JSON content type without calling upstream",async()=>{
    const response=await handleVerifyRequest(request(input(),"POST",{"Content-Type":"text/plain"}));expect(response.status).toBe(400);expect(upstream.getStatus).not.toHaveBeenCalled();assertHeaders(response);
  });
  it("does not fetch for lexical validation failures",async()=>{
    await handleVerifyRequest(request({...input(),quoteId:"FAKE_QUOTE_ID"}));expect(upstream.getStatus).not.toHaveBeenCalled();
  });
  it("filters fabricated code values and tolerates a broken logger",()=>{
    logVerification(500,[DEPOSIT as typeof FINDING_CODES[number],"QUOTE_UNAVAILABLE"]);expect(logs()[0]?.findingCodes).toEqual(["QUOTE_UNAVAILABLE"]);
    logger.mockImplementation(()=>{throw new Error(DEPOSIT);});expect(()=>logVerification(500)).not.toThrow();
  });
});

describe("methods and quota",()=>{
  it.each(["GET","HEAD","PUT","PATCH","DELETE"])("405 %s with safe headers",async(method)=>{
    const response=await handleVerifyRequest(request(undefined,method));expect(response.status).toBe(405);assertHeaders(response);
    expect(response.headers.get("Allow")).toBe("POST, OPTIONS");expect(await response.text()).toBe(method==="HEAD"?"":JSON.stringify({error:"method_not_allowed"}));
    expect(limits.rateLimit).not.toHaveBeenCalled();expect(upstream.getStatus).not.toHaveBeenCalled();assertSafeLogs();
  });
  it("also rejects framework-unsupported method names before dispatch",()=>{
    for(const method of ["TRACE","CONNECT","FAKE_METHOD"]) {const response=verifyMethodResponse(method)!;expect(response.status).toBe(405);assertHeaders(response);}
  });
  it("OPTIONS204 is empty, has CORS/version headers and consumes no quota",async()=>{
    const response=await handleVerifyRequest(request(undefined,"OPTIONS"));expect(response.status).toBe(204);expect(await response.text()).toBe("");assertHeaders(response);
    expect(limits.rateLimit).not.toHaveBeenCalled();expect(upstream.getStatus).not.toHaveBeenCalled();expect(logs()).toHaveLength(1);
  });
  it("allows60 POSTs per IP/minute then429 with Retry-After; other IPs and buckets are independent",async()=>{
    for(let i=0;i<30;i++)limits.memoryLimit("preflight","192.0.2.10");
    for(let i=0;i<60;i++)expect((await handleVerifyRequest(request({}))).status).toBe(400);
    const blocked=await handleVerifyRequest(request());expect(blocked.status).toBe(429);expect(blocked.headers.get("Retry-After")).toBe("60");assertHeaders(blocked);expect(await blocked.json()).toEqual({error:"rate_limited"});
    expect((await handleVerifyRequest(request({},"POST",{"X-Forwarded-For":"192.0.2.11"}))).status).toBe(400);
    expect(limits.memoryLimit("track","192.0.2.10").remaining).toBe(59);
    vi.setSystemTime(new Date(NOW.getTime()+60000));expect((await handleVerifyRequest(request({}))).status).toBe(400);
  });
});

it("OpenAPI describes exactly all public codes and the approved contract",()=>{
  // Reuse the YAML parser already pinned by the existing ESLint tooling.
  const req=createRequire(import.meta.url);const yaml=createRequire(req.resolve("eslint"))("js-yaml") as {load(value:string):unknown};
  const root=new URL("../../../",import.meta.url);
  const spec=yaml.load(readFileSync(new URL("openapi.yaml",root),"utf8")) as {components:{schemas:Record<string,Record<string,unknown>>};paths:Record<string,{post:{responses:Record<string,unknown>};options:{responses:Record<string,unknown>}}>};
  expect(spec.components.schemas.FindingCode?.enum).toEqual([...FINDING_CODES]);
  const schema=spec.components.schemas.VerifyInput!;expect(schema.additionalProperties).toBe(false);
  expect(schema.required).toEqual(["depositAddress","network","token","amount"]);
  const properties=schema.properties as Record<string,Record<string,unknown>>;
  expect(Object.keys(properties)).toEqual(["depositAddress","network","token","amount","memo","lookupMemo","expectedRecipient","expectedDestinationChain","source","transfer"]);
  expect(properties.transfer?.additionalProperties).toBe(false);expect(properties.source?.default).toBe("unknown");
  expect(spec.paths["/api/v1/verify"]?.post.responses).toHaveProperty("429");expect(Object.keys(spec.paths["/api/v1/verify"]!.options.responses)).toEqual(["204"]);
  const docs=readFileSync(new URL("docs/api.md",root),"utf8");
  expect(docs).toContain("A pass means the deposit details match the quote and the quote has not expired. It does not guarantee delivery, does not verify the counterparty, and cannot recover funds sent to the wrong address.");
  expect(spec.components.schemas.VerifyResult?.properties).toMatchObject({version:{const:VERIFY_VERSION}});
  expect(PUBLIC_KEY).toMatch(/^ed25519:/);
});
