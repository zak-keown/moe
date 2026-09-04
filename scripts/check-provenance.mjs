#!/usr/bin/env node
/** Verify centralized legal metadata and generated distribution payloads. */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parseNotice, readCanonicalLegalTemplates } from "../packages/mint/src/artifact/legal.ts";

const UNICODE_CASE_FOLDING_WORK = "Unicode Character Database CaseFolding";
const UNICODE_LICENSE_V3_SHA256 =
  "e7a93b009565cfce55919a381437ac4db883e9da2126fa28b91d12732bc53d96";
const UNICODE_CASE_FOLDING_FIXTURE = "packages/mint/test/fixtures/casefold/CaseFolding-16.0.0.txt";
const UNICODE_CASE_FOLDING_FIXTURE_SHA256 =
  "6f1f9c588eb4a5c718d9e8f93b782685e5c7fec872cf05e8e6878053599e09bb";

const SKIP_SEGMENTS = new Set([
  ".claude",
  ".git",
  ".moe",
  ".planning",
  ".venv",
  "dist",
  "fixtures",
  "node_modules",
  "scripts",
  "test",
  "tests",
]);
function walk(root, current = root) {
  const files = [];
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    const rel = relative(root, path);
    if (entry.isDirectory()) {
      if (SKIP_SEGMENTS.has(entry.name)) continue;
      if (rel.split("/").includes("docs") && rel.split("/").includes("history")) continue;
      files.push(...walk(root, path));
      continue;
    }
    if (entry.isFile()) files.push(path);
  }
  return files;
}

function unicodeLicenseV3(notice) {
  const heading = "## Unicode License V3\n\n";
  const start = notice.indexOf(heading);
  if (start === -1) return undefined;
  const contentStart = start + heading.length;
  const nextHeading = notice.indexOf("\n## ", contentStart);
  return `${notice.slice(contentStart, nextHeading === -1 ? notice.length : nextHeading).trimEnd()}\n`;
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function countImportedWorks(root, problems) {
  let notice;
  try {
    notice = parseNotice(readFileSync(join(root, "NOTICE"), "utf8")).works;
  } catch (err) {
    problems.push(`could not read NOTICE: ${err.message}`);
    return 0;
  }
  if (notice.size === 0) problems.push("NOTICE has no imported-work rows");
  if (!notice.has(UNICODE_CASE_FOLDING_WORK)) {
    problems.push("NOTICE is missing required Unicode CaseFolding imported-work row");
  } else if (
    JSON.stringify(notice.get(UNICODE_CASE_FOLDING_WORK)) !==
    JSON.stringify({
      name: UNICODE_CASE_FOLDING_WORK,
      revision: "16.0.0",
      license: "Unicode Terms of Use",
      copyrightNotice: "© 2024 Unicode, Inc.",
    })
  ) {
    problems.push(
      "NOTICE Unicode CaseFolding imported-work row does not match the pinned source, version, and license metadata",
    );
  }
  const text = readFileSync(join(root, "NOTICE"), "utf8");
  const license = unicodeLicenseV3(text);
  if (license === undefined || sha256(license) !== UNICODE_LICENSE_V3_SHA256) {
    problems.push("NOTICE Unicode License V3 payload does not match the pinned canonical digest");
  }
  try {
    if (
      sha256(readFileSync(join(root, UNICODE_CASE_FOLDING_FIXTURE), "utf8")) !==
      UNICODE_CASE_FOLDING_FIXTURE_SHA256
    ) {
      problems.push("CaseFolding fixture does not match the pinned canonical digest");
    }
  } catch (err) {
    problems.push(`could not read ${UNICODE_CASE_FOLDING_FIXTURE}: ${err.message}`);
  }
  return notice.size;
}

function checkPluginLicenses(root, problems) {
  const pluginsRoot = join(root, "plugins");
  let count = 0;
  for (const entry of readdirSync(pluginsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    count++;
    const dir = join(pluginsRoot, entry.name);
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    } catch (err) {
      problems.push(`plugins/${entry.name}/package.json is missing or invalid: ${err.message}`);
      continue;
    }
    let license;
    try {
      license = readFileSync(join(dir, "LICENSE"), "utf8");
    } catch {
      problems.push(`plugins/${entry.name}/LICENSE is missing`);
      continue;
    }
    const expression = typeof manifest.license === "string" ? manifest.license : "";
    if (expression.includes("MIT") && !license.includes("Permission is hereby granted")) {
      problems.push(`plugins/${entry.name}/LICENSE is missing MIT terms`);
    }
    if (expression.includes("Apache-2.0") && !license.includes("Apache License")) {
      problems.push(`plugins/${entry.name}/LICENSE is missing Apache-2.0 terms`);
    }
  }
  return count;
}

function checkCanonicalLegalFiles(root, problems) {
  const duplicates = [];
  const notices = [];
  for (const file of walk(root)) {
    const rel = relative(root, file);
    if (rel.startsWith("plugins/")) continue;
    if (rel === "LICENSE" || rel === "LICENSE-MIT") continue;
    if (rel.endsWith("/LICENSE")) duplicates.push(rel);
    if (rel.endsWith("/NOTICE")) notices.push(rel);
  }
  if (duplicates.length > 0) {
    problems.push(`hand-maintained package license copies remain: ${duplicates.join(", ")}`);
  }
  if (notices.length > 0) {
    problems.push(`package NOTICE copies remain: ${notices.join(", ")}`);
  }
}

function classifyProblem(message) {
  if (message.includes("LICENSE is missing")) return "LEGAL_PAYLOAD_MISSING";
  if (message.includes("missing MIT terms") || message.includes("missing Apache"))
    return "LEGAL_PAYLOAD_MISMATCH";
  if (message.includes("NOTICE")) return "NOTICE_DEFECT";
  if (message.includes("CaseFolding")) return "FIXTURE_DIGEST_MISMATCH";
  if (message.includes("license copies remain") || message.includes("NOTICE copies remain"))
    return "STALE_LEGAL_COPY";
  if (message.includes("canonical legal templates")) return "TEMPLATE_MISSING";
  return "PROVENANCE_ERROR";
}

async function main(argv) {
  const jsonMode = argv.includes("--json");
  const positional = argv.filter((a) => a !== "--json");
  if (positional.length > 1) {
    console.error("usage: check-provenance.mjs [--json] [root]");
    return 2;
  }
  const root = positional[0] ?? ".";
  const problems = [];
  const upstreams = countImportedWorks(root, problems);
  try {
    await readCanonicalLegalTemplates(root);
  } catch (err) {
    problems.push(err.message);
  }
  const plugins = checkPluginLicenses(root, problems);
  checkCanonicalLegalFiles(root, problems);

  if (jsonMode) {
    const diagnostics = problems.map((message) => ({
      code: classifyProblem(message),
      message,
    }));
    process.stdout.write(`${JSON.stringify({ upstreams, plugins, diagnostics }, null, 2)}\n`);
    return problems.length > 0 ? 1 : 0;
  }

  console.log(`provenance: ${upstreams} imported works, ${plugins} plugin licenses`);
  if (problems.length === 0) {
    console.log("provenance: legal metadata and generated payloads are complete");
    return 0;
  }

  console.error(`provenance: ${problems.length} problem(s)`);
  for (const problem of problems) console.error(`  - ${problem}`);
  return 1;
}

process.exit(await main(process.argv.slice(2)));
