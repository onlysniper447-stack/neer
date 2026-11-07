import { createServer as httpServer } from "node:http";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it } from "vitest";
import { TOOL_DESCRIPTION, TOOL_NAME } from "../src/server.js";
import { UNAVAILABLE_MESSAGE } from "../src/client.js";
import { input, pass } from "./fixtures.js";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"../../..");
const cli=resolve(root,"packages/mcp-verify/dist/cli.js");
const exact="Checks a NEAR Intents deposit (address, network, token, amount, memo) against its signed quote before funds are sent. Returns pass, warn, or block with reasons. Call this after getting a deposit address and before the user or agent sends funds. Does not sign or submit transactions.";

describe("actual stdio process",()=>{
 it("lists exactly one described strict tool, rejects extra inputs, and returns actual HTTP JSON then status",async()=>{
  let calls=0;let mode="pass";const received:unknown[]=[];
  const upstream=httpServer((req,res)=>{
   calls++;expect(req.url).toBe("/api/v1/verify");expect(req.method).toBe("POST");expect(req.headers.authorization).toBeUndefined();
   let body="";req.on("data",(part:Buffer)=>{body+=part.toString();});req.on("end",()=>{
    received.push(JSON.parse(body));
    if(mode==="network"){req.socket.destroy();return;}
    if(mode==="invalid"){res.setHeader("content-type","application/json");res.end('{"status":"pass"}');return;}
    const finding={code:mode==="warn"?"SOURCE_UNKNOWN":"QUOTE_EXPIRED",severity:mode,message:"FAKE_RETURNED_MESSAGE",fix:"FAKE_RETURNED_FIX"};
    res.setHeader("content-type","application/json");res.setHeader("x-neer-verify-version","1.0.0");res.end(JSON.stringify({...pass,status:mode,findings:mode==="pass"?[]:[finding]}));
   });
  });
  await new Promise<void>(r=>upstream.listen(0,"127.0.0.1",r));const address=upstream.address();if(!address||typeof address==="string")throw Error("fixture bind failed");
  const transport=new StdioClientTransport({command:process.execPath,args:[cli],env:{NEER_API_URL:`http://127.0.0.1:${address.port}`},stderr:"pipe"});
  let stderr="";transport.stderr?.on("data",(chunk:Buffer)=>{stderr+=chunk.toString();});
  const client=new Client({name:"fake-local-test",version:"1.0.0"});
  try {
   await client.connect(transport);const list=await client.listTools();expect(calls).toBe(0);expect(list.tools).toHaveLength(1);
   const tool=list.tools[0]!;expect(tool.name).toBe(TOOL_NAME);expect(tool.description).toBe(exact);expect(TOOL_DESCRIPTION).toBe(exact);expect(tool.inputSchema.additionalProperties).toBe(false);
   const fields=tool.inputSchema.properties as Record<string,{description?:string;properties?:Record<string,{description?:string}>;additionalProperties?:boolean}>;
   expect(Object.keys(fields)).toEqual(["depositAddress","network","token","amount","memo","lookupMemo","source","transfer"]);
   for(const field of Object.values(fields))expect(field.description?.length).toBeGreaterThan(5);
   expect(fields.transfer!.additionalProperties).toBe(false);for(const field of Object.values(fields.transfer!.properties!))expect(field.description?.length).toBeGreaterThan(5);
   expect(tool.inputSchema.required).toEqual(["depositAddress","network","token","amount"]);
   for(const invalid of [{...input,quoteId:"FAKE_DEFERRED"},{...input,transfer:{sign:"FAKE"}},{...input,amount:"1e4"}]){const result=await client.callTool({name:TOOL_NAME,arguments:invalid});expect(result.isError).toBe(true);}
   expect(calls).toBe(0);
   for(mode of ["pass","warn","block"]){
    const result=CallToolResultSchema.parse(await client.callTool({name:TOOL_NAME,arguments:input}));expect(result.isError).not.toBe(true);expect(result.content).toHaveLength(2);
    const first=result.content[0]!;expect(first.type).toBe("text");if(first.type!=="text")throw Error("expected JSON text");const data=JSON.parse(first.text) as typeof pass;expect(data.status).toBe(mode);expect(result.content[1]).toEqual({type:"text",text:mode});
    expect(first.text).toBe(JSON.stringify({...pass,status:mode,findings:mode==="pass"?[]:[{code:mode==="warn"?"SOURCE_UNKNOWN":"QUOTE_EXPIRED",severity:mode,message:"FAKE_RETURNED_MESSAGE",fix:"FAKE_RETURNED_FIX"}]}));
   }
   for(mode of ["network","invalid"]){const result=await client.callTool({name:TOOL_NAME,arguments:input});expect(result).toMatchObject({isError:true,content:[{type:"text",text:JSON.stringify({code:"quote_unavailable",message:UNAVAILABLE_MESSAGE})}]});}
   expect(calls).toBe(5);expect(received).toEqual(Array.from({length:5},()=>input));expect(stderr).toBe("");
  } finally {await client.close();await transport.close();upstream.closeAllConnections();await new Promise<void>(r=>upstream.close(()=>r()));}
 },15_000);
 it("writes only JSON-RPC protocol lines to raw stdout, with no startup banner",async()=>{
  const child=spawn(process.execPath,[cli],{env:{PATH:process.env.PATH,NEER_API_URL:"http://127.0.0.1:1"},stdio:["pipe","pipe","pipe"]});
  let stdout="",stderr="";child.stderr.on("data",(b:Buffer)=>{stderr+=b.toString();});
  try {
   const response=new Promise<void>((done,reject)=>{const timer=setTimeout(()=>reject(Error("FAKE_STDIO_TIMEOUT")),5000);child.stdout.on("data",(b:Buffer)=>{stdout+=b.toString();try{const lines=stdout.trim().split("\n").map(x=>JSON.parse(x) as {id?:number});if(lines.some(x=>x.id===2)){clearTimeout(timer);done();}}catch{/* Wait for a complete protocol line. */}});child.on("error",reject);});
   child.stdin.write(JSON.stringify({jsonrpc:"2.0",id:1,method:"initialize",params:{protocolVersion:"2025-03-26",capabilities:{},clientInfo:{name:"fake-raw-test",version:"1.0.0"}}})+"\n");
   child.stdin.write(JSON.stringify({jsonrpc:"2.0",method:"notifications/initialized"})+"\n");
   child.stdin.write(JSON.stringify({jsonrpc:"2.0",id:2,method:"tools/list",params:{}})+"\n");await response;
   const lines=stdout.trim().split("\n").map(x=>JSON.parse(x) as {jsonrpc:string;result?:{tools?:unknown[]}});expect(lines.every(x=>x.jsonrpc==="2.0")).toBe(true);expect(lines.some(x=>x.result?.tools?.length===1)).toBe(true);expect(stderr).toBe("");
  } finally {child.stdin.end();child.kill("SIGTERM");await new Promise<void>(r=>child.once("close",()=>r()));}
 },10_000);
 it("sanitizes invalid startup origin without printing the configured secret",async()=>{
  const child=spawn(process.execPath,[cli],{env:{NEER_API_URL:"https://FAKE_USER:FAKE_PASSWORD@example.test/"},stdio:["pipe","pipe","pipe"]});let stdout="",stderr="";child.stdout.on("data",(b:Buffer)=>{stdout+=b.toString();});child.stderr.on("data",(b:Buffer)=>{stderr+=b.toString();});
  const exit=await new Promise<number|null>(r=>child.once("close",r));expect(exit).toBe(1);expect(stdout).toBe("");expect(stderr).toBe("Neer MCP could not start.\n");
 });
 it("ships no unpublished workspace imports or HTTP quote client in its CLI bundle",()=>{
  const bundle=readFileSync(cli,"utf8");expect(bundle.startsWith("#!/usr/bin/env node")).toBe(true);expect(bundle).not.toMatch(/from ["'](?:@neer\/|\.\.\/)/);expect(bundle).not.toContain("OneClickClient");expect(bundle).not.toContain("ONECLICK_JWT");
  const manifest=JSON.parse(readFileSync(resolve(root,"packages/mcp-verify/package.json"),"utf8")) as {dependencies:Record<string,string>;license:string;bin:Record<string,string>};expect(Object.keys(manifest.dependencies).sort()).toEqual(["@modelcontextprotocol/sdk","zod"]);expect(manifest.license).toBe("MIT");expect(manifest.bin).toEqual({"neer-mcp-verify":"./dist/cli.js"});
 });
});
