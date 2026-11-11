import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { RULES, verifyQuoteSignature, type PreflightInput, type QuoteResponse } from "@neer/core";
import { FINDING_CODES, VERIFY_VERSION, verifyDeposit, verifyLegacyPreflight, type Finding, type VerifyInput, type VerifyResult } from "../src/index.js";
import { projectVerification } from "../src/projection.js";
import { PUBLIC_KEY } from "./fixtures.js";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"../../..");
const read=(path:string)=>readFileSync(resolve(root,path),"utf8");
type Patch={op:"add"|"remove"|"replace";path:string;value?:unknown};
interface Replay {input:VerifyInput;expected?:VerifyResult;validationError?:boolean;targetProduced:boolean}
interface Scenario {id:string;targetCode:string;patches:Patch[];fault:null|"throw-first-rule"|"omit-first-rule";expected:Finding;publicReplay:Replay}
interface Family {fixtureKind:string;schemaVersion:number;verifierVersion:string;metadata:{clock:string;quotePublicKey:string;source:string};base:Record<string,unknown>;scenarios:Scenario[]}
const files=readdirSync(resolve(root,"fixtures/quotes")).filter(f=>f.endsWith(".json")).sort();
const families=files.map(f=>JSON.parse(read("fixtures/quotes/"+f)) as Family);
const all=families.flatMap(f=>f.scenarios.map(s=>({family:f,scenario:s})));
const decode=(s:string)=>s.replaceAll("&#124;","|").replaceAll("&lt;","<").replaceAll("&gt;",">").replaceAll("&amp;","&");
const rows=[...read("docs/findings.md").matchAll(/^\| <code>([A-Z0-9_]+)<\/code> \| (.*?) \| <code>(.*?)<\/code> \| (.*?) \| (.*?) \| (.*?) \|$/gm)];
function hydrate(f:Family,s?:Scenario):PreflightInput {
 const raw=structuredClone(f.base);
 for(const p of s?.patches??[]){
  const keys=p.path.slice(1).split("/");let target=raw;
  for(const key of keys.slice(0,-1)){expect(["__proto__","prototype","constructor"]).not.toContain(key);target=target[key] as Record<string,unknown>;}
  const key=keys.at(-1)!;expect(["__proto__","prototype","constructor"]).not.toContain(key);
  if(p.op==="remove")Reflect.deleteProperty(target,key);else target[key]=structuredClone(p.value);
 }
 const input=raw as unknown as PreflightInput;
 input.now=new Date(raw.now as string);
 if(input.lookup.kind==="found")input.lookup.fetchedAt=new Date(input.lookup.fetchedAt as unknown as string);
 return input;
}
function templates():Map<string,string>{
 const out=new Map<string,string>();
 for(const path of ["packages/core/src/checks.ts","packages/core/src/preflight.ts"]){
  const source=ts.createSourceFile(path,read(path),ts.ScriptTarget.Latest,true);
  function visit(n:ts.Node){
   if(ts.isCallExpression(n)&&n.expression.getText(source)==="r"){
    const c=n.arguments[0]!;const m=n.arguments[4]!;
    if(ts.isStringLiteral(c))out.set(c.text,ts.isStringLiteral(m)?m.text:m.getText(source).slice(1,-1));
   }
   if(ts.isObjectLiteralExpression(n)){
    const props=n.properties.filter(ts.isPropertyAssignment);
    const code=props.find(p=>p.name.getText(source)==="code")?.initializer;
    const message=props.find(p=>p.name.getText(source)==="message")?.initializer;
    if(code&&message&&ts.isStringLiteral(code)&&ts.isStringLiteral(message))out.set(code.text,message.text);
   }
   if(ts.isCallExpression(n)&&n.expression.getText(source)==="identifyCheck"){
    let obj=n.arguments[0];const c=n.arguments[1];
    if(obj&&ts.isIdentifier(obj)){
     const name=obj.text;let scope:ts.Node|undefined=n.parent;while(scope&&!ts.isBlock(scope))scope=scope.parent;
     if(scope&&ts.isBlock(scope))for(const stmt of scope.statements)if(ts.isVariableStatement(stmt))for(const decl of stmt.declarationList.declarations)if(ts.isIdentifier(decl.name)&&decl.name.text===name)obj=decl.initializer;
    }
    if(obj&&c&&ts.isObjectLiteralExpression(obj)&&ts.isStringLiteral(c)){
     const m=obj.properties.filter(ts.isPropertyAssignment).find(p=>p.name.getText(source)==="message")?.initializer;
     if(m&&ts.isStringLiteral(m))out.set(c.text,m.text);
    }
   }
   ts.forEachChild(n,visit);
  }visit(source);
 }
 return out;
}

