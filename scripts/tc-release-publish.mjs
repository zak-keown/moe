#!/usr/bin/env node

/** Inspect the complete TC release train, then publish it to internal ProGet. */

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EXPECTED_RELEASE_PACKAGES,
  inspectReleaseTarballs,
  TcReleaseError,
} from "./tc-release-pack.mjs";
import { PROGET_REGISTRY, validateRelease } from "./tc-release-validate.mjs";

const USAGE = `Usage:
  node scripts/tc-release-publish.mjs --artifacts-dir <path> [options]

Options:
  --root <path>             Repository root (default: current directory)
  --artifacts-dir <path>    Directory containing all eight inspected tarballs
  --release-file <path>     Canonical release input (default: tc-release.json)
  --branch <name>           Source branch (default: CI_COMMIT_BRANCH)
  --default-branch <name>   Default branch (default: CI_DEFAULT_BRANCH)
  --merge-request           Force merge-request context
  --dist-tag <tag>          Proposed npm tag (default: NPM_DIST_TAG)
  --help                    Show this help
`;

function parseArgs(argv) {
  const options = { mergeRequest: false };
  const valueOptions = new Map([
    ["--root", "root"],
    ["--artifacts-dir", "artifactsDir"],
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
    if (!value || value.startsWith("--")) throw new TcReleaseError(`${arg} requires a value`);
    options[key] = value;
  }
  return options;
}

function commandRunner(command, args, options) {
  return spawnSync(command, args, { encoding: "utf8", ...options });
}

function assertCommandSucceeded(result, action, packageName) {
  if (result?.error) {
    throw new TcReleaseError(`${action} ${packageName} could not start: ${result.error.message}`);
  }
  if (result?.status !== 0) {
    throw new TcReleaseError(
      `${action} ${packageName} failed with exit status ${result?.status ?? "unknown"}`,
    );
  }
}

function candidateTag(version) {
  return `tc-candidate-${version.replaceAll(/[^a-zA-Z0-9-]/g, "-")}`;
}

function releaseValidation(input, root) {
  const validation = validateRelease({
    root,
    releaseFile: input.releaseFile,
    branch: input.branch,
    defaultBranch: input.defaultBranch,
    mergeRequest: input.mergeRequest,
    distTag: input.distTag,
    authPresent: Boolean(input.auth),
  });
  if (!validation.ok) {
    throw new TcReleaseError(
      `release validation failed:\n${validation.problems
        .map((problem) => `[${problem.code}] ${problem.location}: ${problem.message}`)
        .join("\n")}`,
    );
  }
  return validation;
}

export function publishRelease(input) {
  const root = resolve(input.root ?? ".");
  if (!input.artifactsDir) throw new TcReleaseError("--artifacts-dir is required");
  if (!input.auth) throw new TcReleaseError("PROGET_NPM_AUTH is required");
  if (/[\r\n]/.test(input.auth)) {
    throw new TcReleaseError("PROGET_NPM_AUTH contains an invalid line break");
  }
  const artifactsDir = isAbsolute(input.artifactsDir)
    ? input.artifactsDir
    : resolve(root, input.artifactsDir);
  const validation = releaseValidation(input, root);
  const runCommand = input.runCommand ?? commandRunner;

  // This completes every fallible validation and tarball inspection before the
  // first npm publish process can be launched.
  const inspected = inspectReleaseTarballs({
    artifactsDir,
    validation,
    runCommand,
    env: input.env,
  });

  const authDirectory = mkdtempSync(join(tmpdir(), "moe-proget-npm-"));
  const npmrc = join(authDirectory, ".npmrc");
  writeFileSync(
    npmrc,
    `@tc:registry=${PROGET_REGISTRY}\n//proget.tcdevops.com/npm/tcnpm/:_auth=${input.auth}\nalways-auth=true\n`,
    { encoding: "utf8", mode: 0o600, flag: "wx" },
  );
  const { PROGET_NPM_AUTH: _credential, ...safeEnvironment } = input.env ?? process.env;
  const promoteLatest = validation.ci.expectedTag === "latest";
  const uploadTag = promoteLatest ? candidateTag(validation.release.version) : "next";
  try {
    for (const expected of EXPECTED_RELEASE_PACKAGES) {
      const artifact = inspected.get(expected.name);
      const result = runCommand(
        "npm",
        [
          "publish",
          "--registry",
          PROGET_REGISTRY,
          "--tag",
          uploadTag,
          "--userconfig",
          npmrc,
          artifact.tarball,
        ],
        { cwd: root, env: safeEnvironment },
      );
      assertCommandSucceeded(result, "publish", expected.name);
    }

    // @tc/moe is deliberately the last item in EXPECTED_RELEASE_PACKAGES. The
    // supported umbrella entry point cannot move until every dependency has
    // both uploaded and promoted successfully.
    if (promoteLatest) {
      for (const expected of EXPECTED_RELEASE_PACKAGES) {
        const result = runCommand(
          "npm",
          [
            "dist-tag",
            "add",
            `${expected.name}@${validation.release.version}`,
            "latest",
            "--registry",
            PROGET_REGISTRY,
            "--userconfig",
            npmrc,
          ],
          { cwd: root, env: safeEnvironment },
        );
        assertCommandSucceeded(result, "promote", expected.name);
      }
    }
  } finally {
    rmSync(authDirectory, { recursive: true, force: true });
  }
  return {
    version: validation.release.version,
    distTag: validation.ci.expectedTag,
    uploadTag,
    packages: EXPECTED_RELEASE_PACKAGES.map((pkg) => pkg.name),
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
    const result = publishRelease({
      ...options,
      branch: options.branch ?? env.CI_COMMIT_BRANCH,
      defaultBranch: options.defaultBranch ?? env.CI_DEFAULT_BRANCH,
      mergeRequest: options.mergeRequest || Boolean(env.CI_MERGE_REQUEST_IID),
      distTag: options.distTag ?? env.NPM_DIST_TAG,
      auth: env.PROGET_NPM_AUTH,
      env,
      runCommand: runtime.runCommand,
    });
    stdout.write(
      `tc-release-publish: published ${result.packages.length} packages at ${result.version} with tag ${result.distTag}\n`,
    );
    return 0;
  } catch (error) {
    stderr.write(`tc-release-publish: ${error.message}\n`);
    return 1;
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
