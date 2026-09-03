#!/usr/bin/env node
/**
 * Verify a recovery capsule for @bubstack/moe-memory@0.1.5.
 *
 * Usage: node scripts/verify-memory-recovery-capsule.mjs --capsule ./recovery/0.1.5/darwin-arm64
 *
 * Validates the manifest, checks file integrity, and ensures no unknown files.
 */

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, normalize, relative, isAbsolute } from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    capsule: { type: "string" },
    platform: { type: "string" },
    arch: { type: "string" },
  },
});

if (!values.capsule) {
  console.error("Usage: --capsule <dir> [--platform darwin|linux] [--arch arm64|x64]");
  process.exit(1);
}

const capsuleDir = values.capsule;
const platform = values.platform || process.platform;
const arch = values.arch || process.arch;

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function walk(dir, root = dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walk(full, root));
    } else {
      results.push(relative(root, full));
    }
  }
  return results;
}

function containsPathEscape(p) {
  const n = normalize(p);
  return n.startsWith("..") || isAbsolute(n);
}

let errors = 0;
function fail(msg) {
  console.error(`  FAIL: ${msg}`);
  errors++;
}

console.log(`Verifying capsule at ${capsuleDir}`);
console.log(`  Platform: ${platform}, Arch: ${arch}`);

const manifestPath = join(capsuleDir, "manifest.json");
if (!existsSync(manifestPath)) {
  console.error("FAIL: manifest.json not found");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

if (manifest.schema !== 1) fail(`schema must be 1, got ${manifest.schema}`);
if (manifest.memoryVersion !== "0.1.5") fail(`memoryVersion must be 0.1.5, got ${manifest.memoryVersion}`);
if (manifest.nodeRange !== ">=24") fail(`nodeRange must be >=24, got ${manifest.nodeRange}`);

const expectedTarget = `${platform}-${arch}`;
if (manifest.target !== expectedTarget) {
  fail(`target ${manifest.target} does not match ${expectedTarget}`);
}

if (!manifest.legalFiles || manifest.legalFiles.length === 0) {
  fail("legalFiles is empty — capsule must include legal files");
}

const allFiles = [manifest.packageTarball, ...manifest.installedFiles, ...manifest.legalFiles];
for (const file of allFiles) {
  if (containsPathEscape(file.path)) {
    fail(`path escape: ${file.path}`);
    continue;
  }
  const filePath = join(capsuleDir, file.path);
  if (!existsSync(filePath)) {
    fail(`missing file: ${file.path}`);
    continue;
  }
  const stat = statSync(filePath);
  if (stat.size !== file.bytes) {
    fail(`size mismatch: ${file.path} expected ${file.bytes}, got ${stat.size}`);
  }
  const hash = sha256(filePath);
  if (hash !== file.sha256) {
    fail(`integrity mismatch: ${file.path}`);
  }
}

const declaredPaths = new Set(allFiles.map((f) => f.path));
declaredPaths.add("manifest.json");
const actualFiles = walk(capsuleDir);
for (const f of actualFiles) {
  if (!declaredPaths.has(f)) {
    fail(`unknown file: ${f}`);
  }
}

if (errors > 0) {
  console.error(`\n${errors} error(s) found.`);
  process.exit(1);
} else {
  console.log("\nCapsule verified successfully.");
}
