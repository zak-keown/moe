#!/usr/bin/env node
/**
 * Read-only identity guard for the TC downstream.
 *
 * This check pins every committed npm manifest to its downstream name, pins
 * the complete private-package set to Flight's three manifests, and scans the
 * live repository surfaces for neutral-upstream package names that would leak
 * into a downstream install. Historical planning records, canonical legal
 * provenance, and named red-fixture corpora stay outside that product surface.
 */

import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const MANIFEST_IDENTITIES = Object.freeze({
  "package.json": "@tc/moe",
  "packages/backstory/package.json": "@tc/moe-backstory",
  "packages/core/package.json": "@tc/moe-core",
  "packages/crew/package.json": "@tc/moe-crew",
  "packages/flight/package.json": "@tc/moe-flight",
  "packages/flight/dashboard/package.json": "@tc/moe-flight-dashboard",
  "packages/flight/ui/package.json": "@tc/moe-flight-ui",
  "packages/glass/package.json": "@tc/moe-glass",
  "packages/memory/package.json": "@tc/moe-memory",
  "packages/mint/package.json": "@tc/moe-mint",
  "packages/tab/bindings/typescript/package.json": "@tc/moe-tab",
});

export const PRIVATE_FLIGHT_MANIFESTS = Object.freeze([
  "packages/flight/package.json",
  "packages/flight/dashboard/package.json",
  "packages/flight/ui/package.json",
]);

const PRIVATE_FLIGHT_SET = new Set(PRIVATE_FLIGHT_MANIFESTS);
const UPSTREAM_VENDOR = "@bubstack";
const UPSTREAM_PACKAGE_PREFIX = `${UPSTREAM_VENDOR}/moe`;
const UPSTREAM_PACKAGE_PATTERN = new RegExp(`${UPSTREAM_VENDOR}/moe(?:-[a-z0-9._-]+)?\\b`, "giu");

const SKIPPED_DIRECTORY_NAMES = new Set([
  ".audit",
  ".claude",
  ".git",
  ".planning",
  ".pnpm-store",
  ".pytest_cache",
  ".turbo",
  ".venv",
  "coverage",
  "node_modules",
  "target",
]);

// Each full-file exemption is a named evidence surface, never an active
// package/runtime/doc surface. Keep this list exact so a nearby new file is
// scanned by default.
const ALLOWLISTED_REFERENCE_FILES = new Map([
  ["NOTICE", "canonical imported-work attribution"],
  ["PARITY.md", "canonical frozen-source ledger"],
  [
    "scripts/test/tc-release-validate.test.mjs",
    "release-policy red fixtures exercise rejected neutral-upstream identities",
  ],
  [
    "scripts/test/tc-release-pack-publish.test.mjs",
    "pack-policy red fixtures exercise rejected neutral-upstream identities",
  ],
  [
    "scripts/test/check-downstream-scope.test.mjs",
    "scope-guard red fixtures exercise rejected neutral-upstream identities",
  ],
]);

const ALLOWLISTED_REFERENCE_PREFIXES = new Map([
  ["packages/core/test/house-voice/", "frozen house-voice input and golden-output corpus"],
  ["scripts/fixtures/provenance-red/", "provenance guard red fixtures"],
]);

function toPosix(path) {
  return path.split(sep).join("/");
}

function problem(code, location, message) {
  return { code, location, message };
}

function readJson(root, displayPath, problems) {
  let source;
  try {
    source = readFileSync(join(root, displayPath), "utf8");
  } catch (error) {
    problems.push(
      problem("manifest.missing", displayPath, `cannot read committed manifest: ${error.message}`),
    );
    return null;
  }

  try {
    const value = JSON.parse(source);
    if (!value || Array.isArray(value) || typeof value !== "object") {
      problems.push(problem("manifest.shape", displayPath, "top level must be a JSON object"));
      return null;
    }
    return value;
  } catch (error) {
    problems.push(problem("manifest.json", displayPath, `invalid JSON: ${error.message}`));
    return null;
  }
}

function checkManifestIdentities(root, problems) {
  const manifests = [];
  for (const [displayPath, expectedName] of Object.entries(MANIFEST_IDENTITIES)) {
    const manifest = readJson(root, displayPath, problems);
    if (!manifest) continue;
    manifests.push({ path: displayPath, name: manifest.name, private: manifest.private === true });

    if (manifest.name !== expectedName) {
      problems.push(
        problem(
          "manifest.name",
          `${displayPath}#name`,
          `expected ${expectedName}, found ${JSON.stringify(manifest.name)}`,
        ),
      );
    }

    if (PRIVATE_FLIGHT_SET.has(displayPath)) {
      if (manifest.private !== true) {
        problems.push(
          problem(
            "manifest.flight-private",
            `${displayPath}#private`,
            "Flight's legal denylist requires private: true",
          ),
        );
      }
    } else if (manifest.private === true) {
      problems.push(
        problem(
          "manifest.unexpected-private",
          `${displayPath}#private`,
          "only the three Flight manifests may be private",
        ),
      );
    }
  }
  return manifests;
}

function isSkippedDirectory(displayPath, name) {
  if (SKIPPED_DIRECTORY_NAMES.has(name)) return true;
  const segments = displayPath.split("/");
  return segments.at(-2) === "docs" && segments.at(-1) === "history";
}

function isSkippedPath(displayPath) {
  const directories = displayPath.split("/").slice(0, -1);
  if (directories.some((segment) => SKIPPED_DIRECTORY_NAMES.has(segment))) return true;
  return directories.some(
    (segment, index) => segment === "docs" && directories[index + 1] === "history",
  );
}

