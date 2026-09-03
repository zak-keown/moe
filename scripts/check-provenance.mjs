#!/usr/bin/env node
/** Verify centralized legal metadata and generated distribution payloads. */

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const SKIP_SEGMENTS = new Set([
  ".claude",
  ".git",
  ".planning",
  ".venv",
  "dist",
  "node_modules",
  "scripts",
  "test",
  "tests",
]);
function cells(line) {
  return line
    .split("|")
    .slice(1, -1)
    .map((cell) => cell.trim());
}

function tableNames(file, heading) {
  const names = new Set();
  let active = false;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (line === heading) {
      active = true;
      continue;
    }
    if (active && /^#{2,3}\s/.test(line)) break;
    if (!active || !line.startsWith("| `")) continue;
    const name = /^`([^`]+)`$/.exec(cells(line)[0] ?? "")?.[1];
    if (name) names.add(name);
  }
  return names;
}

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

function countImportedWorks(root, problems) {
  let notice;
  try {
    notice = tableNames(join(root, "NOTICE"), "## Imported works");
  } catch (err) {
    problems.push(`could not read NOTICE: ${err.message}`);
    return 0;
  }
  if (notice.size === 0) problems.push("NOTICE has no imported-work rows");
  if (notice.has("Unicode Character Database CaseFolding")) {
    const text = readFileSync(join(root, "NOTICE"), "utf8");
    if (!text.includes("Unicode License V3") || !text.includes("Permission is hereby granted, free of charge")) {
      problems.push("NOTICE is missing the required Unicode permission notice");
    }
    try {
      const parity = readFileSync(join(root, "PARITY.md"), "utf8");
      if (!parity.includes("CaseFolding-16.0.0.txt") || !parity.includes("all and only")) {
        problems.push("root PARITY.md is missing Unicode CaseFolding provenance");
      }
    } catch (err) {
      problems.push(`could not read root PARITY.md: ${err.message}`);
    }
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
    const config = readFileSync(join(dir, "moe-mint.yaml"), "utf8");
    let license;
    try {
      license = readFileSync(join(dir, "LICENSE"), "utf8");
    } catch {
      problems.push(`plugins/${entry.name}/LICENSE is missing`);
      continue;
    }
    const expression = /^license:\s*(.+)$/m.exec(config)?.[1]?.trim() ?? "";
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

function main(argv) {
  if (argv.length > 1) {
    console.error("usage: check-provenance.mjs [root]");
    return 2;
  }
  const root = argv[0] ?? ".";
  const problems = [];
  const upstreams = countImportedWorks(root, problems);
  const plugins = checkPluginLicenses(root, problems);
  checkCanonicalLegalFiles(root, problems);

  console.log(`provenance: ${upstreams} imported works, ${plugins} plugin licenses`);
  if (problems.length === 0) {
    console.log("provenance: legal metadata and generated payloads are complete");
    return 0;
  }

  console.error(`provenance: ${problems.length} problem(s)`);
  for (const problem of problems) console.error(`  - ${problem}`);
  return 1;
}

process.exit(main(process.argv.slice(2)));
