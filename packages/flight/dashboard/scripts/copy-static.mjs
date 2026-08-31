#!/usr/bin/env node
/**
 * Copy `src/static/` into `dist/static/`.
 *
 * `STATIC_DIR` in src/server.ts is resolved from `import.meta.url`, and
 * `tsc -b` copies no assets — so without this step `dist/static/` does not
 * exist, every `/static/*` request 404s, the grid renders with no CSS and no
 * htmx, and the SSE stream never connects. The failure is silent from the
 * server's point of view: it answers 404 exactly as designed.
 *
 * The tree is vendored verbatim (htmx 2.0.4, the htmx SSE extension, Inter and
 * its OFL notice) — see src/static/VENDOR.md. Copy it; never rewrite it.
 *
 * Usage: node scripts/copy-static.mjs [--check]
 */
import { cpSync, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");
const SRC = join(ROOT, "src", "static");
const DST = join(ROOT, "dist", "static");

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
    console.error(`dist/static is missing ${missing.length} file(s), e.g. ${missing[0]}`);
    process.exit(1);
  }
  console.log(`static assets present in dist (${files.length} files)`);
} else {
  cpSync(SRC, DST, { recursive: true });
  console.log(`copied ${files.length} static assets to dist/static`);
}
