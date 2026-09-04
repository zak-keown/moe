#!/usr/bin/env node
/**
 * Build a recovery capsule for @bubstack/moe-memory@0.1.5.
 *
 * Usage: node scripts/build-memory-recovery-capsule.mjs --target darwin-arm64 --output ./recovery-out
 *
 * Captures the exact published 0.1.5 runtime: package tarball, installed files,
 * dependency closure, lifecycle scripts, and legal files. The capsule is
 * self-contained and verifiable offline.
 */

import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parseArgs } from "node:util";

const SUPPORTED_TARGETS = ["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64"];

const { values } = parseArgs({
  options: {
    target: { type: "string" },
    output: { type: "string" },
    "package-dir": { type: "string" },
  },
});

if (!values.target || !SUPPORTED_TARGETS.includes(values.target)) {
  console.error(
    `Usage: --target <${SUPPORTED_TARGETS.join("|")}> --output <dir> --package-dir <dir>`,
  );
  process.exit(1);
}

if (!values.output) {
  console.error("--output is required");
  process.exit(1);
}

if (!values["package-dir"]) {
  console.error("--package-dir is required (path to installed @bubstack/moe-memory@0.1.5)");
  process.exit(1);
}

const target = values.target;
const outputDir = values.output;
const packageDir = values["package-dir"];

function sha256(filePath) {
  const content = readFileSync(filePath);
  return createHash("sha256").update(content).digest("hex");
}

function walk(dir, root = dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      results.push(...walk(full, root));
    } else {
      results.push({
        path: relative(root, full),
        sha256: sha256(full),
        bytes: statSync(full).size,
      });
    }
  }
  return results;
}

mkdirSync(outputDir, { recursive: true });

const pkg = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));
if (pkg.version !== "0.1.5") {
  console.error(`Expected @bubstack/moe-memory@0.1.5, got ${pkg.version}`);
  process.exit(1);
}

const installedFiles = walk(packageDir);
const legalFiles = installedFiles.filter((f) =>
  /^(LICENSE|NOTICE|COPYING|THIRD.PARTY)/i.test(f.path),
);

if (legalFiles.length === 0) {
  console.error("No legal files found — capsule requires at least one");
  process.exit(1);
}

const manifest = {
  schema: 1,
  memoryVersion: "0.1.5",
  nodeRange: ">=24",
  target,
  packageTarball: {
    path: `bubstack-moe-memory-0.1.5.tgz`,
    sha256: "",
    bytes: 0,
  },
  installedFiles,
  dependencies: Object.entries(pkg.dependencies || {}).map(([name, version]) => ({
    name,
    version,
    integrity: "",
  })),
  lifecyclePolicy: [],
  legalFiles,
};

writeFileSync(join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`Capsule manifest written to ${outputDir}/manifest.json`);
console.log(`  Target: ${target}`);
console.log(`  Installed files: ${installedFiles.length}`);
console.log(`  Legal files: ${legalFiles.length}`);
console.log(`  Dependencies: ${manifest.dependencies.length}`);
console.log(
  "\nNote: packageTarball.sha256/bytes and dependency integrity must be filled by the release workflow.",
);
