import { existsSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { aggregateVerdict, DeclaredTransferSchema, RULES } from "@neer/core";
import { projectVerification } from "../src/projection.js";
import { verifyLegacyPreflight } from "../src/index.js";
import { legacy } from "./fixtures.js";

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,"../../..");
const projectRoots: Record<string,string>={"@neer/core":resolve(root,"packages/core/src/index.ts"),"@neer/oneclick":resolve(root,"packages/oneclick/src/index.ts")};
const forbidden=new Set(["window","document","localStorage","navigator"]);
function assertPure(entry: string, read: (file:string)=>string = (file)=>readFileSync(file,"utf8")) {
 const seen=new Set<string>();
 function visit(file:string) {
  if(seen.has(file))return;seen.add(file);
  const source=ts.createSourceFile(file,read(file),ts.ScriptTarget.Latest,true);
  function dependency(name:string) {
   if(/^(react(?:-dom)?|next|server-only)(?:\/|$)/.test(name))throw new Error("UI import: "+name);
   const target=projectRoots[name] ?? (name.startsWith(".")?resolve(dirname(file),name.replace(/\.js$/,".ts")):undefined);
   if(target)visit(target);
  }
  function node(n: ts.Node) {
   if(ts.isIdentifier(n)&&forbidden.has(n.text))throw new Error("Browser global: "+n.text);
   if((ts.isImportDeclaration(n)||ts.isExportDeclaration(n))&&n.moduleSpecifier&&ts.isStringLiteral(n.moduleSpecifier)) {
    dependency(n.moduleSpecifier.text);
   }
   if(ts.isCallExpression(n)&&(n.expression.kind===ts.SyntaxKind.ImportKeyword||(ts.isIdentifier(n.expression)&&n.expression.text==="require"))&&n.arguments[0]&&ts.isStringLiteral(n.arguments[0]))dependency(n.arguments[0].text);
   if(ts.isElementAccessExpression(n)&&ts.isIdentifier(n.expression)&&n.expression.text==="globalThis"&&ts.isStringLiteral(n.argumentExpression)&&forbidden.has(n.argumentExpression.text))throw new Error("Browser global: "+n.argumentExpression.text);
   ts.forEachChild(n,node);
  }
  node(source);
 }
 visit(entry);return seen;
}
describe("plain Node boundary",()=>{
 it("traverses the verifier, core and client without UI imports/browser globals",()=>{
  const seen=assertPure(resolve(here,"../src/index.ts"));
  expect([...seen].some((x)=>x.endsWith("core/src/checks.ts"))).toBe(true);
  expect([...seen].some((x)=>x.endsWith("oneclick/src/index.ts"))).toBe(true);
  expect(seen.size).toBeGreaterThan(15);
 });
 it("fails on a transitive UI import, not just the entry module",()=>{
  const files:Record<string,string>={"/fake/root.ts":'export * from "./child.js";',"/fake/child.ts":'import "react";'};
  expect(()=>assertPure("/fake/root.ts",(f)=>files[f]!)).toThrow("UI import: react");
 });
 it("also rejects dynamic imports and computed browser globals",()=>{
  expect(()=>assertPure("/fake.ts",()=> 'import("next/server")')).toThrow("UI import");
  expect(()=>assertPure("/fake.ts",()=> 'globalThis["window"]')).toThrow("Browser global");
 });
 it("has no React/Next/server-only runtime dependency anywhere in the package graph",()=>{
  const seen=new Set<string>();
  function packageGraph(file:string) {
   file=realpathSync(file);if(seen.has(file))return;seen.add(file);
   const pkg=JSON.parse(readFileSync(file,"utf8")) as {name:string;dependencies?:Record<string,string>};
   expect(pkg.name).not.toMatch(/^(react(?:-dom)?|next|server-only)(?:\/|$)/);
   const req=createRequire(file);
   for(const name of Object.keys(pkg.dependencies??{})){
    const candidate=(req.resolve.paths(name)??[]).map((base)=>resolve(base,name,"package.json")).find((f)=>existsSync(f));
    if(!candidate)throw new Error("Unresolved runtime dependency: "+name);
    packageGraph(candidate);
   }
  }
  packageGraph(resolve(here,"../package.json"));expect(seen.size).toBeGreaterThan(15);
 });
 it.each([...forbidden])("fails if a future module uses %s",(name)=>{expect(()=>assertPure("/fake.ts",()=>name+".bad()")).toThrow("Browser global");});
});

it("snapshots every existing exact finding template including positive/info",()=>{
 const source=ts.createSourceFile("checks.ts",readFileSync(resolve(root,"packages/core/src/checks.ts"),"utf8"),ts.ScriptTarget.Latest,true);
 const messages: Record<string,string>={};
 function scan(n:ts.Node){if(ts.isCallExpression(n)&&n.expression.getText(source)==="r")messages[n.arguments[0]!.getText(source)]=n.arguments[4]!.getText(source);ts.forEachChild(n,scan);}
 scan(source);
 const pre=ts.createSourceFile("preflight.ts",readFileSync(resolve(root,"packages/core/src/preflight.ts"),"utf8"),ts.ScriptTarget.Latest,true);
 const fallback: string[]=[];
 function other(n:ts.Node){if(ts.isPropertyAssignment(n)&&n.name.getText(pre)==="message"&&ts.isStringLiteral(n.initializer))fallback.push(n.initializer.getText(pre));ts.forEachChild(n,other);}
 other(pre);
 expect(Object.keys(messages)).toHaveLength(97);
 expect({rules:messages,otherLiteralMessages:fallback}).toMatchSnapshot();
});

it("refuses an incomplete or unannotated legacy result instead of inventing pass",async()=>{
 const r=await verifyLegacyPreflight(legacy());
 expect(projectVerification({...r,checks:[]})).toMatchObject({status:"warn"});
 const unknown={...r,checks:r.checks.map((c)=>c.id==="network"?{...c,severity:"unknown" as const}:c)};
 expect(projectVerification(unknown).status).toBe("warn");
 expect(aggregateVerdict(unknown.checks)).toBe("check");
});

it("does not leak reason identities into the legacy result or its action objects",async()=>{
 const l=legacy();l.transfer=DeclaredTransferSchema.parse({...l.transfer,chain:"base"});
 const r=await verifyLegacyPreflight(l);
 expect(r.checks.find((c)=>c.id==="network")?.action).toEqual({kind:"switch-network",chain:"eth",label:"Switch to Ethereum"});
 for(const c of r.checks)expect(Object.keys(c)).not.toContain("code");
 expect(JSON.parse(JSON.stringify(r))).toEqual(r);
 expect(RULES).toHaveLength(18);
});
