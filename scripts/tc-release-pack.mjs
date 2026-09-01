#!/usr/bin/env node

/**
 * Build and inspect the complete TC npm release train without publishing it.
 *
 * The source-tree policy check runs before packing. Every packed package.json is
 * then inspected from its tarball so pnpm workspace rewrites and downstream
 * identity are verified at the actual registry boundary.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkDownstreamScope } from "./check-downstream-scope.mjs";
import { PROGET_REGISTRY, validateRelease } from "./tc-release-validate.mjs";

export const EXPECTED_RELEASE_PACKAGES = Object.freeze([
  { path: "packages/backstory/package.json", name: "@tc/moe-backstory" },
  { path: "packages/core/package.json", name: "@tc/moe-core" },
  { path: "packages/crew/package.json", name: "@tc/moe-crew" },
  { path: "packages/glass/package.json", name: "@tc/moe-glass" },
  { path: "packages/memory/package.json", name: "@tc/moe-memory" },
  { path: "packages/mint/package.json", name: "@tc/moe-mint" },
  { path: "packages/tab/bindings/typescript/package.json", name: "@tc/moe-tab" },
  { path: "package.json", name: "@tc/moe" },
]);

const USAGE = `Usage:
  node scripts/tc-release-pack.mjs --output-dir <path> [options]

Options:
  --root <path>             Repository root (default: current directory)
  --output-dir <path>       Empty destination for the eight tarballs
  --release-file <path>     Canonical release input (default: tc-release.json)
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
  const { PROGET_NPM_AUTH: _credential, ...safe } = env;
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
    const manifest = readPackedManifest(tarball, runCommand, env);
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
    inspected.set(expected.name, { tarball, manifest });
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
    authPresent: input.authPresent,
  });
  if (!validation.ok) {
    throw new TcReleaseError(
      `release validation failed:\n${validation.problems
        .map((problem) => `[${problem.code}] ${problem.location}: ${problem.message}`)
        .join("\n")}`,
    );
  }
  assertExactReleaseTrain(validation);

  mkdirSync(artifactsDir, { recursive: true });
  const runCommand = input.runCommand ?? commandRunner;
  const env = secretFreeEnvironment(input.env ?? process.env);
  for (const expected of EXPECTED_RELEASE_PACKAGES) {
    const packageDirectory = dirname(join(root, expected.path));
    const before = new Set(readdirSync(artifactsDir));
    runChecked(
      runCommand,
      "pnpm",
      ["pack", "--pack-destination", artifactsDir],
      { cwd: packageDirectory, env },
      `pack ${expected.name}`,
    );
    const added = readdirSync(artifactsDir).filter(
      (entry) => entry.endsWith(".tgz") && !before.has(entry),
    );
    if (added.length !== 1) {
      throw new TcReleaseError(
        `pack ${expected.name} produced ${added.length} new tarballs; expected exactly one`,
      );
    }
  }

  const inspected = inspectReleaseTarballs({ artifactsDir, validation, runCommand, env });
  return {
    root,
    artifactsDir,
    validation,
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
      authPresent: Boolean(env.PROGET_NPM_AUTH),
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
