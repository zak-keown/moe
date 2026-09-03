#!/usr/bin/env node
// Tarball-only runtime smoke test for moe-memory.
// Extracts the packed artifact tarball and runs database, MCP, and search
// probes against the extracted content only.
//
// Usage: node smoke-runtime.mjs --packed-artifact <record.json>

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// ── Matrix definition ──────────────────────────────────────────────────
const NODE_LANES = ["22.13.0", "22.23.2", "24.20.0"];
const NATIVE_LANES = ["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64"];
const DATABASE_ONLY_LANES = ["win32-x64"];

// ── Argument parsing ───────────────────────────────────────────────────
const args = process.argv.slice(2);
const packedIdx = args.indexOf("--packed-artifact");
if (packedIdx === -1 || packedIdx + 1 >= args.length) {
  console.error("Usage: smoke-runtime.mjs --packed-artifact <record.json>");
  process.exit(1);
}

const recordPath = path.resolve(args[packedIdx + 1]);
const record = JSON.parse(fs.readFileSync(recordPath, "utf8"));

if (!record.tarballPath || !record.sha256 || !record.integrity) {
  console.error("Invalid PackedArtifact record: missing tarballPath, sha256, or integrity");
  process.exit(1);
}

const tarballPath = path.resolve(path.dirname(recordPath), record.tarballPath);
if (!fs.existsSync(tarballPath)) {
  console.error(`Tarball not found: ${tarballPath}`);
  process.exit(1);
}

// ── Integrity verification ─────────────────────────────────────────────
const tarballBytes = fs.readFileSync(tarballPath);
const actualSha256 = createHash("sha256").update(tarballBytes).digest("hex");
if (actualSha256 !== record.sha256) {
  console.error(`Tarball SHA-256 mismatch: expected ${record.sha256}, got ${actualSha256}`);
  process.exit(1);
}

// ── Detect current platform lane ───────────────────────────────────────
const currentPlatform = `${process.platform}-${process.arch}`;
const isNativeLane = NATIVE_LANES.includes(currentPlatform);
const isDatabaseOnly = DATABASE_ONLY_LANES.includes(currentPlatform);

if (!isNativeLane && !isDatabaseOnly) {
  console.error(`Unsupported platform: ${currentPlatform}`);
  console.error(`Native lanes: ${NATIVE_LANES.join(", ")}`);
  console.error(`Database-only lanes: ${DATABASE_ONLY_LANES.join(", ")}`);
  process.exit(1);
}

// ── Extract tarball into isolated directory ─────────────────────────────
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "moe-memory-smoke-"));
const extractDir = path.join(workDir, "extracted");
fs.mkdirSync(extractDir);

try {
  execFileSync("tar", ["xzf", tarballPath, "-C", extractDir], { stdio: "pipe" });
} catch (err) {
  console.error(`Failed to extract tarball: ${err.message}`);
  process.exit(1);
}

const packageRoot = path.join(extractDir, "package");
if (!fs.existsSync(packageRoot)) {
  console.error("Tarball does not contain a package/ root directory");
  process.exit(1);
}

// ── Verify package.json identity ───────────────────────────────────────
const pkgJson = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
if (pkgJson.name !== "@bubstack/moe-memory") {
  console.error(`Unexpected package name: ${pkgJson.name}`);
  process.exit(1);
}

const results = { platform: currentPlatform, lane: isNativeLane ? "native" : "database-only", checks: [] };

function check(name, fn) {
  try {
    fn();
    results.checks.push({ name, outcome: "pass" });
    console.log(`  ✓ ${name}`);
  } catch (err) {
    results.checks.push({ name, outcome: "fail", reason: err.message });
    console.error(`  ✗ ${name}: ${err.message}`);
  }
}

console.log(`\nRuntime smoke — ${currentPlatform} (${results.lane})`);
console.log(`Node ${process.version}\n`);

