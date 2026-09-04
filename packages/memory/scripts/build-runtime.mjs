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
  external: ["*.node", "*.wasm"],
  banner: {
    js: [
      "// @generated — do not edit; see scripts/build-runtime.mjs",
      "import { createRequire as __createRequire } from 'module';",
      "const require = __createRequire(import.meta.url);",
    ].join("\n"),
  },
});

// Write metafile (both the legacy name and the canonical name for write-bundle-inventory)
fs.writeFileSync(path.join(DIST, "bundle-metafile.json"), JSON.stringify(result.metafile, null, 2));
fs.writeFileSync(path.join(DIST, "metafile-esm.json"), JSON.stringify(result.metafile, null, 2));

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

fs.writeFileSync(path.join(DIST, "bundle-manifest.json"), JSON.stringify(manifest, null, 2));

console.log(`Bundled ${manifest.files.length} files into dist/`);
for (const f of manifest.files) {
  console.log(`  ${f.path} (${f.bytes} bytes, ${f.hash})`);
}

// Emit declarations
console.log("\nGenerating declarations...");
try {
  execFileSync(
    "npx",
    ["tsc", "--emitDeclarationOnly", "--declaration", "--composite", "false", "--outDir", DIST],
    {
      cwd: PACKAGE_ROOT,
      stdio: "inherit",
    },
  );
} catch {
  console.error("Declaration generation failed (non-fatal for runtime)");
}

// Generate bundle inventory for mint legal closure
console.log("\nGenerating bundle inventory...");
const REPO_ROOT = path.resolve(PACKAGE_ROOT, "../..");
const evidenceDir = path.join(PACKAGE_ROOT, ".moe-build");
if (!fs.existsSync(evidenceDir)) fs.mkdirSync(evidenceDir, { recursive: true });

const bundleInputs = new Map();
for (const [rawOutput, output] of Object.entries(result.metafile.outputs)) {
  const outputAbs = path.resolve(PACKAGE_ROOT, rawOutput);
  const outputRel = path.relative(PACKAGE_ROOT, outputAbs);
  if (outputRel.startsWith("..")) continue;
  for (const rawInput of Object.keys(output.inputs)) {
    const inputAbs = path.resolve(PACKAGE_ROOT, rawInput);
    const inputRel = path.relative(REPO_ROOT, inputAbs);
    if (!inputRel.includes("node_modules")) continue;
    let dir = path.dirname(inputAbs);
    let manifest = null;
    while (dir.length >= REPO_ROOT.length) {
      const pjsonPath = path.join(dir, "package.json");
      if (fs.existsSync(pjsonPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pjsonPath, "utf8"));
          if (pkg.name && pkg.version) {
            manifest = {
              name: pkg.name,
              version: pkg.version,
              path: path.relative(REPO_ROOT, pjsonPath).split(path.sep).join("/"),
            };
            break;
          }
        } catch {}
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    const pkgManifestRel = path
      .relative(REPO_ROOT, path.join(PACKAGE_ROOT, "package.json"))
      .split(path.sep)
      .join("/");
    if (!manifest || manifest.path === pkgManifestRel) continue;
    const key = `${manifest.name}\0${manifest.version}\0${manifest.path}`;
    if (!bundleInputs.has(key))
      bundleInputs.set(key, {
        name: manifest.name,
        version: manifest.version,
        package_manifest: manifest.path,
        inputs: new Set(),
        outputs: new Set(),
      });
    const entry = bundleInputs.get(key);
    entry.inputs.add(inputRel.split(path.sep).join("/"));
    entry.outputs.add(outputRel.split(path.sep).join("/"));
  }
}

const packages = [...bundleInputs.values()]
  .sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version))
  .map((p) => ({ ...p, inputs: [...p.inputs].sort(), outputs: [...p.outputs].sort() }));

fs.writeFileSync(
  path.join(evidenceDir, "bundle-inventory.json"),
  JSON.stringify(packages, null, 2) + "\n",
);
console.log(`${packages.length} bundled packages recorded.`);

console.log("\nBuild complete.");
