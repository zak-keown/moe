#!/usr/bin/env node

/** Publish an inspected TC release train to internal ProGet, safely and resumably. */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createReleaseSubprocessEnvironment } from "./release-subprocess-environment.mjs";
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
  --help                    Show this help
`;

function parseArgs(argv) {
  const options = {};
  const valueOptions = new Map([
    ["--root", "root"],
    ["--artifacts-dir", "artifactsDir"],
    ["--release-file", "releaseFile"],
  ]);
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
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

function isProtectedRef(value) {
  return value === true || value === "true";
}

function assertPublishContext(input) {
  const problems = [];
  if (!input.auth) problems.push("PROGET_NPM_AUTH is required");
  if (input.auth && /[\r\n]/.test(input.auth)) {
    problems.push("PROGET_NPM_AUTH contains an invalid line break");
  }
  if (!isProtectedRef(input.protectedRef)) {
    problems.push("CI_COMMIT_REF_PROTECTED must be exactly true");
  }
  if (input.pipelineSource !== "push") {
    problems.push("CI_PIPELINE_SOURCE must be exactly push");
  }
  if (!input.branch || !input.defaultBranch || input.branch !== input.defaultBranch) {
    problems.push("CI_COMMIT_BRANCH must exactly match CI_DEFAULT_BRANCH");
  }
  if (input.mergeRequest) problems.push("merge-request context cannot publish");
  if (input.distTag !== "latest") problems.push("publish dist-tag must be exactly latest");
  if (problems.length > 0) {
    throw new TcReleaseError(`unsafe publish context:\n${problems.join("\n")}`);
  }
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
    protectedRef: input.protectedRef,
    pipelineSource: input.pipelineSource,
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

function localIntegrity(tarball) {
  return `sha512-${createHash("sha512").update(readFileSync(tarball)).digest("base64")}`;
}

function parseJson(text) {
  if (typeof text !== "string" || text.trim() === "") return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function structuredErrorCode(result) {
  for (const output of [result?.stdout, result?.stderr]) {
    const value = parseJson(output);
    if (typeof value?.error?.code === "string") return value.error.code;
    if (typeof value?.code === "string") return value.code;
  }
  return null;
}

function queryRegistryField(context, packageSpec, field, label) {
  const result = context.runCommand(
    "npm",
    [
      "view",
      packageSpec,
      field,
      "--json",
      "--loglevel",
      "silent",
      "--registry",
      PROGET_REGISTRY,
      "--userconfig",
      context.npmrc,
    ],
    { cwd: context.root, env: context.env },
  );
  if (result?.error) {
    throw new TcReleaseError(`${label} could not start: ${result.error.message}`);
  }
  if (result?.status !== 0) {
    if (structuredErrorCode(result) === "E404") return { absent: true, value: null };
    throw new TcReleaseError(
      `${label} could not be verified (exit status ${result?.status ?? "unknown"})`,
    );
  }
  const value = parseJson(result.stdout);
  if (typeof value !== "string" || value.length === 0) {
    throw new TcReleaseError(`${label} returned an unverifiable response`);
  }
  return { absent: false, value };
}

function queryExactIntegrity(context, name, version) {
  return queryRegistryField(
    context,
    `${name}@${version}`,
    "dist.integrity",
    `query exact version ${name}@${version}`,
  );
}

function queryLatest(context, name) {
  const result = context.runCommand(
    "npm",
    [
      "dist-tag",
      "ls",
      name,
      "--json",
      "--loglevel",
      "silent",
      "--registry",
      PROGET_REGISTRY,
      "--userconfig",
      context.npmrc,
    ],
    { cwd: context.root, env: context.env },
  );
  if (result?.error) {
    throw new TcReleaseError(`query latest ${name} could not start: ${result.error.message}`);
  }
  if (result?.status !== 0) {
    if (structuredErrorCode(result) === "E404") {
      return { absent: true, packageMissing: true, value: null };
    }
    throw new TcReleaseError(
      `query latest ${name} could not be verified (exit status ${result?.status ?? "unknown"})`,
    );
  }
  const tags = parseJson(result.stdout);
  if (!tags || typeof tags !== "object" || Array.isArray(tags)) {
    throw new TcReleaseError(`query latest ${name} returned an unverifiable response`);
  }
  if (!Object.hasOwn(tags, "latest")) {
    return { absent: true, packageMissing: false, value: null };
  }
  if (typeof tags.latest !== "string" || tags.latest.length === 0) {
    throw new TcReleaseError(`query latest ${name} returned an invalid latest tag`);
  }
  return { absent: false, packageMissing: false, value: tags.latest };
}

function parseSemver(version) {
  const match =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(
      version,
    );
  if (!match) return null;
  return {
    core: match.slice(1, 4).map(Number),
    prerelease: match[4] === undefined ? null : match[4].split("."),
  };
}

function compareSemver(leftVersion, rightVersion) {
  const left = parseSemver(leftVersion);
  const right = parseSemver(rightVersion);
  if (!left || !right) return null;
  for (let index = 0; index < 3; index++) {
    if (left.core[index] !== right.core[index]) {
      return left.core[index] < right.core[index] ? -1 : 1;
    }
  }
  if (left.prerelease === null || right.prerelease === null) {
    if (left.prerelease === right.prerelease) return 0;
    return left.prerelease === null ? 1 : -1;
  }
  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index++) {
    const leftPart = left.prerelease[index];
    const rightPart = right.prerelease[index];
    if (leftPart === undefined || rightPart === undefined) {
      if (leftPart === rightPart) return 0;
      return leftPart === undefined ? -1 : 1;
    }
    if (leftPart === rightPart) continue;
    const leftNumeric = /^\d+$/.test(leftPart);
    const rightNumeric = /^\d+$/.test(rightPart);
    if (leftNumeric && rightNumeric) return Number(leftPart) < Number(rightPart) ? -1 : 1;
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return leftPart < rightPart ? -1 : 1;
  }
  return 0;
}

function assertExactIntegrity(name, remote, expectedIntegrity) {
  if (remote.absent) return "missing";
  if (remote.value !== expectedIntegrity) {
    throw new TcReleaseError(
      `registry integrity mismatch for ${name}: exact version exists with different bytes`,
    );
  }
  return "matching";
}

function latestPromotionPlan(latestByName, targetVersion) {
  const alreadyTarget = new Set();
  const priorStates = new Set();
  for (const [name, latest] of latestByName) {
    const state = latest.absent ? null : latest.value;
    if (state === targetVersion) alreadyTarget.add(name);
    else priorStates.add(state);
  }
  if (alreadyTarget.size === EXPECTED_RELEASE_PACKAGES.length) {
    return { alreadyTarget, complete: true, prior: null };
  }
  if (priorStates.size !== 1) {
    throw new TcReleaseError(
      "registry latest tags are neither coherent nor a recoverable interrupted promotion",
    );
  }
  const prior = [...priorStates][0];
  if (prior === null) return { alreadyTarget, complete: false, prior };
  const order = compareSemver(targetVersion, prior);
  if (order === null) {
    throw new TcReleaseError(`prior coherent latest ${prior} is not a verifiable semantic version`);
  }
  if (order < 0) {
    throw new TcReleaseError(
      `target ${targetVersion} is older than prior coherent latest ${prior}`,
    );
  }
  return { alreadyTarget, complete: false, prior };
}

function sameLatest(actual, expected) {
  return expected === null ? actual.absent : !actual.absent && actual.value === expected;
}

function distTagAdd(context, name, version) {
  const result = context.runCommand(
    "npm",
    [
      "dist-tag",
      "add",
      `${name}@${version}`,
      "latest",
      "--registry",
      PROGET_REGISTRY,
      "--userconfig",
      context.npmrc,
    ],
    { cwd: context.root, env: context.env },
  );
  assertCommandSucceeded(result, "promote", name);
}

function distTagRemove(context, name) {
  const result = context.runCommand(
    "npm",
    [
      "dist-tag",
      "rm",
      name,
      "latest",
      "--registry",
      PROGET_REGISTRY,
      "--userconfig",
      context.npmrc,
    ],
    { cwd: context.root, env: context.env },
  );
  assertCommandSucceeded(result, "remove latest tag from", name);
}

function rollbackLatest(context, attemptedNames, snapshot, targetVersion) {
  const unresolved = [];
  for (const name of [...attemptedNames].reverse()) {
    try {
      const current = queryLatest(context, name);
      if (sameLatest(current, snapshot)) continue;
      if (current.absent || current.value !== targetVersion) {
        unresolved.push(`${name} changed concurrently; latest was left untouched`);
        continue;
      }
      if (snapshot === null) distTagRemove(context, name);
      else distTagAdd(context, name, snapshot);
      const restored = queryLatest(context, name);
      if (!sameLatest(restored, snapshot)) unresolved.push(`${name} rollback did not verify`);
    } catch (error) {
      unresolved.push(`${name}: ${error.message}`);
    }
  }
  return unresolved;
}

function publishArtifact(context, artifact, uploadTag) {
  const result = context.runCommand(
    "npm",
    [
      "publish",
      "--registry",
      PROGET_REGISTRY,
      "--tag",
      uploadTag,
      "--userconfig",
      context.npmrc,
      artifact.tarball,
    ],
    { cwd: context.root, env: context.env },
  );
  assertCommandSucceeded(result, "publish", artifact.manifest.name);
}

export function publishRelease(input) {
  const root = resolve(input.root ?? ".");
  if (!input.artifactsDir) throw new TcReleaseError("--artifacts-dir is required");

  // Nothing, including tar inspection, may execute until the protected-push
  // boundary is independently established inside the mutating publish path.
  assertPublishContext(input);
  const artifactsDir = isAbsolute(input.artifactsDir)
    ? input.artifactsDir
    : resolve(root, input.artifactsDir);
  const validation = releaseValidation(input, root);
  const runCommand = input.runCommand ?? commandRunner;
  const inputEnvironment = input.env ?? process.env;
  const inspectionEnvironment = createReleaseSubprocessEnvironment(inputEnvironment);

  // Inspect the complete train and hash every local artifact before contacting
  // the registry. A bad eighth tarball therefore cannot follow seven queries.
  const inspected = inspectReleaseTarballs({
    artifactsDir,
    validation,
    runCommand,
    env: inspectionEnvironment,
  });
  const localIntegrityByName = new Map();
  for (const expected of EXPECTED_RELEASE_PACKAGES) {
    localIntegrityByName.set(expected.name, localIntegrity(inspected.get(expected.name).tarball));
  }

  const authDirectory = mkdtempSync(join(tmpdir(), "moe-proget-npm-"));
  const npmrc = join(authDirectory, ".npmrc");
  try {
    writeFileSync(
      npmrc,
      `@tc:registry=${PROGET_REGISTRY}\n//proget.tcdevops.com/npm/tcnpm/:_auth=${input.auth}\nalways-auth=true\n`,
      { encoding: "utf8", mode: 0o600, flag: "wx" },
    );
    const registryEnvironment = createReleaseSubprocessEnvironment(inputEnvironment, {
      NPM_CONFIG_USERCONFIG: npmrc,
    });
    const context = {
      root,
      npmrc,
      runCommand,
      env: registryEnvironment,
    };
    const version = validation.release.version;
    const uploadTag = candidateTag(version);

    const exactByName = new Map();
    const latestByName = new Map();
    const preflightErrors = [];
    for (const expected of EXPECTED_RELEASE_PACKAGES) {
      try {
        exactByName.set(expected.name, queryExactIntegrity(context, expected.name, version));
      } catch (error) {
        preflightErrors.push(error.message);
      }
      try {
        latestByName.set(expected.name, queryLatest(context, expected.name));
      } catch (error) {
        preflightErrors.push(error.message);
      }
    }
    if (preflightErrors.length > 0) {
      throw new TcReleaseError(`registry preflight failed:\n${preflightErrors.join("\n")}`);
    }

    const exactStateByName = new Map();
    for (const expected of EXPECTED_RELEASE_PACKAGES) {
      exactStateByName.set(
        expected.name,
        assertExactIntegrity(
          expected.name,
          exactByName.get(expected.name),
          localIntegrityByName.get(expected.name),
        ),
      );
    }

    const preflightPlan = latestPromotionPlan(latestByName, version);
    const missingNames = EXPECTED_RELEASE_PACKAGES.filter(
      (expected) => exactStateByName.get(expected.name) === "missing",
    ).map((expected) => expected.name);
    if (preflightPlan.complete && missingNames.length > 0) {
      throw new TcReleaseError(
        "registry latest points at the target but one or more exact versions are absent",
      );
    }
    if (preflightPlan.complete) {
      return {
        version,
        distTag: "latest",
        uploadTag,
        packages: EXPECTED_RELEASE_PACKAGES.map((pkg) => pkg.name),
        uploaded: [],
        noOp: true,
      };
    }

    const uploaded = [];
    for (const expected of EXPECTED_RELEASE_PACKAGES) {
      if (exactStateByName.get(expected.name) !== "missing") continue;
      const artifact = inspected.get(expected.name);
      try {
        publishArtifact(context, artifact, uploadTag);
        uploaded.push(expected.name);
      } catch (publishError) {
        // A concurrent/retried publisher may have won the immutable-version
        // race. Continue only when the registry now proves it uploaded our bytes.
        const remote = queryExactIntegrity(context, expected.name, version);
        if (
          assertExactIntegrity(expected.name, remote, localIntegrityByName.get(expected.name)) !==
          "matching"
        ) {
          throw publishError;
        }
      }
    }

    // Exact-version integrity is an immutable barrier. No latest tag may move
    // until all eight registry artifacts have been requeried and match locally.
    for (const expected of EXPECTED_RELEASE_PACKAGES) {
      const remote = queryExactIntegrity(context, expected.name, version);
      if (
        assertExactIntegrity(expected.name, remote, localIntegrityByName.get(expected.name)) !==
        "matching"
      ) {
        throw new TcReleaseError(`post-upload verification found ${expected.name} absent`);
      }
    }

    // Re-read tags only after the exact-integrity barrier. A prior process may
    // have stopped between tag writes; target plus one coherent prior state is
    // recoverable, while every other mixture remains ambiguous and fails shut.
    const latestAfterBarrier = new Map();
    for (const expected of EXPECTED_RELEASE_PACKAGES) {
      latestAfterBarrier.set(expected.name, queryLatest(context, expected.name));
    }
    const promotionPlan = latestPromotionPlan(latestAfterBarrier, version);
    if (promotionPlan.complete) {
      return {
        version,
        distTag: "latest",
        uploadTag,
        packages: EXPECTED_RELEASE_PACKAGES.map((pkg) => pkg.name),
        uploaded,
        noOp: uploaded.length === 0,
      };
    }

    const promotionOrder = [
      ...EXPECTED_RELEASE_PACKAGES.filter((expected) => expected.name !== "@tc/moe"),
      ...EXPECTED_RELEASE_PACKAGES.filter((expected) => expected.name === "@tc/moe"),
    ];
    const attempted = [];
    try {
      for (const expected of promotionOrder) {
        const current = queryLatest(context, expected.name);
        if (promotionPlan.alreadyTarget.has(expected.name)) {
          if (current.absent || current.value !== version) {
            throw new TcReleaseError(
              `latest changed concurrently for already-promoted ${expected.name}`,
            );
          }
          continue;
        }
        if (!sameLatest(current, promotionPlan.prior)) {
          throw new TcReleaseError(
            `latest changed concurrently before promoting ${expected.name}; refusing to overwrite it`,
          );
        }
        attempted.push(expected.name);
        distTagAdd(context, expected.name, version);
        const promoted = queryLatest(context, expected.name);
        if (promoted.absent || promoted.value !== version) {
          throw new TcReleaseError(`latest promotion did not verify for ${expected.name}`);
        }
      }
      for (const expected of promotionOrder) {
        const current = queryLatest(context, expected.name);
        if (current.absent || current.value !== version) {
          throw new TcReleaseError(`post-promotion verification failed for ${expected.name}`);
        }
      }
    } catch (promotionError) {
      const unresolved = rollbackLatest(context, attempted, promotionPlan.prior, version);
      const detail =
        unresolved.length === 0
          ? "latest rollback verified"
          : `latest rollback unresolved: ${unresolved.join("; ")}`;
      throw new TcReleaseError(`${promotionError.message}; ${detail}`);
    }

    return {
      version,
      distTag: "latest",
      uploadTag,
      packages: EXPECTED_RELEASE_PACKAGES.map((pkg) => pkg.name),
      uploaded,
      noOp: false,
    };
  } finally {
    rmSync(authDirectory, { recursive: true, force: true });
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
  try {
    const result = publishRelease({
      ...options,
      branch: env.CI_COMMIT_BRANCH,
      defaultBranch: env.CI_DEFAULT_BRANCH,
      mergeRequest: Boolean(env.CI_MERGE_REQUEST_IID),
      distTag: env.NPM_DIST_TAG,
      protectedRef: env.CI_COMMIT_REF_PROTECTED,
      pipelineSource: env.CI_PIPELINE_SOURCE,
      auth: env.PROGET_NPM_AUTH,
      env,
      runCommand: runtime.runCommand,
    });
    const action = result.noOp ? "already complete" : "published";
    stdout.write(
      `tc-release-publish: ${action} ${result.packages.length} packages at ${result.version} with tag ${result.distTag}\n`,
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
