#!/usr/bin/env node

/**
 * Build and inspect the complete TC npm release train without publishing it.
 *
 * The source-tree policy check runs before packing. Every packed package.json is
 * then inspected from its tarball so pnpm workspace rewrites and downstream
 * identity are verified at the actual registry boundary.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkDownstreamScope } from "./check-downstream-scope.mjs";
import {
  inspectTabNativeBytes,
  stageTabNpmPackage,
  TAB_NATIVE_TARGETS,
  validateTabNativeMatrix,
} from "./tab-native.mjs";
import {
  assertRequiredPluginPayload,
  composePluginTarball,
  inspectPluginTarball,
} from "./tc-release-compose.mjs";
import { PROGET_REGISTRY, validateRelease } from "./tc-release-validate.mjs";

export const EXPECTED_RELEASE_PACKAGES = Object.freeze([
  { path: "packages/backstory/package.json", name: "@tc/moe-backstory" },
  { path: "packages/core/package.json", name: "@tc/moe-core" },
  { path: "packages/crew/package.json", name: "@tc/moe-crew" },
  {
    path: "packages/glass/package.json",
    name: "@tc/moe-glass",
    pluginRoot: "plugins/moe-glass",
    pluginKind: "glass",
  },
  {
    path: "packages/memory/package.json",
    name: "@tc/moe-memory",
    pluginRoot: "plugins/moe-memory",
    pluginKind: "memory",
  },
  { path: "packages/mint/package.json", name: "@tc/moe-mint" },
  {
    path: "packages/tab/bindings/typescript/package.json",
    name: "@tc/moe-tab",
    tabNative: true,
  },
  { path: "package.json", name: "@tc/moe" },
]);

const USAGE = `Usage:
  node scripts/tc-release-pack.mjs --output-dir <path> [options]

Options:
  --root <path>             Repository root (default: current directory)
  --output-dir <path>       Empty destination for the eight tarballs
  --release-file <path>     Canonical release input (default: tc-release.json)
  --tab-native-dir <path>   Linux native artifacts (default: .tc-tab-native)
  --branch <name>           Source branch (default: CI_COMMIT_BRANCH)
  --default-branch <name>   Default branch (default: CI_DEFAULT_BRANCH)
  --merge-request           Force merge-request context
  --dist-tag <tag>          Proposed npm tag (default: NPM_DIST_TAG)
  --help                    Show this help
`;

export class TcReleaseError extends Error {
  constructor(message) {
    super(message);
    this.name = "TcReleaseError";
  }
}

function parseArgs(argv) {
  const options = { mergeRequest: false };
  const valueOptions = new Map([
    ["--root", "root"],
    ["--output-dir", "outputDir"],
    ["--release-file", "releaseFile"],
    ["--tab-native-dir", "tabNativeDir"],
    ["--branch", "branch"],
    ["--default-branch", "defaultBranch"],
    ["--dist-tag", "distTag"],
  ]);
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--merge-request") {
      options.mergeRequest = true;
      continue;
    }
    const key = valueOptions.get(arg);
    if (!key) throw new TcReleaseError(`unknown option: ${arg}`);
    const value = argv[++index];
    if (!value || value.startsWith("--")) {
      throw new TcReleaseError(`${arg} requires a value`);
    }
    options[key] = value;
  }
  return options;
}

function commandRunner(command, args, options) {
  return spawnSync(command, args, { encoding: "utf8", ...options });
}

function secretFreeEnvironment(env) {
  const safe = {};
  for (const [name, value] of Object.entries(env)) {
    const normalized = name.toLowerCase();
    if (["proget_npm_auth", "npm_token", "node_auth_token"].includes(normalized)) continue;
    if (
      normalized.startsWith("npm_config_") &&
      ["auth", "token", "userconfig"].some((fragment) => normalized.includes(fragment))
    ) {
      continue;
    }
    safe[name] = value;
  }
  return safe;
}

function runChecked(runCommand, command, args, options, label) {
  const result = runCommand(command, args, options);
  if (result?.error) throw new TcReleaseError(`${label} could not start: ${result.error.message}`);
  if (result?.status !== 0) {
    throw new TcReleaseError(`${label} failed with exit status ${result?.status ?? "unknown"}`);
  }
  return result;
}

function walkStrings(value, path = "package.json") {
  const found = [];
  if (typeof value === "string") return [{ path, value }];
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) {
      found.push(...walkStrings(value[index], `${path}[${index}]`));
    }
    return found;
  }
  if (!value || typeof value !== "object") return found;
  for (const [key, child] of Object.entries(value)) {
    found.push({ path: `${path}#key`, value: key });
    found.push(...walkStrings(child, `${path}.${key}`));
  }
  return found;
}

export function assertPackedManifest(manifest, expected, releaseVersion, release) {
  const label = `${expected.name} packed package.json`;
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new TcReleaseError(`${label} must contain a JSON object`);
  }
  if (manifest.name !== expected.name) {
    throw new TcReleaseError(`${label} has unexpected name ${JSON.stringify(manifest.name)}`);
  }
  if (manifest.version !== releaseVersion) {
    throw new TcReleaseError(
      `${label} has version ${JSON.stringify(manifest.version)}; expected ${releaseVersion}`,
    );
  }
  if (manifest.private === true) throw new TcReleaseError(`${label} is marked private`);
  if (manifest.publishConfig?.registry !== PROGET_REGISTRY) {
    throw new TcReleaseError(`${label} does not target ${PROGET_REGISTRY}`);
  }
  if (manifest.publishConfig?.tag !== undefined) {
    throw new TcReleaseError(`${label} pins a dist-tag instead of deferring to CI`);
  }
  if (
    manifest.moeRelease?.upstreamVersion !== release.upstreamVersion ||
    manifest.moeRelease?.upstreamCommit !== release.upstreamCommit
  ) {
    throw new TcReleaseError(`${label} does not carry the canonical upstream release metadata`);
  }
  for (const item of walkStrings(manifest)) {
    if (item.value.includes("@bubstack/")) {
      throw new TcReleaseError(`${label} leaks an @bubstack identity at ${item.path}`);
    }
    if (item.value.startsWith("workspace:")) {
      throw new TcReleaseError(`${label} retains ${item.value} at ${item.path}`);
    }
  }
}

export function readPackedManifest(tarball, runCommand = commandRunner, env = process.env) {
  const result = runChecked(
    runCommand,
    "tar",
    ["-xOf", tarball, "package/package.json"],
    { env: secretFreeEnvironment(env) },
    `inspect ${basename(tarball)}`,
  );
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new TcReleaseError(
      `${basename(tarball)} contains an invalid package/package.json: ${error.message}`,
    );
  }
}

function invalidPackagePath(value, label, reason) {
  throw new TcReleaseError(
    `${label} is not a valid relative package file (${reason}): ${JSON.stringify(value)}`,
  );
}

function packageFile(value, label, { requireDotSlash = false } = {}) {
  if (typeof value !== "string" || value.length === 0) {
    invalidPackagePath(value, label, "expected a non-empty string");
  }
  if (value.includes("\\") || value.includes("\0")) {
    invalidPackagePath(value, label, "expected a POSIX path");
  }
  if (requireDotSlash && !value.startsWith("./")) {
    invalidPackagePath(value, label, "exports targets must start with ./");
  }
  if (posix.isAbsolute(value) || /^[A-Za-z][A-Za-z\d+.-]*:/u.test(value)) {
    invalidPackagePath(value, label, "absolute paths and URLs are forbidden");
  }
  const withoutPrefix = value.startsWith("./") ? value.slice(2) : value;
  const segments = withoutPrefix.split("/");
  if (
    withoutPrefix.length === 0 ||
    value.endsWith("/") ||
    segments.some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    invalidPackagePath(value, label, "path traversal and empty segments are forbidden");
  }
  if (withoutPrefix.includes("*")) {
    invalidPackagePath(value, label, "wildcard targets cannot be verified as files");
  }
  return withoutPrefix;
}

function collectExportTargets(value, label, found, seen) {
  if (typeof value === "string") {
    found.push([label, value, { requireDotSlash: true }]);
    return;
  }
  if (value === null) return;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) {
      collectExportTargets(value[index], `${label}[${index}]`, found, seen);
    }
    return;
  }
  if (typeof value !== "object") {
    throw new TcReleaseError(
      `${label} must contain only relative file targets, objects, arrays, or null`,
    );
  }
  if (seen.has(value)) throw new TcReleaseError(`${label} contains a cycle`);
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    collectExportTargets(child, `${label}.${key}`, found, seen);
  }
  seen.delete(value);
}

function manifestEntrypoints(manifest) {
  const found = [];
  for (const field of ["main", "types"]) {
    if (manifest[field] !== undefined) found.push([`package.json.${field}`, manifest[field], {}]);
  }
  if (manifest.bin !== undefined) {
    if (typeof manifest.bin === "string") {
      found.push(["package.json.bin", manifest.bin, {}]);
    } else if (
      manifest.bin !== null &&
      typeof manifest.bin === "object" &&
      !Array.isArray(manifest.bin)
    ) {
      for (const [name, target] of Object.entries(manifest.bin)) {
        found.push([`package.json.bin.${name}`, target, {}]);
      }
    } else {
      throw new TcReleaseError(
        "package.json.bin must be a relative file or an object of relative files",
      );
    }
  }
  if (manifest.exports !== undefined) {
    collectExportTargets(manifest.exports, "package.json.exports", found, new Set());
  }
  return found;
}

export function assertPackedEntrypoints(manifest, files, label = "packed package.json") {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new TcReleaseError(`${label} must contain a JSON object`);
  }
  const fileSet = new Set(files);
  for (const [entryLabel, value, options] of manifestEntrypoints(manifest)) {
    const path = packageFile(value, `${label} ${entryLabel}`, options);
    if (!fileSet.has(path)) {
      throw new TcReleaseError(
        `${label} ${entryLabel} points to missing package file ${JSON.stringify(value)}`,
      );
    }
  }
  return manifest;
}

export function listPackedFiles(tarball, runCommand = commandRunner, env = process.env) {
  const result = runChecked(
    runCommand,
    "tar",
    ["-tzf", tarball],
    { env: secretFreeEnvironment(env) },
    `list ${basename(tarball)}`,
  );
  const files = new Set();
  for (const entry of result.stdout.split(/\r?\n/u).filter(Boolean)) {
    const directory = entry.endsWith("/");
    const withoutSlash = directory ? entry.slice(0, -1) : entry;
    if (withoutSlash === "package") continue;
    if (!withoutSlash.startsWith("package/")) {
      throw new TcReleaseError(
        `${basename(tarball)} contains an entry outside the package root: ${JSON.stringify(entry)}`,
      );
    }
    const relative = withoutSlash.slice("package/".length);
    if (relative.startsWith("./")) {
      invalidPackagePath(
        relative,
        `${basename(tarball)} archive entry`,
        "dot segments are forbidden",
      );
    }
    const path = packageFile(relative, `${basename(tarball)} archive entry`);
    if (!directory) {
      if (files.has(path)) {
        throw new TcReleaseError(
          `${basename(tarball)} contains duplicate package file ${JSON.stringify(path)}`,
        );
      }
      files.add(path);
    }
  }
  return [...files].sort();
}

function readPackedBytes(tarball, path, runCommand, env) {
  return runChecked(
    runCommand,
    "tar",
    ["-xOf", tarball, `package/${path}`],
    { encoding: null, env: secretFreeEnvironment(env) },
    `inspect ${basename(tarball)} ${path}`,
  ).stdout;
}

export function assertPackedTabPayload(
  tarball,
  files,
  runCommand = commandRunner,
  env = process.env,
) {
  const fileSet = new Set(files);
  for (const path of ["LICENSE", "NOTICE", "THIRD_PARTY_LICENSES.txt"]) {
    if (!fileSet.has(path)) throw new TcReleaseError(`@tc/moe-tab tarball is missing ${path}`);
  }
  for (const target of TAB_NATIVE_TARGETS) {
    const path = `native/${target.id}/${target.filename}`;
    if (!fileSet.has(path)) {
      throw new TcReleaseError(`@tc/moe-tab tarball is missing ${path}`);
    }
    try {
      inspectTabNativeBytes(readPackedBytes(tarball, path, runCommand, env), target);
    } catch (error) {
      throw new TcReleaseError(`@tc/moe-tab tarball ${path} is invalid: ${error.message}`);
    }
  }
}

function assertExactReleaseTrain(validation) {
  const actual = new Map(validation.packages.map((pkg) => [pkg.path, pkg.name]));
  const expectedPaths = new Set(EXPECTED_RELEASE_PACKAGES.map((pkg) => pkg.path));
  const differences = [];
  for (const expected of EXPECTED_RELEASE_PACKAGES) {
    const name = actual.get(expected.path);
    if (name !== expected.name) {
      differences.push(`${expected.path}: expected ${expected.name}, found ${name ?? "missing"}`);
    }
  }
  for (const [path, name] of actual) {
    if (!expectedPaths.has(path))
      differences.push(`${path}: unexpected publishable package ${name}`);
  }
  if (differences.length > 0) {
    throw new TcReleaseError(
      `release train is not the required eight artifacts:\n${differences.join("\n")}`,
    );
  }
}

export function inspectReleaseTarballs({
  artifactsDir,
  validation,
  runCommand = commandRunner,
  env = process.env,
}) {
  if (!existsSync(artifactsDir))
    throw new TcReleaseError(`artifact directory is missing: ${artifactsDir}`);
  const tarballs = readdirSync(artifactsDir)
    .filter((entry) => entry.endsWith(".tgz"))
    .map((entry) => join(artifactsDir, entry))
    .sort();
  if (tarballs.length !== EXPECTED_RELEASE_PACKAGES.length) {
    throw new TcReleaseError(
      `expected ${EXPECTED_RELEASE_PACKAGES.length} tarballs, found ${tarballs.length}`,
    );
  }

  const expectedByName = new Map(EXPECTED_RELEASE_PACKAGES.map((pkg) => [pkg.name, pkg]));
  const inspected = new Map();
  for (const tarball of tarballs) {
    const files = listPackedFiles(tarball, runCommand, env);
    const initialManifest = readPackedManifest(tarball, runCommand, env);
    const initialExpected = expectedByName.get(initialManifest?.name);
    let pluginPayload;
    if (initialExpected?.pluginKind) {
      pluginPayload = inspectPluginTarball(tarball, { runCommand, env });
      assertRequiredPluginPayload(pluginPayload, initialExpected.pluginKind);
    }
    const manifest = pluginPayload?.manifest ?? initialManifest;
    const expected = expectedByName.get(manifest?.name);
    if (!expected) {
      throw new TcReleaseError(
        `${basename(tarball)} has unexpected package name ${manifest?.name}`,
      );
    }
    if (inspected.has(expected.name)) {
      throw new TcReleaseError(`duplicate packed artifact for ${expected.name}`);
    }
    assertPackedManifest(manifest, expected, validation.release.version, validation.release);
    assertPackedEntrypoints(manifest, files, `${expected.name} packed package.json`);
    if (expected.tabNative) assertPackedTabPayload(tarball, files, runCommand, env);
    inspected.set(expected.name, { tarball, manifest, files, pluginPayload });
  }
  for (const expected of EXPECTED_RELEASE_PACKAGES) {
    if (!inspected.has(expected.name)) {
      throw new TcReleaseError(`missing packed artifact for ${expected.name}`);
    }
  }
  return inspected;
}

export function packRelease(input) {
  const root = resolve(input.root ?? ".");
  if (!input.outputDir) throw new TcReleaseError("--output-dir is required");
  const artifactsDir = isAbsolute(input.outputDir)
    ? input.outputDir
    : resolve(root, input.outputDir);
  if (existsSync(artifactsDir) && readdirSync(artifactsDir).length > 0) {
    throw new TcReleaseError(`artifact directory must be empty: ${artifactsDir}`);
  }

  const downstreamScope = checkDownstreamScope(root);
  if (!downstreamScope.ok) {
    throw new TcReleaseError(
      `downstream scope check failed:\n${downstreamScope.problems
        .map((problem) => `[${problem.code}] ${problem.location}: ${problem.message}`)
        .join("\n")}`,
    );
  }

  const validation = validateRelease({
    root,
    releaseFile: input.releaseFile,
    branch: input.branch,
    defaultBranch: input.defaultBranch,
    mergeRequest: input.mergeRequest,
    distTag: input.distTag,
  });
  if (!validation.ok) {
    throw new TcReleaseError(
      `release validation failed:\n${validation.problems
        .map((problem) => `[${problem.code}] ${problem.location}: ${problem.message}`)
        .join("\n")}`,
    );
  }
  assertExactReleaseTrain(validation);

  const runCommand = input.runCommand ?? commandRunner;
  const env = secretFreeEnvironment(input.env ?? process.env);
  const tabNativeMatrix = validateTabNativeMatrix({
    root,
    linuxDir: input.tabNativeDir,
    releaseVersion: validation.release.version,
    runCommand,
    env,
  });
  mkdirSync(artifactsDir, { recursive: true });
  const temporaryRoot = mkdtempSync(join(tmpdir(), "moe-release-pack-"));
  const seedsDirectory = join(temporaryRoot, "seeds");
  const tabPackageDirectory = join(temporaryRoot, "tab-package");
  mkdirSync(seedsDirectory);
  try {
    stageTabNpmPackage({ root, destination: tabPackageDirectory, matrix: tabNativeMatrix });
    for (const expected of EXPECTED_RELEASE_PACKAGES) {
      const packageDirectory = expected.tabNative
        ? tabPackageDirectory
        : dirname(join(root, expected.path));
      const packDestination = expected.pluginRoot ? seedsDirectory : artifactsDir;
      const before = new Set(readdirSync(packDestination));
      runChecked(
        runCommand,
        "pnpm",
        ["pack", "--pack-destination", packDestination],
        { cwd: packageDirectory, env },
        `pack ${expected.name}`,
      );
      const added = readdirSync(packDestination).filter(
        (entry) => entry.endsWith(".tgz") && !before.has(entry),
      );
      if (added.length !== 1) {
        throw new TcReleaseError(
          `pack ${expected.name} produced ${added.length} new tarballs; expected exactly one`,
        );
      }
      if (expected.pluginRoot) {
        composePluginTarball({
          seedTarball: join(packDestination, added[0]),
          pluginDirectory: join(root, expected.pluginRoot),
          outputDirectory: artifactsDir,
          pluginKind: expected.pluginKind,
          tempRoot: temporaryRoot,
          runCommand,
          env,
        });
      }
    }
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }

  const inspected = inspectReleaseTarballs({ artifactsDir, validation, runCommand, env });
  return {
    root,
    artifactsDir,
    validation,
    tabNativeMatrix,
    artifacts: EXPECTED_RELEASE_PACKAGES.map((expected) => inspected.get(expected.name)),
  };
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
  try {
    const result = packRelease({
      ...options,
      branch: options.branch ?? env.CI_COMMIT_BRANCH,
      defaultBranch: options.defaultBranch ?? env.CI_DEFAULT_BRANCH,
      mergeRequest: options.mergeRequest || Boolean(env.CI_MERGE_REQUEST_IID),
      distTag: options.distTag ?? env.NPM_DIST_TAG,
      env,
      runCommand: runtime.runCommand,
    });
    stdout.write(
      `tc-release-pack: inspected ${result.artifacts.length} artifacts for ${result.validation.release.version}\n`,
    );
    return 0;
  } catch (error) {
    stderr.write(`tc-release-pack: ${error.message}\n`);
    return 1;
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
