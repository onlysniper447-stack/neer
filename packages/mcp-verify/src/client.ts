import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ToolInputSchema, ResultSchema } from "./schema.js";

export const DEFAULT_API_URL="https://neer-one.vercel.app";
export const TIMEOUT_MS=10_000;
export const MAX_RESPONSE_BYTES=64*1024;
export const UNAVAILABLE_MESSAGE="Do not send funds until verification succeeds.";
export interface ClientOptions {baseUrl?:string;fetch?:typeof fetch;timeoutMs?:number}
const loopback=new Set(["localhost","127.0.0.1","[::1]"]);
export function endpoint(base=DEFAULT_API_URL):string {
 const url=new URL(base);
 if(url.username||url.password||url.search||url.hash||url.pathname!=="/"||(url.protocol!=="https:"&&!(url.protocol==="http:"&&loopback.has(url.hostname))))throw new Error("Invalid verification service origin.");
 return new URL("/api/v1/verify",url).href;
}
function failure(code:string,message:string):CallToolResult {
 return {isError:true,content:[{type:"text",text:JSON.stringify({code,message})}]};
}
/** Read-only HTTP adapter. All failures are sanitized tool errors, never fabricated pass results. */
export async function callVerify(raw:unknown,options:ClientOptions={}):Promise<CallToolResult> {
 const parsed=ToolInputSchema.safeParse(raw);
 if(!parsed.success)return failure("invalid_input","Verification input is not valid.");
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),options.timeoutMs??TIMEOUT_MS);
 let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
 try {
  const res=await (options.fetch??fetch)(endpoint(options.baseUrl),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(parsed.data),signal:controller.signal,redirect:"error",credentials:"omit",cache:"no-store"});
  if(!res.ok||!res.headers.get("content-type")?.toLowerCase().startsWith("application/json")||!res.body)throw new Error("Unavailable response.");
  const length=res.headers.get("content-length");if(length&&(!/^\d+$/.test(length)||Number(length)>MAX_RESPONSE_BYTES))throw new Error("Response too large.");
  reader=res.body.getReader();const chunks:Uint8Array[]=[];let size=0;
  while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>MAX_RESPONSE_BYTES)throw new Error("Response too large.");chunks.push(chunk.value);}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.byteLength;}
  const json:unknown=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));
  const result=ResultSchema.safeParse(json);if(!result.success)throw new Error("Invalid response.");
  // JSON first, then the API's verbatim status as a one-line summary. No invented API text.
  return {content:[{type:"text",text:JSON.stringify(result.data)},{type:"text",text:result.data.status}]};
 } catch {
  return failure("quote_unavailable",UNAVAILABLE_MESSAGE);
 } finally {
  clearTimeout(timer);controller.abort();
  try {await reader?.cancel();}catch{/* No raw error or sensitive payload is logged. */}
 }
}
