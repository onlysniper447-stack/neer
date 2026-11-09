import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = fileURLToPath(new URL("../../../../", import.meta.url));

/** Directories whose every file is part of the verifier contract (or the homepage). */
export const GUARDED_DIRS = ["packages/verify/src", "packages/mcp-verify/src", "packages/core/src", "packages/oneclick/src"];

/** Single files the verifier, its aliases, security headers or the homepage depend on. */
export const GUARDED_FILES = [
  "openapi.yaml",
  "packages/verify/package.json",
  "packages/mcp-verify/package.json",
  "apps/web/pages/api/v1/verify.ts",
  "apps/web/lib/server/verify-handler.ts",
  "apps/web/lib/server/verify-http.ts",
  "apps/web/lib/server/verify-node.ts",
  "apps/web/lib/server/verify-service.ts",
  "apps/web/lib/server/http.ts",
  "apps/web/lib/server/http-node.ts",
  "apps/web/lib/server/rate-limit.ts",
  "apps/web/lib/server/rate-limit-node.ts",
  "apps/web/lib/server/read-json-body.ts",
  "apps/web/lib/server/cors.ts",
  "apps/web/lib/server/upstream.ts",
  "apps/web/lib/server/upstream-node.ts",
  "apps/web/lib/server/node-only.ts",
  "apps/web/lib/server/status-cache.ts",
  "apps/web/lib/server/service.ts",
  "apps/web/lib/server/request-schemas.ts",
  "apps/web/lib/deep-links.ts",
  "apps/web/proxy.ts",
  "apps/web/next.config.ts",
  "apps/web/app/page.tsx",
  "apps/web/app/home.module.css",
  "apps/web/app/layout.tsx",
];

function walk(dir: string): string[] {
  return readdirSync(join(REPO, dir)).flatMap((name) => {
    const path = join(dir, name);
    return statSync(join(REPO, path)).isDirectory() ? walk(path) : [path];
  });
}

export function guardedPaths(): string[] {
  return [...GUARDED_DIRS.flatMap(walk), ...GUARDED_FILES].map((p) => relative(REPO, join(REPO, p))).sort();
}

export function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(join(REPO, path))).digest("hex");
}

export function currentManifest(): Record<string, string> {
  return Object.fromEntries(guardedPaths().map((p) => [p, sha256(p)]));
}