function walkFiles(root, current = root) {
  const files = [];
  let entries;
  try {
    entries = readdirSync(current, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  } catch {
    return files;
  }

  for (const entry of entries) {
    const absolutePath = join(current, entry.name);
    const displayPath = toPosix(relative(root, absolutePath));
    if (entry.isDirectory()) {
      if (!isSkippedDirectory(displayPath, entry.name)) {
        files.push(...walkFiles(root, absolutePath));
      }
      continue;
    }
    if (entry.isFile()) files.push({ absolutePath, displayPath });
  }
  return files;
}

function committedFiles(root) {
  const run = spawnSync("git", ["-C", root, "ls-files", "-z"], {
    encoding: "buffer",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (run.status !== 0 || run.error) return null;

  return run.stdout
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .filter((displayPath) => !isSkippedPath(displayPath))
    .sort((left, right) => left.localeCompare(right))
    .map((displayPath) => ({
      absolutePath: join(root, displayPath),
      displayPath,
    }));
}

function repositoryFiles(root) {
  // A checkout is judged by its committed surface. In particular, ignored
  // local build outputs are user-owned and are inspected separately after a
  // clean release build/pack. Hermetic temp fixtures are not git repositories,
  // so they use the equivalent filesystem walk.
  return committedFiles(root) ?? walkFiles(root);
}

function fullFileAllowlistReason(displayPath) {
  const exact = ALLOWLISTED_REFERENCE_FILES.get(displayPath);
  if (exact) return exact;
  for (const [prefix, reason] of ALLOWLISTED_REFERENCE_PREFIXES) {
    if (displayPath.startsWith(prefix)) return reason;
  }
  return null;
}

function isExplicitUpstreamAnalogue(displayPath, source, index) {
  if (displayPath !== "ARCHITECTURE.md") return false;
  const context = source.slice(
    Math.max(0, index - 100),
    index + UPSTREAM_PACKAGE_PREFIX.length + 20,
  );
  return /upstream analogue\s+is\s+`@bubstack\/moe`/u.test(context);
}

function lineAndColumn(source, index) {
  const before = source.slice(0, index);
  const line = before.split("\n").length;
  const lastNewline = before.lastIndexOf("\n");
  return { line, column: index - lastNewline };
}

function scanUpstreamLeaks(root, problems) {
  let scannedFiles = 0;
  let allowlistedReferences = 0;

  for (const { absolutePath, displayPath } of repositoryFiles(root)) {
    let buffer;
    try {
      buffer = readFileSync(absolutePath);
    } catch (error) {
      problems.push(problem("scan.read", displayPath, `cannot read file: ${error.message}`));
      continue;
    }
    if (buffer.includes(0)) continue;
    scannedFiles++;

    const source = buffer.toString("utf8");
    const fileReason = fullFileAllowlistReason(displayPath);
    UPSTREAM_PACKAGE_PATTERN.lastIndex = 0;
    for (
      let match = UPSTREAM_PACKAGE_PATTERN.exec(source);
      match;
      match = UPSTREAM_PACKAGE_PATTERN.exec(source)
    ) {
      if (fileReason || isExplicitUpstreamAnalogue(displayPath, source, match.index)) {
        allowlistedReferences++;
        continue;
      }
      const { line, column } = lineAndColumn(source, match.index);
      problems.push(
        problem(
          "scope.upstream-leak",
          `${displayPath}:${line}:${column}`,
          `installable neutral-upstream identity ${match[0]} appears in a downstream surface`,
        ),
      );
    }
  }

  return { scannedFiles, allowlistedReferences };
}

export function checkDownstreamScope(root = ".") {
  const absoluteRoot = resolve(root);
  const problems = [];
  const manifests = checkManifestIdentities(absoluteRoot, problems);
  const scan = scanUpstreamLeaks(absoluteRoot, problems);
  problems.sort(
    (left, right) =>
      left.location.localeCompare(right.location) || left.code.localeCompare(right.code),
  );

  return {
    ok: problems.length === 0,
    root: absoluteRoot,
    expectedManifestCount: Object.keys(MANIFEST_IDENTITIES).length,
    expectedPrivateFlightCount: PRIVATE_FLIGHT_MANIFESTS.length,
    privateManifestCount: manifests.filter((manifest) => manifest.private).length,
    manifests,
    ...scan,
    problems,
  };
}

const USAGE = `Usage: node scripts/check-downstream-scope.mjs [--root <path>] [--json]

Checks the current directory by default. The command is dependency-free,
read-only, and uses local git metadata without contacting a registry or network
service.
`;

function parseArgs(argv) {
  const options = { root: ".", json: false, help: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--root") {
      const value = argv[++index];
      if (!value || value.startsWith("--")) throw new Error("--root requires a value");
      options.root = value;
      continue;
    }
    throw new Error(`unknown option: ${arg}`);
  }
  return options;
}

export function main(argv) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(error.message);
    console.error(USAGE.trimEnd());
    return 2;
  }

  if (options.help) {
    console.log(USAGE.trimEnd());
    return 0;
  }

  const result = checkDownstreamScope(options.root);
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return result.ok ? 0 : 1;
  }

  console.log(
    `downstream scope: ${result.manifests.length}/${result.expectedManifestCount} manifests, ` +
      `${result.privateManifestCount}/${result.expectedPrivateFlightCount} private Flight identities, ` +
      `${result.scannedFiles} files scanned`,
  );
  if (result.ok) {
    console.log("downstream scope: identity mapping and active install surfaces are clean");
    return 0;
  }

  console.error(`downstream scope: ${result.problems.length} problem(s)`);
  for (const item of result.problems) {
    console.error(`  - [${item.code}] ${item.location}: ${item.message}`);
  }
  return 1;
}

const ownPath = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === ownPath) {
  process.exit(main(process.argv.slice(2)));
}
