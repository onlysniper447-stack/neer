import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { VerifyInputSchema } from "@neer/verify";
import { callVerify, endpoint, DEFAULT_API_URL, MAX_RESPONSE_BYTES, UNAVAILABLE_MESSAGE } from "../src/client.js";
import { ToolInputSchema } from "../src/schema.js";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"../../..");
import { input, pass } from "./fixtures.js";
const warning={code:"SOURCE_UNKNOWN",severity:"warn",message:"Tell us if you're sending from your own wallet or from an exchange.",fix:"Say wallet or exchange."};
const blocking={code:"QUOTE_EXPIRED",severity:"block",message:"This quote has expired. Don't send to this address. Get a new quote from your app.",fix:"Get a new quote."};
const response=(data:unknown)=>new Response(JSON.stringify(data),{headers:{"content-type":"application/json","x-neer-verify-version":"1.0.0"}});
const unavailable={isError:true,content:[{type:"text",text:JSON.stringify({code:"quote_unavailable",message:UNAVAILABLE_MESSAGE})}]};

describe("API adapter",()=>{
 for(const [status,findings] of [["pass",[]],["warn",[warning]],["block",[blocking]]] as const)it("returns "+status+" JSON first, then only its verbatim status",async()=>{
  const result={...pass,status,findings};const fetcher=vi.fn(async()=>response(result));
  const output=await callVerify(input,{fetch:fetcher});expect(output).toEqual({content:[{type:"text",text:JSON.stringify(result)},{type:"text",text:status}]});
  expect(fetcher).toHaveBeenCalledTimes(1);const [url,init]=fetcher.mock.calls[0]! as unknown as [string,RequestInit];
  expect(url).toBe(DEFAULT_API_URL+"/api/v1/verify");expect(init).toMatchObject({method:"POST",redirect:"error",credentials:"omit",cache:"no-store"});
  expect(init.headers).toEqual({"Content-Type":"application/json"});expect(JSON.parse(init.body as string)).toEqual(input);
 });
 it("preserves API business unavailable as block rather than a transport error",async()=>{
  const result={...pass,status:"block",quote:null,findings:[{...blocking,code:"QUOTE_UNAVAILABLE",message:"NEAR Intents didn't answer. Wait a minute and try again before you send."}]};
  expect(await callVerify(input,{fetch:async()=>response(result)})).toEqual({content:[{type:"text",text:JSON.stringify(result)},{type:"text",text:"block"}]});
 });
 it("sanitizes rejected fetch errors and emits no console logging",async()=>{
  const out=vi.spyOn(console,"log").mockImplementation(()=>{});const err=vi.spyOn(console,"error").mockImplementation(()=>{});
  try{expect(await callVerify(input,{fetch:async()=>{throw Error("FAKE_PRIVATE_MEMO_ADDRESS_URL");}})).toEqual(unavailable);expect(out).not.toHaveBeenCalled();expect(err).not.toHaveBeenCalled();}finally{out.mockRestore();err.mockRestore();}
 });
 it.each([400,401,404,429,500,302])("fails closed on HTTP %s without echoing bodies",async(status)=>{expect(await callVerify(input,{fetch:async()=>new Response("FAKE_PRIVATE_BODY",{status})})).toEqual(unavailable);});
 const invalid:Record<string,unknown>={
  "null result":null,"unknown version":{...pass,version:"2.0.0"},"unknown top-level field":{...pass,address:"FAKE_PRIVATE"},
  "pass with block finding":{...pass,findings:[blocking]},"pass with warn finding":{...pass,findings:[warning]},"warn without finding":{...pass,status:"warn"},"block without finding":{...pass,status:"block"},
  "pass without verified quote":{...pass,quote:null},"unverified quote":{...pass,quote:{...pass.quote,verified:false}},"expired at check":{...pass,quote:{...pass.quote,expiresAt:pass.checkedAt}},
  "quote leaks address":{...pass,quote:{...pass.quote,depositAddress:"FAKE_PRIVATE"}},"unknown finding":{...pass,status:"warn",findings:[{...warning,code:"UNKNOWN_FUTURE_CODE"}]},
  "unknown severity":{...pass,status:"warn",findings:[{...warning,severity:"unknown"}]},"invalid time":{...pass,checkedAt:"yesterday"},"unknown finding property":{...pass,status:"warn",findings:[{...warning,rawMemo:"FAKE_PRIVATE"}]},
 };
 it.each(Object.entries(invalid))("rejects invalid response: %s",async(_name,value)=>{expect(await callVerify(input,{fetch:async()=>response(value)})).toEqual(unavailable);});
 it("rejects non-JSON type and malformed JSON",async()=>{
  expect(await callVerify(input,{fetch:async()=>new Response("{}",{headers:{"content-type":"text/html"}})})).toEqual(unavailable);
  expect(await callVerify(input,{fetch:async()=>new Response("{FAKE_SECRET",{headers:{"content-type":"application/json"}})})).toEqual(unavailable);
 });
 it("rejects malformed UTF-8",async()=>{expect(await callVerify(input,{fetch:async()=>new Response(Uint8Array.of(0xff),{headers:{"content-type":"application/json"}})})).toEqual(unavailable);});
 it("bounds content length before reading and cancels oversized streams",async()=>{
  expect(await callVerify(input,{fetch:async()=>new Response("{}",{headers:{"content-type":"application/json","content-length":String(MAX_RESPONSE_BYTES+1)}})})).toEqual(unavailable);
  let cancelled=false;const body=new ReadableStream<Uint8Array>({start(c){c.enqueue(new Uint8Array(MAX_RESPONSE_BYTES+1));},cancel(){cancelled=true;}});
  expect(await callVerify(input,{fetch:async()=>new Response(body,{headers:{"content-type":"application/json"}})})).toEqual(unavailable);expect(cancelled).toBe(true);
 });
 it("enforces the fetch timeout without exposing the raw error",async()=>{
  const fetcher:typeof fetch=async(_url,init)=>new Promise((_resolve,reject)=>{init!.signal!.addEventListener("abort",()=>reject(Error("FAKE_PRIVATE_TIMEOUT")),{once:true});});
  expect(await callVerify(input,{fetch:fetcher,timeoutMs:5})).toEqual(unavailable);
 });
 it("enforces timeout while reading a stalled response body",async()=>{
  const fetcher:typeof fetch=async(_url,init)=>new Response(new ReadableStream({start(c){init!.signal!.addEventListener("abort",()=>c.error(Error("FAKE_BODY_TIMEOUT")),{once:true});}}),{headers:{"content-type":"application/json"}});
  expect(await callVerify(input,{fetch:fetcher,timeoutMs:5})).toEqual(unavailable);
 });
 it("passes all approved context to HTTP and preserves omitted source as unknown",async()=>{
  const detailed={...input,memo:"FAKE_SEND",lookupMemo:"FAKE_LOOKUP",transfer:{chainId:1,from:"FAKE_FROM",to:"FAKE_TO"}};
  const fetcher=vi.fn(async()=>response(pass));await callVerify(detailed,{fetch:fetcher});expect(JSON.parse((fetcher.mock.calls[0]! as unknown as [string,RequestInit])[1].body as string)).toEqual(detailed);
  const {source:_source,...without}=input;await callVerify(without,{fetch:fetcher});expect(JSON.parse((fetcher.mock.calls[1]! as unknown as [string,RequestInit])[1].body as string).source).toBe("unknown");
 });
 it.each(["quoteId","quote","rules","key","tx","unexpected"])("rejects unsupported %s before fetch",async(field)=>{
  const fetcher=vi.fn();expect((await callVerify({...input,[field]:"FAKE"},{fetch:fetcher})).isError).toBe(true);expect(fetcher).not.toHaveBeenCalled();
 });
 it("rejects unknown nested transfer fields before fetch",async()=>{const fetcher=vi.fn();expect((await callVerify({...input,transfer:{tx:"FAKE"}},{fetch:fetcher})).isError).toBe(true);expect(fetcher).not.toHaveBeenCalled();});
 it("matches canonical input parsing on every recorded public fixture and invalid boundary",()=>{
  const fixtureDir=resolve(root,"fixtures/quotes");let count=0;
  for(const f of readdirSync(fixtureDir).filter(f=>f.endsWith(".json"))){const file=JSON.parse(readFileSync(resolve(fixtureDir,f),"utf8")) as {scenarios:{publicReplay:{input:unknown}}[]};for(const s of file.scenarios){expect(ToolInputSchema.safeParse(s.publicReplay.input)).toEqual(VerifyInputSchema.safeParse(s.publicReplay.input));count++;}}
  for(const data of [{...input,amount:"1e3"},{...input,token:"FAKE"},{...input,transfer:{chainId:Number.MAX_SAFE_INTEGER+1}},{...input,lookupMemo:"FAKE SPACE"}])expect(ToolInputSchema.safeParse(data)).toEqual(VerifyInputSchema.safeParse(data));
  expect(count).toBe(72);
 });
 it.each(["https://user:secret@example.test","https://example.test/path","https://example.test/?secret=FAKE","https://example.test/#FAKE","http://example.test","file:///tmp/FAKE"])("rejects unsafe configured origin %s",(url)=>{expect(()=>endpoint(url)).toThrow();});
 it("allows explicit HTTPS/loopback origins only and pins the path",()=>{expect(endpoint()).toBe(DEFAULT_API_URL+"/api/v1/verify");expect(endpoint("http://127.0.0.1:3510")).toBe("http://127.0.0.1:3510/api/v1/verify");expect(endpoint("https://example.test/")).toBe("https://example.test/api/v1/verify");});
});
