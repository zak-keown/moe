/**
 * Stage and verify the canonical legal payload for directly packed npm artifacts.
 *
 * npm automatically searches parent directories for a LICENSE file. In this
 * monorepo that makes an MIT package silently inherit the repository's Apache
 * license. Direct artifacts are therefore repacked from an npm-produced seed
 * in an owned staging directory, after replacing every root legal file with the
 * exact canonical bytes required by the package's declared SPDX expression.
 */

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";

const LEGAL_FILE_NAME = /^(?:licen[cs]e|notice)(?:$|[-_.])/iu;

const POLICY_FILES = Object.freeze({
  "Apache-2.0": Object.freeze([
    Object.freeze({ name: "LICENSE", source: "LICENSE" }),
    Object.freeze({ name: "NOTICE", source: "NOTICE" }),
  ]),
  MIT: Object.freeze([Object.freeze({ name: "LICENSE", source: "LICENSE-MIT" })]),
  "MIT AND Apache-2.0": Object.freeze([
    Object.freeze({ name: "LICENSE", source: "LICENSE" }),
    Object.freeze({ name: "LICENSE-MIT", source: "LICENSE-MIT" }),
    Object.freeze({ name: "NOTICE", source: "NOTICE" }),
  ]),
});

export class TcReleaseLegalError extends Error {
  constructor(message) {
    super(message);
    this.name = "TcReleaseLegalError";
  }
}

function commandRunner(command, args, options) {
  return spawnSync(command, args, { encoding: "utf8", ...options });
}

function runChecked(runCommand, command, args, options, label) {
  const result = runCommand(command, args, options);
  if (result?.error) {
    throw new TcReleaseLegalError(`${label} could not start: ${result.error.message}`);
  }
  if (result?.status !== 0) {
    throw new TcReleaseLegalError(
      `${label} failed with exit status ${result?.status ?? "unknown"}`,
    );
  }
  return result;
}

function legalPolicy(license, label) {
  const policy = POLICY_FILES[license];
  if (!policy) {
    throw new TcReleaseLegalError(
      `${label} has unsupported license expression ${JSON.stringify(license)}`,
    );
  }
  return policy;
}

export function canonicalLegalPayload(root, license, label = "package") {
  const payload = new Map();
  for (const file of legalPolicy(license, label)) {
    const source = resolve(root, file.source);
    let bytes;
    try {
      bytes = readFileSync(source);
    } catch (error) {
      throw new TcReleaseLegalError(
        `${label} canonical ${file.source} could not be read: ${error.message}`,
      );
    }
    payload.set(file.name, bytes);
  }
  return payload;
}

function readStagedManifest(packageDirectory, expectedName, expectedLicense) {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(join(packageDirectory, "package.json"), "utf8"));
  } catch (error) {
    throw new TcReleaseLegalError(
      `${expectedName} staged package.json is invalid: ${error.message}`,
    );
  }
  if (manifest?.name !== expectedName) {
    throw new TcReleaseLegalError(
      `direct legal seed has package name ${JSON.stringify(manifest?.name)}; expected ${expectedName}`,
    );
  }
  if (manifest.license !== expectedLicense) {
    throw new TcReleaseLegalError(
      `${expectedName} declares ${JSON.stringify(manifest.license)}; expected ${expectedLicense}`,
    );
  }
  return manifest;
}

export function stageDirectNpmTarball({
  root,
  seedTarball,
  outputDirectory,
  temporaryRoot,
  expectedName,
  expectedLicense,
  runCommand = commandRunner,
  env = process.env,
}) {
  const stagingRoot = mkdtempSync(join(temporaryRoot, "direct-legal-"));
  const packageDirectory = join(stagingRoot, "package");
  try {
    runChecked(
      runCommand,
      "tar",
      ["-xzf", seedTarball, "-C", stagingRoot],
      { env },
      `extract ${basename(seedTarball)} for legal staging`,
    );
    if (!existsSync(packageDirectory)) {
      throw new TcReleaseLegalError(`${basename(seedTarball)} has no package root`);
    }
    readStagedManifest(packageDirectory, expectedName, expectedLicense);

    for (const entry of readdirSync(packageDirectory, { withFileTypes: true })) {
      if (LEGAL_FILE_NAME.test(entry.name)) {
        rmSync(join(packageDirectory, entry.name), { recursive: true, force: true });
      }
    }
    for (const [name, bytes] of canonicalLegalPayload(root, expectedLicense, expectedName)) {
      mkdirSync(packageDirectory, { recursive: true });
      writeFileSync(join(packageDirectory, name), bytes);
      if (!readFileSync(join(packageDirectory, name)).equals(bytes)) {
        throw new TcReleaseLegalError(`${expectedName} failed to stage canonical ${name}`);
      }
    }

    const before = new Set(readdirSync(outputDirectory));
    runChecked(
      runCommand,
      "pnpm",
      ["--config.ignore-scripts=true", "pack", "--pack-destination", outputDirectory],
      { cwd: packageDirectory, env },
      `repack ${expectedName} with canonical legal payload`,
    );
    const added = readdirSync(outputDirectory).filter(
      (entry) => entry.endsWith(".tgz") && !before.has(entry),
    );
    if (added.length !== 1) {
      throw new TcReleaseLegalError(
        `repack ${expectedName} produced ${added.length} new tarballs; expected exactly one`,
      );
    }
    return join(outputDirectory, added[0]);
  } finally {
    rmSync(stagingRoot, { recursive: true, force: true });
  }
}

export function assertDirectLegalPayload({
  tarball,
  files,
  root,
  expectedName,
  expectedLicense,
  readBytes,
}) {
  const expected = canonicalLegalPayload(root, expectedLicense, expectedName);
  const actualNames = files
    .filter((path) => !path.includes("/") && LEGAL_FILE_NAME.test(path))
    .sort();
  const expectedNames = [...expected.keys()].sort();
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    throw new TcReleaseLegalError(
      `${expectedName} tarball legal files are ${JSON.stringify(actualNames)}; expected ${JSON.stringify(expectedNames)}`,
    );
  }
  for (const [name, canonicalBytes] of expected) {
    const packedBytes = readBytes(tarball, name);
    if (!Buffer.isBuffer(packedBytes) || !packedBytes.equals(canonicalBytes)) {
      throw new TcReleaseLegalError(
        `${expectedName} tarball ${name} does not byte-match canonical source`,
      );
    }
  }
}
