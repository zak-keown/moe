#!/usr/bin/env node

/**
 * Production build: bundle src/ into self-contained ESM chunks under dist/.
 *
 * - Two entry points: cli.ts (bin) and index.ts (library).
 * - Bundles all JavaScript dependencies; leaves native extensions (.node),
 *   WASM (.wasm), model metadata, and legal files as explicit externals.
 * - Code-splits shared modules into dist/chunks/ with content hashes.
 * - Emits bundle-manifest.json and bundle-metafile.json for CI verification.
 * - Runs tsc --emitDeclarationOnly for .d.ts files.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, "..");
const DIST = path.join(PACKAGE_ROOT, "dist");

// Clean dist/
if (fs.existsSync(DIST)) {
  fs.rmSync(DIST, { recursive: true });
}

const result = await esbuild.build({
  entryPoints: {
    cli: path.join(PACKAGE_ROOT, "src/cli.ts"),
    index: path.join(PACKAGE_ROOT, "src/index.ts"),
  },
  outdir: DIST,
  bundle: true,
  splitting: true,
  format: "esm",
  platform: "node",
  target: ["node22.13"],
  metafile: true,
  sourcemap: false,
  chunkNames: "chunks/[name]-[hash]",
  external: [
    "*.node",
    "*.wasm",
  ],
  banner: {
    js: [
      "// @generated — do not edit; see scripts/build-runtime.mjs",
      "import { createRequire as __createRequire } from 'module';",
      "const require = __createRequire(import.meta.url);",
    ].join("\n"),
  },
});

// Write metafile
fs.writeFileSync(
  path.join(DIST, "bundle-metafile.json"),
  JSON.stringify(result.metafile, null, 2),
);

// Build manifest: list all emitted files with content hashes
const outputs = Object.keys(result.metafile.outputs)
  .map((f) => path.relative(DIST, path.resolve(f)))
  .sort();

const manifest = {
  version: 1,
  entrypoints: ["cli.js", "index.js"],
  files: outputs.map((f) => {
    const abs = path.join(DIST, f);
    const content = fs.readFileSync(abs);
    const hash = createHash("sha256").update(content).digest("hex").slice(0, 16);
    return { path: f, hash, bytes: content.length };
  }),
};

// Reject absolute host paths in emitted files
for (const file of manifest.files) {
  if (file.path.endsWith(".js")) {
    const content = fs.readFileSync(path.join(DIST, file.path), "utf8");
    const homeDir = process.env.HOME || process.env.USERPROFILE || "";
    if (homeDir && content.includes(homeDir)) {
      console.error(`ERROR: ${file.path} contains host-absolute path: ${homeDir}`);
      process.exit(1);
    }
  }
}

fs.writeFileSync(
  path.join(DIST, "bundle-manifest.json"),
  JSON.stringify(manifest, null, 2),
);

console.log(`Bundled ${manifest.files.length} files into dist/`);
for (const f of manifest.files) {
  console.log(`  ${f.path} (${f.bytes} bytes, ${f.hash})`);
}

// Emit declarations
console.log("\nGenerating declarations...");
try {
  execFileSync("npx", ["tsc", "--emitDeclarationOnly", "--declaration", "--outDir", DIST], {
    cwd: PACKAGE_ROOT,
    stdio: "inherit",
  });
} catch {
  console.error("Declaration generation failed (non-fatal for runtime)");
}

console.log("\nBuild complete.");
