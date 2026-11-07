import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { preflight } from "@neer/core";
import { VerifyInputError } from "@neer/verify";
import { legacy } from "../../../packages/verify/test/fixtures.js";
import { DeepLinkCheck } from "@/components/deep-link-check";
import { CopyCheckLink } from "@/components/copy-check-link";
const mocks=vi.hoisted(()=>({verify:vi.fn(),legacy:vi.fn(),rate:vi.fn(),headers:vi.fn()}));
vi.mock("@/lib/server/verify-service",()=>({verifyPageService:mocks.verify}));
vi.mock("@/lib/server/service",()=>({loadCheckPage:mocks.legacy,chainLabel:(s:string)=>s}));
vi.mock("@/lib/server/rate-limit",()=>({rateLimit:mocks.rate,clientIp:()=>"FAKE_IP"}));
vi.mock("next/headers",()=>({headers:mocks.headers}));
vi.mock("@/components/deposit-start",()=>({default:()=>createElement("div",{"data-testid":"unchanged-manual-start"})}));
const CheckPage=(await import("../app/(product)/check/page.js")).default;
const base={address:"FAKE_DEPOSIT_ADDRESS",network:"eth",token:"nep141:fake-usdc.omft.near",amount:"5"};
beforeEach(()=>{vi.clearAllMocks();mocks.rate.mockResolvedValue({ok:true});mocks.headers.mockResolvedValue(new Headers());mocks.verify.mockResolvedValue(preflight(legacy()));});
describe("server rendered automatic verification and preserved manual entry",()=>{
 it("leaves the no-parameter entry untouched without checks or rate lookup",async()=>{const html=renderToStaticMarkup(await CheckPage({searchParams:Promise.resolve({})}));expect(html).toContain("unchanged-manual-start");expect(mocks.verify).not.toHaveBeenCalled();expect(mocks.legacy).not.toHaveBeenCalled();expect(mocks.rate).not.toHaveBeenCalled();});
 it("preserves address-only legacy lookup and does not auto-verify it",async()=>{
  const l=legacy();l.lookup={kind:"error",reason:"timeout"};mocks.legacy.mockResolvedValue({result:preflight(l),tokens:[],hardStop:false,unavailable:true});
  const html=renderToStaticMarkup(await CheckPage({searchParams:Promise.resolve({address:base.address,memo:"FAKE_MEMO"})}));expect(mocks.legacy).toHaveBeenCalledWith(base.address,"FAKE_MEMO");expect(mocks.verify).not.toHaveBeenCalled();expect(html).toContain("Can&#x27;t check right now");
 });
 it("automatically runs complete context on the server and retains the full legacy result",async()=>{
  const node=await CheckPage({searchParams:Promise.resolve({...base,memo:"FAKE_SEND",lookupMemo:"FAKE_LOOKUP",source:"exchange",chainId:"1",from:"FAKE_FROM",to:"FAKE_TO"})});
  expect(mocks.verify).toHaveBeenCalledTimes(1);expect(mocks.verify).toHaveBeenCalledWith({depositAddress:base.address,network:"eth",token:base.token,amount:"5",memo:"FAKE_SEND",lookupMemo:"FAKE_LOOKUP",source:"exchange",transfer:{chainId:1,from:"FAKE_FROM",to:"FAKE_TO"}});
  expect(mocks.legacy).not.toHaveBeenCalled();expect(node.props.result).toEqual(preflight(legacy()));expect(node.props.result).toHaveProperty("signedQuote");expect(node.props.result).toHaveProperty("checksHash");expect(renderToStaticMarkup(node)).toContain('data-autocheck="complete"');
 });
 it("does not assume wallet when a complete link omits source",async()=>{await CheckPage({searchParams:Promise.resolve(base)});expect(mocks.verify.mock.calls[0]![0].source).toBe("unknown");});
 for(const [name,query] of Object.entries({partial:{address:base.address,network:"eth"},unknown:{...base,quoteId:"FAKE_ID"},repeated:{...base,address:[base.address,"FAKE_OTHER"]},legacyUnknown:{address:base.address,utm_source:"FAKE_PRIVATE"}}))it("invalid "+name+" shows editable prefills and never looks up/runs",async()=>{
  const html=renderToStaticMarkup(await CheckPage({searchParams:Promise.resolve(query)}));expect(html).toContain('data-autocheck="not-run"');expect(html).toContain('role="alert"');expect(html).toContain('method="get"');expect(html).not.toContain('data-testid="result"');expect(mocks.verify).not.toHaveBeenCalled();expect(mocks.legacy).not.toHaveBeenCalled();expect(mocks.rate).not.toHaveBeenCalled();expect(html).not.toContain("FAKE_PRIVATE");
 });
 it("shows sanitized metadata-dependent validation failure rather than a stale result",async()=>{mocks.verify.mockRejectedValue(new VerifyInputError([{path:"amount",message:"FAKE_PRIVATE_ERROR"}]));const html=renderToStaticMarkup(await CheckPage({searchParams:Promise.resolve(base)}));expect(html).toContain('data-autocheck="not-run"');expect(html).toContain("amount or optional fields");expect(html).not.toContain("FAKE_PRIVATE_ERROR");expect(html).not.toContain('data-testid="result"');});
 it("rate limit prevents server verification and presents editable details",async()=>{mocks.rate.mockResolvedValue({ok:false,retryAfterSec:17});const html=renderToStaticMarkup(await CheckPage({searchParams:Promise.resolve(base)}));expect(mocks.verify).not.toHaveBeenCalled();expect(html).toContain("17 seconds");expect(html).toContain('value="5"');});
 it("renders all canonical prefills and safe native GET navigation without an old verdict",()=>{
  const html=renderToStaticMarkup(createElement(DeepLinkCheck,{draft:{...base,memo:"",lookupMemo:"FAKE_LOOKUP",chainId:"1",from:"FAKE_FROM",to:"FAKE_TO",source:"unknown"},error:"Review these fields."}));
  for(const value of [base.address,base.token,"FAKE_LOOKUP","FAKE_FROM","FAKE_TO"])expect(html).toContain(`value="${value}"`);
  expect(html).toContain('action="/check"');expect(html).toContain('name="memo"');expect(html).toContain('value="unknown" selected');expect(html).not.toContain('data-testid="result"');
 });
 it("shows the declared human amount, not the suggested quote amount, for a safe result",()=>{
  const result=preflight(legacy());result.quote!.amountInFormatted="6";
  vi.useFakeTimers();vi.setSystemTime(new Date(result.serverTime));
  try {const html=renderToStaticMarkup(createElement(DeepLinkCheck,{draft:base,input:{depositAddress:base.address,network:"eth",token:base.token,amount:"5",source:"wallet"},result}));
  expect(html).toContain("5 FAKE on Ethereum");expect(html).not.toContain("6 FAKE on Ethereum");} finally {vi.useRealTimers();}
 });
 it("never renders an expired/stale safe finding as permission to send",()=>{
  const result=preflight(legacy());result.quote!.sendBefore=result.serverTime;
  const html=renderToStaticMarkup(createElement(DeepLinkCheck,{draft:base,input:{depositAddress:base.address,network:"eth",token:base.token,amount:"5",source:"wallet"},result}));
  expect(html).toContain('data-verdict="check"');expect(html).toContain("This result is out of date");expect(html).not.toContain('data-testid="send-exactly"');
 });
 it("copy control starts unchecked and describes both sensitive memo fields",()=>{const html=renderToStaticMarkup(createElement(CopyCheckLink,{input:{depositAddress:base.address,network:"eth",token:base.token,amount:"5",memo:"FAKE_SEND",lookupMemo:"FAKE_LOOKUP"}}));expect(html).toContain("Include memo in link");expect(html).toContain("both sending and lookup memos");expect(html).not.toContain("checked=");expect(html).not.toContain("FAKE_SEND");expect(html).not.toContain("FAKE_LOOKUP");});
 it("new paths cannot write query values to storage or analytics",()=>{
  for(const path of ["../lib/deep-links.ts","../components/deep-link-check.tsx","../components/copy-check-link.tsx","../lib/server/verify-service.ts"]){const source=readFileSync(new URL(path,import.meta.url),"utf8");expect(source).not.toMatch(/localStorage|sessionStorage|recordCheck|sendBeacon|console\.|gtag\(|analytics\./);}
  const result=readFileSync(new URL("../components/result-view.tsx",import.meta.url),"utf8");expect(result).toContain("key={copyContext(");
 });
});