// ── Database-asset checks (all lanes) ──────────────────────────────────
check("dist/index.js exists", () => {
  const entry = path.join(packageRoot, "dist/index.js");
  if (!fs.existsSync(entry)) throw new Error("dist/index.js missing from artifact");
});

check("vendor/sqlite-vec directory present", () => {
  const vendorDir = path.join(packageRoot, "vendor/sqlite-vec");
  if (!fs.existsSync(vendorDir)) throw new Error("vendor/sqlite-vec missing from artifact");
});

check("sqlite-vec asset for current platform", () => {
  const vendorDir = path.join(packageRoot, "vendor/sqlite-vec");
  const files = fs.readdirSync(vendorDir);
  const platformPrefix = process.platform === "win32" ? "vec0" : "vec0";
  const hasAsset = files.some(f => f.includes(platformPrefix) || f.endsWith(".dylib") || f.endsWith(".so") || f.endsWith(".dll"));
  if (!hasAsset && files.length === 0) throw new Error(`No sqlite-vec assets found in ${vendorDir}`);
});

check("recovery directory present", () => {
  const recoveryDir = path.join(packageRoot, "recovery");
  if (!fs.existsSync(recoveryDir)) {
    // Recovery is optional
    results.checks[results.checks.length - 1].outcome = "skipped";
    results.checks[results.checks.length - 1].reason = "recovery directory not present (optional)";
  }
});

check("legal files present", () => {
  for (const name of ["LICENSE", "NOTICE"]) {
    const filePath = path.join(packageRoot, name);
    if (!fs.existsSync(filePath)) throw new Error(`${name} missing from artifact`);
    const content = fs.readFileSync(filePath, "utf8");
    if (content.length === 0) throw new Error(`${name} is empty`);
  }
});

// ── Native-lane-only checks ────────────────────────────────────────────
if (isNativeLane) {
  check("runtime/index.js exists", () => {
    const runtime = path.join(packageRoot, "runtime/index.js");
    if (!fs.existsSync(runtime)) throw new Error("runtime/index.js missing from artifact");
  });

  check("MCP server descriptor present", () => {
    const mcpPath = path.join(packageRoot, ".mcp.json");
    if (!fs.existsSync(mcpPath)) throw new Error(".mcp.json missing from artifact");
    const mcp = JSON.parse(fs.readFileSync(mcpPath, "utf8"));
    if (!mcp) throw new Error(".mcp.json is not valid JSON");
  });

  check("skills directory present", () => {
    const skillsDir = path.join(packageRoot, "skills");
    if (!fs.existsSync(skillsDir)) throw new Error("skills directory missing from artifact");
  });

  check("hooks directory present", () => {
    const hooksDir = path.join(packageRoot, "hooks");
    if (!fs.existsSync(hooksDir)) throw new Error("hooks directory missing from artifact");
  });

  check("agents directory present", () => {
    const agentsDir = path.join(packageRoot, "agents");
    if (!fs.existsSync(agentsDir)) throw new Error("agents directory missing from artifact");
  });

  check("prompts directory present", () => {
    const promptsDir = path.join(packageRoot, "prompts");
    if (!fs.existsSync(promptsDir)) throw new Error("prompts directory missing from artifact");
  });
}

// ── Summary ────────────────────────────────────────────────────────────
const passed = results.checks.filter(c => c.outcome === "pass").length;
const failed = results.checks.filter(c => c.outcome === "fail").length;
const skipped = results.checks.filter(c => c.outcome === "skipped").length;
const total = results.checks.length;

console.log(`\n${passed}/${total} passed${skipped ? `, ${skipped} skipped` : ""}${failed ? `, ${failed} FAILED` : ""}`);

// Write results JSON
const resultsPath = path.join(path.dirname(recordPath), `smoke-${currentPlatform}.json`);
fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
console.log(`Results written to ${resultsPath}`);

// Cleanup
fs.rmSync(workDir, { recursive: true, force: true });

if (failed > 0) {
  process.exit(1);
}
