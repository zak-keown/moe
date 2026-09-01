#!/usr/bin/env node
/**
 * Copy the vendored CommonJS CDP library into `dist/`.
 *
 * `src/qa/adapters/web/lib/` is not TypeScript. It is vendored CommonJS reached
 * through `createRequire`.
 * `tsc -b` compiles `.ts` and copies nothing, so without this step
 * `dist/qa/adapters/web/lib/` does not exist and the whole web adapter fails
 * to load from the shipped bin — while every test, which reaches the copy
 * under `src/`, still passes. That asymmetry is why this is a build step with
 * a check mode rather than a comment.
 *
 * Usage: node scripts/copy-vendor.mjs [--check]
 */
import { cpSync, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");
const SRC = join(ROOT, "src", "qa", "adapters", "web", "lib");
const DST = join(ROOT, "dist", "qa", "adapters", "web", "lib");

const walk = (d, out = []) => {
  for (const name of readdirSync(d)) {
    const p = join(d, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
};

const files = walk(SRC).map((p) => relative(SRC, p));

if (process.argv.includes("--check")) {
  const missing = files.filter((f) => !existsSync(join(DST, f)));
  if (missing.length) {
    console.error(`dist is missing ${missing.length} vendored file(s), e.g. ${missing[0]}`);
    process.exit(1);
  }
  console.log(`vendored lib present in dist (${files.length} files)`);
} else {
  cpSync(SRC, DST, { recursive: true });
  console.log(`copied ${files.length} vendored files to dist/qa/adapters/web/lib`);
}
