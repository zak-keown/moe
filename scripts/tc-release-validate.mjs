#!/usr/bin/env node
/**
 * Read-only guard for the TC lockstep release train.
 *
 * Canonical release input (`tc-release.json` by default):
 * {
 *   "upstreamVersion": "1.2.3",
 *   "upstreamCommit": "0123456789abcdef0123456789abcdef01234567",
 *   "tcRelease": 4
 * }
 *
 * Publishable package manifests project that input as:
 *   version: "1.2.3-tc.4"
 *   moeRelease: { upstreamVersion, upstreamCommit }
 *
 * This command reads manifests and CI context only. It never packs, publishes,
 * contacts a registry, or writes to the repository.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const PROGET_REGISTRY = "https://proget.tcdevops.com/npm/tcnpm/";
export const DEFAULT_RELEASE_FILE = "tc-release.json";

const DEPENDENCY_FIELDS = [
  "dependencies",
  "optionalDependencies",
  "peerDependencies",
  "devDependencies",
];
const SHA_40 = /^[0-9a-f]{40}$/i;
const STABLE_SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

const USAGE = `Usage:
  node scripts/tc-release-validate.mjs [options]

Options:
  --root <path>             Repository root (default: current directory)
  --release-file <path>     Canonical release input (default: tc-release.json)
  --branch <name>           Source branch (default: CI_COMMIT_BRANCH)
  --default-branch <name>   Default branch (default: CI_DEFAULT_BRANCH)
  --merge-request           Force merge-request context
  --dist-tag <tag>          Proposed npm tag (default: NPM_DIST_TAG)
  --json                    Emit machine-readable JSON
  --help                    Show this help

This structural check never requires or reads ProGet credentials. Merge requests
and non-default branches require "next"; only the default branch may use
"latest".
`;

function issue(code, location, message) {
  return { code, location, message };
}

function parseArgs(argv) {
  const options = { json: false, mergeRequest: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--merge-request") {
      options.mergeRequest = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    const names = new Map([
      ["--root", "root"],
      ["--release-file", "releaseFile"],
      ["--branch", "branch"],
      ["--default-branch", "defaultBranch"],
      ["--dist-tag", "distTag"],
    ]);
    const key = names.get(arg);
    if (!key) throw new Error(`unknown option: ${arg}`);
    const value = argv[++index];
    if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value`);
    options[key] = value;
  }
  return options;
}

function readJson(path, problems, code, displayPath) {
  let source;
  try {
    source = readFileSync(path, "utf8");
  } catch (error) {
    problems.push(issue(`${code}.missing`, displayPath, `cannot read file: ${error.message}`));
    return null;
  }
  try {
    return JSON.parse(source);
  } catch (error) {
    problems.push(issue(`${code}.json`, displayPath, `invalid JSON: ${error.message}`));
    return null;
  }
}

function loadRelease(root, releaseFile, problems) {
  const path = isAbsolute(releaseFile) ? releaseFile : join(root, releaseFile);
  const displayPath = relative(root, path) || releaseFile;
  const value = readJson(path, problems, "release-file", displayPath);
  if (!value) return { path: displayPath, value: null, expectedVersion: null };
  if (Array.isArray(value) || typeof value !== "object") {
    problems.push(issue("release-file.shape", displayPath, "top level must be an object"));
    return { path: displayPath, value, expectedVersion: null };
  }

  const allowed = new Set(["upstreamVersion", "upstreamCommit", "tcRelease"]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      problems.push(issue("release-file.unknown-key", `${displayPath}#${key}`, "unknown field"));
    }
  }
  if (!STABLE_SEMVER.test(value.upstreamVersion ?? "")) {
    problems.push(
      issue(
        "release-file.upstream-version",
        `${displayPath}#upstreamVersion`,
        "must be a stable X.Y.Z version",
      ),
    );
  }
  if (!SHA_40.test(value.upstreamCommit ?? "")) {
    problems.push(
      issue(
        "release-file.upstream-commit",
        `${displayPath}#upstreamCommit`,
        "must be the exact 40-hex mirror commit",
      ),
    );
  }
  if (!Number.isSafeInteger(value.tcRelease) || value.tcRelease < 1) {
    problems.push(
      issue("release-file.tc-release", `${displayPath}#tcRelease`, "must be a positive integer"),
    );
  }

  const valid =
    STABLE_SEMVER.test(value.upstreamVersion ?? "") &&
    SHA_40.test(value.upstreamCommit ?? "") &&
    Number.isSafeInteger(value.tcRelease) &&
    value.tcRelease >= 1;
  return {
    path: displayPath,
    value,
    expectedVersion: valid ? `${value.upstreamVersion}-tc.${value.tcRelease}` : null,
  };
}

function workspacePatterns(path) {
  if (!existsSync(path)) return [];
  const patterns = [];
  let inPackages = false;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (/^packages:\s*$/.test(line)) {
      inPackages = true;
      continue;
    }
    if (!inPackages) continue;
    const item = /^\s+-\s+['"]?([^'"#]+?)['"]?\s*(?:#.*)?$/.exec(line)?.[1]?.trim();
    if (item) {
      patterns.push(item);
      continue;
    }
    if (/^\S/.test(line) && line.trim() !== "") break;
  }
  return patterns;
}

function expandDirectoryPattern(root, pattern) {
  if (pattern.startsWith("!") || pattern.includes("**")) return [];
  let paths = [root];
  for (const segment of pattern.split("/").filter(Boolean)) {
    const next = [];
    for (const parent of paths) {
      if (segment === "*") {
        if (!existsSync(parent)) continue;
        for (const entry of readdirSync(parent, { withFileTypes: true })) {
          if (entry.isDirectory()) next.push(join(parent, entry.name));
        }
      } else {
        next.push(join(parent, segment));
      }
    }
    paths = next;
  }
  return paths;
}

function discoverPackageFiles(root, problems) {
  const workspaceFile = join(root, "pnpm-workspace.yaml");
  const patterns = workspacePatterns(workspaceFile);
  if (patterns.length === 0) {
    problems.push(
      issue(
        "workspace.packages",
        "pnpm-workspace.yaml",
        "no dependency-free-compatible workspace package patterns found",
      ),
    );
  }
  const files = new Set();
  if (existsSync(join(root, "package.json"))) files.add(join(root, "package.json"));
  for (const pattern of patterns) {
    for (const directory of expandDirectoryPattern(root, pattern)) {
      const manifest = join(directory, "package.json");
      if (existsSync(manifest)) files.add(manifest);
    }
  }
  return [...files].sort();
}

function findIdentityLeaks(value, path = "") {
  const leaks = [];
  if (typeof value === "string") {
    if (value.includes("@bubstack/")) leaks.push(path || "package.json");
    return leaks;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) {
      leaks.push(...findIdentityLeaks(value[index], `${path}[${index}]`));
    }
    return leaks;
  }
  if (!value || typeof value !== "object") return leaks;
  for (const [key, child] of Object.entries(value)) {
    const childPath = path ? `${path}.${key}` : key;
    if (key.includes("@bubstack/")) leaks.push(childPath);
    leaks.push(...findIdentityLeaks(child, childPath));
  }
  return leaks;
}

function packageDisplay(root, path) {
  return relative(root, path).replaceAll("\\", "/") || "package.json";
}

function validatePackage(
  pkg,
  expectedVersion,
  release,
  workspaceByName,
  publishableNames,
  problems,
) {
  const { manifest, displayPath } = pkg;
  const location = (field) => `${displayPath}#${field}`;

  if (typeof manifest.name !== "string" || !manifest.name.startsWith("@tc/")) {
    problems.push(
      issue("package.scope", location("name"), "publishable package name must use the @tc scope"),
    );
  }
  if (expectedVersion && manifest.version !== expectedVersion) {
    problems.push(
      issue(
        "package.version",
        location("version"),
        `expected lockstep version ${expectedVersion}, found ${JSON.stringify(manifest.version)}`,
      ),
    );
  }
  if (
    release?.upstreamVersion &&
    manifest.moeRelease?.upstreamVersion !== release.upstreamVersion
  ) {
    problems.push(
      issue(
        "package.upstream-version",
        location("moeRelease.upstreamVersion"),
        `must project ${release.upstreamVersion} from the canonical release file`,
      ),
    );
  }
  if (release?.upstreamCommit && manifest.moeRelease?.upstreamCommit !== release.upstreamCommit) {
    problems.push(
      issue(
        "package.upstream-commit",
        location("moeRelease.upstreamCommit"),
        `must project exact upstream commit ${release.upstreamCommit}`,
      ),
    );
  }
  if (manifest.publishConfig?.registry !== PROGET_REGISTRY) {
    problems.push(
      issue(
        "package.registry",
        location("publishConfig.registry"),
        `must be exactly ${PROGET_REGISTRY}`,
      ),
    );
  }
  if (manifest.publishConfig?.tag !== undefined) {
    problems.push(
      issue(
        "package.static-dist-tag",
        location("publishConfig.tag"),
        "dist-tag is selected from CI context and must not be pinned in a manifest",
      ),
    );
  }
  for (const leak of findIdentityLeaks(manifest)) {
    problems.push(
      issue(
        "package.bubstack-leak",
        location(leak),
        "publishable downstream manifest leaks an @bubstack identity",
      ),
    );
  }

  for (const field of DEPENDENCY_FIELDS) {
    for (const [name, range] of Object.entries(manifest[field] ?? {})) {
      const target = workspaceByName.get(name);
      if (!target) continue;
      if (!publishableNames.has(name)) {
        problems.push(
          issue(
            "package.private-internal-dependency",
            location(`${field}.${name}`),
            "publishable package depends on a private workspace package that cannot be installed",
          ),
        );
        continue;
      }
      if (expectedVersion && range !== "workspace:*" && range !== expectedVersion) {
        problems.push(
          issue(
            "package.internal-version",
            location(`${field}.${name}`),
            `internal release dependency must be workspace:* or exact ${expectedVersion}`,
          ),
        );
      }
    }
  }
}

function resolveCiContext(input, problems) {
  const branch = input.branch || null;
  const defaultBranch = input.defaultBranch || null;
  const mergeRequest = Boolean(input.mergeRequest);
  const distTag = input.distTag || null;

  if (!branch && !mergeRequest) {
    problems.push(
      issue("ci.branch", "CI_COMMIT_BRANCH", "source branch is required outside merge requests"),
    );
  }
  if (!defaultBranch) {
    problems.push(issue("ci.default-branch", "CI_DEFAULT_BRANCH", "default branch is required"));
  }
  const expectedTag = mergeRequest || !branch || branch !== defaultBranch ? "next" : "latest";
  if (!distTag) {
    problems.push(
      issue("ci.dist-tag", "NPM_DIST_TAG", `dist-tag is required; expected ${expectedTag}`),
    );
  } else if (distTag !== expectedTag) {
    problems.push(
      issue(
        "ci.dist-tag",
        "NPM_DIST_TAG",
        `${mergeRequest ? "merge request" : `branch ${branch}`} must use ${expectedTag}, not ${distTag}`,
      ),
    );
  }
  return { branch, defaultBranch, mergeRequest, distTag, expectedTag };
}

export function validateRelease(input) {
  const root = resolve(input.root ?? ".");
  const problems = [];
  const releaseFile = input.releaseFile ?? DEFAULT_RELEASE_FILE;
  const release = loadRelease(root, releaseFile, problems);
  const ci = resolveCiContext(input, problems);

  const packages = [];
  for (const path of discoverPackageFiles(root, problems)) {
    const displayPath = packageDisplay(root, path);
    const manifest = readJson(path, problems, "package", displayPath);
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) continue;
    packages.push({ path, displayPath, manifest, publishable: manifest.private !== true });
  }

  const workspaceByName = new Map();
  for (const pkg of packages) {
    const name = pkg.manifest.name;
    if (typeof name !== "string") continue;
    if (workspaceByName.has(name)) {
      problems.push(
        issue(
          "package.duplicate-name",
          `${pkg.displayPath}#name`,
          `duplicate workspace name ${name}`,
        ),
      );
    } else {
      workspaceByName.set(name, pkg);
    }
  }

  const publishable = packages.filter((pkg) => pkg.publishable);
  if (publishable.length === 0) {
    problems.push(
      issue("package.none", "pnpm-workspace.yaml", "release train has no publishable packages"),
    );
  }
  if (!publishable.some((pkg) => pkg.manifest.name === "@tc/moe")) {
    problems.push(
      issue(
        "package.umbrella",
        "package.json#name",
        "release train is missing publishable @tc/moe",
      ),
    );
  }
  const publishableNames = new Set(publishable.map((pkg) => pkg.manifest.name));
  for (const pkg of publishable) {
    validatePackage(
      pkg,
      release.expectedVersion,
      release.value,
      workspaceByName,
      publishableNames,
      problems,
    );
  }

  return {
    ok: problems.length === 0,
    root,
    registry: PROGET_REGISTRY,
    release: {
      file: release.path,
      upstreamVersion: release.value?.upstreamVersion ?? null,
      upstreamCommit: release.value?.upstreamCommit ?? null,
      tcRelease: release.value?.tcRelease ?? null,
      version: release.expectedVersion,
    },
    ci,
    packages: publishable.map((pkg) => ({
      path: pkg.displayPath,
      name: pkg.manifest.name ?? null,
      version: pkg.manifest.version ?? null,
    })),
    problems,
  };
}

function renderHuman(result, stdout, stderr) {
  const status = result.ok ? "PASS" : "FAIL";
  stdout.write(`tc-release: ${status}\n`);
  stdout.write(`  release: ${result.release.version ?? "unresolved"}\n`);
  stdout.write(
    `  upstream: ${result.release.upstreamCommit ?? "unresolved"} (${result.release.upstreamVersion ?? "unresolved"})\n`,
  );
  stdout.write(`  registry: ${result.registry}\n`);
  stdout.write(
    `  dist-tag: ${result.ci.distTag ?? "missing"} (expected ${result.ci.expectedTag})\n`,
  );
  stdout.write(`  publishable packages: ${result.packages.length}\n`);
  for (const pkg of result.packages) {
    stdout.write(
      `    - ${pkg.name ?? "<unnamed>"}@${pkg.version ?? "<unversioned>"} (${pkg.path})\n`,
    );
  }
  if (result.ok) {
    stdout.write("tc-release: release policy is internally consistent; no publish was attempted\n");
    return;
  }
  stderr.write(`tc-release: ${result.problems.length} problem(s)\n`);
  for (const problem of result.problems) {
    stderr.write(`  - [${problem.code}] ${problem.location}: ${problem.message}\n`);
  }
}

export function main(argv, runtime = {}) {
  const stdout = runtime.stdout ?? process.stdout;
  const stderr = runtime.stderr ?? process.stderr;
  const env = runtime.env ?? process.env;
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    stderr.write(`${error.message}\n${USAGE}`);
    return 2;
  }
  if (options.help) {
    stdout.write(USAGE);
    return 0;
  }

  const result = validateRelease({
    root: options.root,
    releaseFile: options.releaseFile,
    branch: options.branch ?? env.CI_COMMIT_BRANCH,
    defaultBranch: options.defaultBranch ?? env.CI_DEFAULT_BRANCH,
    mergeRequest: options.mergeRequest || Boolean(env.CI_MERGE_REQUEST_IID),
    distTag: options.distTag ?? env.NPM_DIST_TAG,
  });
  if (options.json) stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else renderHuman(result, stdout, stderr);
  return result.ok ? 0 : 1;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
