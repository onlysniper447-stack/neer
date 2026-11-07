import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
function noReactMarker(entry: string, read = (file: string) => readFileSync(file, "utf8")) {
  const seen = new Set<string>();
  function visit(file: string) {
    if (seen.has(file)) return; seen.add(file);
    const source = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
    for (const node of source.statements) {
      if ((!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) || !node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier)) continue;
      const name = node.moduleSpecifier.text;
      if (name === "server-only") throw new Error("React-only marker reached Node API");
      if (name.startsWith(".")) visit(resolve(dirname(file), name.replace(/\.js$/, "") + ".ts"));
      if (name.startsWith("@/")) visit(resolve(here, "..", name.slice(2)) + ".ts");
    }
  }
  visit(entry); return seen;
}
it("Node API runtime graph never reaches a React-only marker", () => {
  const seen = noReactMarker(resolve(here, "../pages/api/v1/verify.ts"));
  expect([...seen].some(file => file.endsWith("upstream-node.ts"))).toBe(true);
  expect([...seen].some(file => file.endsWith("rate-limit-node.ts"))).toBe(true);
  expect(seen.size).toBeGreaterThan(8);
});
it("the graph guard catches an accidental transitive legacy-facade import", () => {
  const fake: Record<string,string> = {"/fake/start.ts":'import "./bad";',"/fake/bad.ts":'import "server-only";'};
  expect(() => noReactMarker("/fake/start.ts",file => fake[file]!)).toThrow("React-only marker");
});
it.each(["http", "rate-limit", "upstream"])("legacy%s facade still retains its original server-only boundary", name => {
  const source = readFileSync(resolve(here, "../lib/server", name + ".ts"), "utf8");
  expect(source).toContain('import "server-only";');
  expect(source).toContain('export * from "./' + name + '-node";');
});
it("a browser-targeted bundle rejects the shared Node implementation boundary", async () => {
  const req = createRequire(new URL("../../../packages/verify/package.json",import.meta.url));
  const compiler = createRequire(req.resolve("tsup"))("esbuild") as {
    build(options: {entryPoints:string[];bundle:boolean;platform:string;write:boolean;logLevel:string}):Promise<unknown>
  };
  await expect(compiler.build({entryPoints:[resolve(here,"../lib/server/node-only.ts")],bundle:true,platform:"browser",write:false,logLevel:"silent"})).rejects.toMatchObject({errors:expect.arrayContaining([expect.objectContaining({text:expect.stringContaining("node:fs")})])});
});