describe("reference contract alignment",()=>{
 it("documents all 76 codes once, exact current templates, actions and introduced version",()=>{
  expect(rows.map(r=>r[1])).toEqual([...FINDING_CODES]);const current=templates();
  for(const r of rows){expect(decode(r[3]!)).toBe(current.get(r[1]!));expect(r[4]!.length).toBeGreaterThan(3);expect(r[5]!.length).toBeGreaterThan(3);expect(r[6]).toBe(r[1]!.startsWith("RECIPIENT_")?VERIFY_VERSION:"1.0.0");}
 });
 it("keeps code identity aligned with OpenAPI and fixtures, without inventing missing coverage",()=>{
  const yaml=read("openapi.yaml");const section=yaml.split("    FindingCode:\n")[1]!.split("    Finding:\n")[0]!;
  expect([...section.matchAll(/^ {8}- ([A-Z0-9_]+)$/gm)].map(r=>r[1])).toEqual([...FINDING_CODES]);
  expect([...new Set(all.map(x=>x.scenario.targetCode))].sort()).toEqual([...FINDING_CODES].sort());
  expect(files).toHaveLength(9);expect(all).toHaveLength(79);
  const publicCodes=new Set(all.filter(x=>x.scenario.publicReplay.targetProduced).map(x=>x.scenario.targetCode));
  expect(publicCodes.size).toBe(66);
  const missing=FINDING_CODES.filter(c=>!publicCodes.has(c));expect(missing).toHaveLength(10);
  for(const c of missing)expect(read("fixtures/quotes/README.md")).toContain("| `"+c+"` |");
  expect(all.filter(x=>x.scenario.fault)).toHaveLength(2);
 });
 it("resolves every relative Markdown file link in repository documentation",()=>{
  const docs:string[]=[];
  function walk(dir:string){for(const item of readdirSync(resolve(root,dir),{withFileTypes:true})){
   if(["node_modules",".git",".next","dist",".turbo","test-results","playwright-report"].includes(item.name))continue;
   const p=dir?dir+"/"+item.name:item.name;if(item.isDirectory())walk(p);else if(item.name.endsWith(".md"))docs.push(p);
  }}walk("");let checked=0;
  for(const file of docs)for(const match of read(file).matchAll(/\]\(((?:[^()\s]|%28|%29)+)(?:\s+"[^"]*")?\)/g)){
   const href=match[1]!;if(/^[a-z][a-z\d+.-]*:/i.test(href)||href.startsWith("#"))continue;
   const target=decodeURIComponent(href.split("#")[0]!.split("?")[0]!);if(!target)continue;
   expect(existsSync(resolve(root,dirname(file),target)),file+" -> "+href).toBe(true);checked++;
  }
  expect(checked).toBeGreaterThan(40);
 });
 it("retains exact disclaimer, unreleased status, version domains and no-removal stability",()=>{
  expect(read("docs/api.md")).toContain("A pass means the deposit details match the quote and the quote has not expired. It does not guarantee delivery, does not verify the counterparty, and cannot recover funds sent to the wrong address.");
  expect(read("docs/api.md")).toContain("(limits.md)");
  expect(read("CHANGELOG.md")).toContain("## [Unreleased]");expect(read("CHANGELOG.md")).toContain("**1.0.0**");
  expect(read("docs/versioning.md")).toContain("never renamed or removed");expect(read("docs/versioning.md")).toContain("0.1.0");expect(read("docs/versioning.md")).toContain("2026.11.1");
 });
 it("contains only labeled synthetic contexts, the known test trust root, and no serialized private credential",()=>{
  for(const f of families){expect(f.fixtureKind).toBe("FAKE_LOCAL_ONLY_DO_NOT_SEND");expect(f.schemaVersion).toBe(1);expect(f.verifierVersion).toBe(VERIFY_VERSION);expect(f.metadata.quotePublicKey).toBe(PUBLIC_KEY);expect(f.metadata.source).toContain("Synthetic");expect(f.metadata.clock).toBe("2026-11-07T15:30:00.000Z");
   const text=JSON.stringify(f);expect(text).not.toMatch(/-----BEGIN|\b(?:privateKey|secretKey|seedPhrase|mnemonic|authorization|accessToken)\s*"\s*:/i);expect(text).not.toContain("NEER_VERIFY_FAKE_TEST_KEY_DO_NOT_USE_WITH_FUNDS");
   const base=hydrate(f);expect(base.tokens.every(t=>t.assetId.includes("fake-"))).toBe(true);
   if(base.lookup.kind==="found")expect(verifyQuoteSignature(base.lookup.status.quoteResponse,PUBLIC_KEY)).toBe(true);
  }
 });
});

for(const f of families)it("signed base remains deterministic all-pass: "+f.base.depositAddress+" / "+files[families.indexOf(f)],async()=>{
 const l=hydrate(f);const result=projectVerification(await verifyLegacyPreflight(l));expect(result.status).toBe("pass");expect(result.findings).toEqual([]);
});
for(const {family:f,scenario:s} of all)it("reference fixture "+s.id,async()=>{
 const l=hydrate(f,s);const rule=RULES[0]!;const original=rule.run;
 try {
  if(s.fault==="throw-first-rule")rule.run=()=>{throw new Error("FAKE_RULE_FAILURE");};
  if(s.fault==="omit-first-rule")rule.run=()=>null;
  const result=projectVerification(await verifyLegacyPreflight(l));
  expect(result.findings.find(x=>x.code===s.targetCode)).toEqual(s.expected);
  const row=rows.find(r=>r[1]===s.targetCode)!;expect(row[2]).toContain(s.expected.severity);
  const replay=()=>verifyDeposit(s.publicReplay.input,{fetchQuote:async()=>({lookup:l.lookup,tokens:l.tokens}),now:()=>l.now!,rules:l.rules,quotePublicKey:f.metadata.quotePublicKey});
  if(s.publicReplay.validationError)await expect(replay()).rejects.toMatchObject({name:"VerifyInputError"});
  else {
   const pub=await replay();expect(pub).toEqual(s.publicReplay.expected);
   expect(pub.findings.some(x=>x.code===s.targetCode)).toBe(s.publicReplay.targetProduced);
  }
  // Every valid stored quote mutation is intentionally signed; malformed/signature-failure cases are explicit.
  if(l.lookup.kind==="found"&&s.targetCode!=="QUOTE_UNVERIFIED")expect(verifyQuoteSignature(l.lookup.status.quoteResponse as QuoteResponse,PUBLIC_KEY)).toBe(true);
 } finally {rule.run=original;}
});
