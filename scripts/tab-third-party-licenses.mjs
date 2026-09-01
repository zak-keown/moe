#!/usr/bin/env node
/** Generate the legal payload for the statically linked @tc/moe-tab cdylib. */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

export const RELEASE_TARGETS = Object.freeze([
  "aarch64-apple-darwin",
  "x86_64-apple-darwin",
  "aarch64-unknown-linux-gnu",
  "x86_64-unknown-linux-gnu",
]);

const ROOT_PACKAGE = "moe-tab-ffi";
const REGISTRY_SOURCE_PREFIX = "registry+";
const DEFAULT_ROOT = fileURLToPath(new URL("..", import.meta.url));
const DEFAULT_MANIFEST = "packages/tab/Cargo.toml";
const DEFAULT_OUTPUT = "packages/tab/native-release/THIRD_PARTY_LICENSES.txt";
const textDecoder = new TextDecoder("utf-8", { fatal: true });

function compare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function licenseInputFiles(root = DEFAULT_ROOT) {
  const cratesDirectory = join(root, "packages/tab/crates");
  const files = ["packages/tab/Cargo.lock", "packages/tab/Cargo.toml"];
  for (const entry of readdirSync(cratesDirectory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = `packages/tab/crates/${entry.name}/Cargo.toml`;
    if (existsSync(join(root, path))) files.push(path);
  }
  return files.sort(compare);
}

export function licenseInputsDigest(root = DEFAULT_ROOT) {
  const hash = createHash("sha256");
  hash.update("moe-tab-third-party-license-inputs-v1\0");
  for (const path of licenseInputFiles(root)) {
    const pathBytes = Buffer.from(path, "utf8");
    const content = readFileSync(join(root, path));
    hash.update(`${pathBytes.length}:`);
    hash.update(pathBytes);
    hash.update(`${content.length}:`);
    hash.update(content);
  }
  return hash.digest("hex");
}

function packageKey(pkg) {
  return `${pkg.name}\0${pkg.version}\0${pkg.source ?? ""}`;
}

function displayPackage(pkg) {
  return `${pkg.name}@${pkg.version}`;
}

function parseTomlString(value, context) {
  if (!value.startsWith('"') || !value.endsWith('"')) {
    throw new Error(`${context}: expected a Cargo basic string`);
  }
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`${context}: invalid Cargo string (${error.message})`);
  }
}

/** Parse the scalar fields required from Cargo.lock without adding a TOML dependency. */
export function parseCargoLock(lockText) {
  const packages = [];
  let current = null;

  for (const [index, rawLine] of lockText.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (line === "[[package]]") {
      if (current) packages.push(current);
      current = {};
      continue;
    }
    if (!current) continue;
    const match = /^(name|version|source|checksum)\s*=\s*(.+)$/.exec(line);
    if (!match) continue;
    current[match[1]] = parseTomlString(match[2], `Cargo.lock:${index + 1}`);
  }
  if (current) packages.push(current);

  const result = new Map();
  for (const pkg of packages) {
    if (!pkg.name || !pkg.version) throw new Error("Cargo.lock contains an incomplete package");
    const key = packageKey(pkg);
    if (result.has(key)) throw new Error(`Cargo.lock contains duplicate ${displayPackage(pkg)}`);
    result.set(key, Object.freeze({ ...pkg }));
  }
  return result;
}

function tarString(buffer, start, length) {
  const end = buffer.indexOf(0, start);
  const boundedEnd = end === -1 || end > start + length ? start + length : end;
  return buffer.subarray(start, boundedEnd).toString("utf8");
}

/** Read regular files from a crates.io .crate archive using only Node built-ins. */
export function parseCrateArchive(archive) {
  let tar;
  try {
    tar = gunzipSync(archive);
  } catch (error) {
    throw new Error(`invalid gzip crate archive: ${error.message}`);
  }

  const entries = new Map();
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;

    const name = tarString(header, 0, 100);
    const prefix = tarString(header, 345, 155);
    const fullName = prefix ? `${prefix}/${name}` : name;
    const rawSize = tarString(header, 124, 12).trim();
    if (!/^[0-7]*$/.test(rawSize)) throw new Error(`invalid tar size for ${fullName}`);
    const size = Number.parseInt(rawSize || "0", 8);
    const type = String.fromCharCode(header[156] || 48);
    const dataStart = offset + 512;
    const dataEnd = dataStart + size;
    if (!Number.isSafeInteger(size) || dataEnd > tar.length) {
      throw new Error(`truncated tar entry ${fullName}`);
    }
    if (type === "0") {
      if (entries.has(fullName)) throw new Error(`duplicate tar entry ${fullName}`);
      entries.set(fullName, Buffer.from(tar.subarray(dataStart, dataEnd)));
    }
    offset = dataStart + Math.ceil(size / 512) * 512;
  }
  if (entries.size === 0) throw new Error("crate archive contains no regular files");
  return entries;
}

function isProcMacro(pkg) {
  return pkg.targets.some((target) => target.kind.includes("proc-macro"));
}

/** Find normal linked dependencies, stopping before build-time procedural macros. */
export function linkedRegistryClosure(metadata) {
  const packages = new Map(metadata.packages.map((pkg) => [pkg.id, pkg]));
  const nodes = new Map(metadata.resolve.nodes.map((node) => [node.id, node]));
  const root = metadata.packages.find((pkg) => pkg.name === ROOT_PACKAGE);
  if (!root) throw new Error(`cargo metadata is missing ${ROOT_PACKAGE}`);

  const queue = [root.id];
  const visited = new Set();
  const linked = [];
  while (queue.length > 0) {
    const id = queue.shift();
    if (visited.has(id)) continue;
    visited.add(id);
    const pkg = packages.get(id);
    if (!pkg) throw new Error(`cargo metadata resolve references unknown package ${id}`);
    if (isProcMacro(pkg)) continue;
    if (pkg.source) linked.push(pkg);

    const node = nodes.get(id);
    if (!node) throw new Error(`cargo metadata is missing the resolve node for ${id}`);
    for (const dependency of node.deps) {
      if (dependency.dep_kinds.some((kind) => kind.kind === null)) queue.push(dependency.pkg);
    }
  }
  return linked.sort((left, right) => compare(packageKey(left), packageKey(right)));
}

function archiveForPackage(pkg) {
  const sourceRoot = realpathSync(dirname(pkg.manifest_path));
  const crateDirectory = `${pkg.name}-${pkg.version}`;
  if (sourceRoot.split(/[\\/]/).at(-1) !== crateDirectory) {
    throw new Error(`${displayPackage(pkg)} has unexpected registry source ${sourceRoot}`);
  }
  const registryHash = sourceRoot.split(/[\\/]/).at(-2);
  const registrySrc = dirname(dirname(sourceRoot));
  if (registrySrc.split(/[\\/]/).at(-1) !== "src") {
    throw new Error(`${displayPackage(pkg)} is not in a Cargo registry source tree`);
  }
  const archive = join(dirname(registrySrc), "cache", registryHash, `${crateDirectory}.crate`);
  if (!existsSync(archive))
    throw new Error(`${displayPackage(pkg)} is missing cached archive ${archive}`);
  return archive;
}

function archiveFiles(pkg, checksum) {
  const archivePath = archiveForPackage(pkg);
  const archive = readFileSync(archivePath);
  const actualChecksum = sha256(archive);
  if (actualChecksum !== checksum) {
    throw new Error(
      `${displayPackage(pkg)} archive checksum ${actualChecksum} does not match Cargo.lock ${checksum}`,
    );
  }
  const prefix = `${pkg.name}-${pkg.version}/`;
  const stripped = new Map();
  for (const [path, content] of parseCrateArchive(archive)) {
    if (!path.startsWith(prefix)) {
      throw new Error(`${displayPackage(pkg)} archive entry is outside ${prefix}: ${path}`);
    }
    stripped.set(path.slice(prefix.length), content);
  }
  return stripped;
}

function available(files, candidates, pkg, license) {
  const path = candidates.find((candidate) => files.has(candidate));
  if (!path) {
    throw new Error(
      `${displayPackage(pkg)} is missing the source text for selected ${license}; tried ${candidates.join(", ")}`,
    );
  }
  return path;
}

function selectLicense(pkg, files) {
  const expression = pkg.license;
  if (!expression) throw new Error(`${displayPackage(pkg)} does not declare an SPDX license`);

  if (pkg.name === "ring") {
    const paths = [
      "LICENSE",
      "LICENSE-other-bits",
      "LICENSE-BoringSSL",
      "third_party/fiat/LICENSE",
      "src/polyfill/once_cell/LICENSE-APACHE",
      "src/polyfill/once_cell/LICENSE-MIT",
    ];
    for (const path of paths) {
      if (!files.has(path))
        throw new Error(`${displayPackage(pkg)} is missing required bundled notice ${path}`);
    }
    return { selected: "Apache-2.0 AND ISC + bundled Fiat/once_cell terms", paths };
  }

  let selected;
  let candidates;
  if (pkg.name === "memchr" || pkg.name === "simd-adler32" || pkg.name === "zmij") {
    selected = "MIT";
    candidates = ["LICENSE-MIT", "LICENSE-MIT.md", "LICENSE.md", "LICENSE"];
  } else if (expression === "Unicode-3.0") {
    selected = "Unicode-3.0";
    candidates = ["LICENSE", "LICENSE-UNICODE"];
  } else if (expression === "CDLA-Permissive-2.0") {
    selected = expression;
    candidates = ["LICENSE", "LICENSE-CDLA"];
  } else if (expression === "ISC") {
    selected = expression;
    candidates = ["LICENSE", "LICENSE.txt", "LICENSE-ISC"];
  } else if (expression === "BSD-3-Clause") {
    selected = expression;
    candidates = ["LICENSE", "LICENSE-BSD"];
  } else if (expression === "Zlib") {
    selected = expression;
    candidates = ["LICENSE", "LICENSE-ZLIB", "LICENSE-ZLIB.md"];
  } else if (expression.includes("Unicode-3.0") && expression.includes("Apache-2.0")) {
    selected = "Apache-2.0 AND Unicode-3.0";
    return {
      selected,
      paths: [
        available(files, ["LICENSE-APACHE", "LICENSE-APACHE.md"], pkg, "Apache-2.0"),
        available(files, ["LICENSE-UNICODE"], pkg, "Unicode-3.0"),
      ],
    };
  } else if (expression.includes("Apache-2.0")) {
    selected = "Apache-2.0";
    candidates = ["LICENSE-APACHE", "LICENSE-APACHE.md", "LICENSE"];
  } else {
    throw new Error(`${displayPackage(pkg)} has unsupported SPDX expression ${expression}`);
  }

  return { selected, paths: [available(files, candidates, pkg, selected)] };
}

function selectedSupplementalLicenses(files, selected) {
  const names = [];
  if (selected.includes("Apache-2.0")) names.push(/^LICENSE-APACHE(?:$|[-_.])/i);
  if (selected.includes("MIT")) names.push(/^LICENSE-MIT(?:$|[-_.])/i);
  if (selected.includes("Unicode-3.0")) names.push(/^LICENSE-UNICODE(?:$|[-_.])/i);
  return [...files.keys()]
    .filter(
      (path) => path.includes("/") && names.some((pattern) => pattern.test(path.split("/").at(-1))),
    )
    .sort(compare);
}

function noticeFiles(files) {
  return [...files.keys()]
    .filter((path) => /^(?:NOTICE|COPYRIGHT|COPYING)(?:$|[-_.])/i.test(path.split("/").at(-1)))
    .sort(compare);
}

function normalizedText(buffer, context) {
  let value;
  try {
    value = textDecoder.decode(buffer);
  } catch (error) {
    throw new Error(`${context} is not UTF-8 (${error.message})`);
  }
  return `${value.replaceAll("\r\n", "\n").replace(/\n*$/, "")}\n`;
}

function collectPackages(metadataByTarget) {
  const packages = new Map();
  for (const target of RELEASE_TARGETS) {
    const metadata = metadataByTarget.get(target);
    if (!metadata) throw new Error(`missing cargo metadata for ${target}`);
    for (const pkg of linkedRegistryClosure(metadata)) {
      if (!pkg.source.startsWith(REGISTRY_SOURCE_PREFIX)) {
        throw new Error(
          `${displayPackage(pkg)} uses unsupported non-registry source ${pkg.source}`,
        );
      }
      const key = packageKey(pkg);
      const existing = packages.get(key);
      if (existing) {
        existing.targets.add(target);
      } else {
        packages.set(key, { pkg, targets: new Set([target]) });
      }
    }
  }
  return [...packages.values()].sort((left, right) =>
    compare(packageKey(left.pkg), packageKey(right.pkg)),
  );
}

/** Render a payload from already locked, offline Cargo metadata for the four release targets. */
export function renderThirdPartyLicenses({ metadataByTarget, lockText, inputDigest }) {
  if (!/^[a-f0-9]{64}$/.test(inputDigest ?? "")) {
    throw new Error("license input digest must be a lowercase SHA-256");
  }
  const lockPackages = parseCargoLock(lockText);
  const dependencies = collectPackages(metadataByTarget);
  const texts = new Map();
  const inventory = [];

  for (const dependency of dependencies) {
    const { pkg } = dependency;
    const locked = lockPackages.get(packageKey(pkg));
    if (!locked) throw new Error(`${displayPackage(pkg)} is absent from Cargo.lock`);
    if (!locked.checksum || !/^[a-f0-9]{64}$/.test(locked.checksum)) {
      throw new Error(`${displayPackage(pkg)} has no valid Cargo.lock checksum`);
    }

    const files = archiveFiles(pkg, locked.checksum);
    const license = selectLicense(pkg, files);
    const paths = [
      ...new Set([
        ...license.paths,
        ...selectedSupplementalLicenses(files, license.selected),
        ...noticeFiles(files),
      ]),
    ].sort(compare);
    const payload = [];
    for (const path of paths) {
      const content = normalizedText(files.get(path), `${displayPackage(pkg)}:${path}`);
      const digest = sha256(content);
      const id = `TEXT-${digest.slice(0, 16)}`;
      const existing = texts.get(digest) ?? { id, content, uses: [] };
      existing.uses.push(`${displayPackage(pkg)}:${path}`);
      texts.set(digest, existing);
      payload.push({ id, path, digest });
    }
    inventory.push({
      package: displayPackage(pkg),
      checksum: locked.checksum,
      expression: pkg.license,
      selected: license.selected,
      targets: [...dependency.targets].sort(compare),
      payload,
    });
  }

  const uniqueNames = new Set(inventory.map((entry) => entry.package.replace(/@[^@]+$/, "")));
  const lines = [
    "@tc/moe-tab statically linked third-party licenses",
    "====================================================",
    "",
    "Generated by scripts/tab-third-party-licenses.mjs from locked, offline Cargo",
    "metadata. Build-time procedural macros and their dependency-only closure are",
    "excluded; normal registry dependencies linked into moe-tab-ffi are included.",
    "License bytes come directly from Cargo registry .crate archives whose SHA-256",
    "checksums are verified against packages/tab/Cargo.lock.",
    "",
    `Cargo.lock SHA-256: ${sha256(lockText)}`,
    `License inputs SHA-256: ${inputDigest}`,
    `Registry package instances: ${inventory.length} (${uniqueNames.size} unique names)`,
    "Release targets:",
    ...RELEASE_TARGETS.map((target) => `  - ${target}`),
    "",
    "DEPENDENCY INVENTORY",
    "--------------------",
  ];

  for (const entry of inventory) {
    lines.push(
      "",
      entry.package,
      `  Cargo checksum: ${entry.checksum}`,
      `  SPDX expression: ${entry.expression}`,
      `  Selected license: ${entry.selected}`,
      `  Targets: ${entry.targets.join(", ")}`,
      "  Included source texts:",
      ...entry.payload.map((item) => `    - ${item.id}  ${item.path}`),
    );
  }

  lines.push("", "LICENSE AND NOTICE TEXTS", "------------------------");
  for (const text of [...texts.values()].sort((left, right) => compare(left.id, right.id))) {
    lines.push(
      "",
      "================================================================================",
      `${text.id}  SHA-256 ${sha256(text.content)}`,
      "Used by:",
      ...text.uses.sort(compare).map((use) => `  - ${use}`),
      "--------------------------------------------------------------------------------",
      text.content.replace(/\n$/, ""),
    );
  }
  return `${lines.join("\n")}\n`;
}

function cargoMetadata({ cargo, manifestPath, target }) {
  const run = spawnSync(
    cargo,
    [
      "metadata",
      "--format-version",
      "1",
      "--locked",
      "--offline",
      "--manifest-path",
      manifestPath,
      "--filter-platform",
      target,
    ],
    {
      encoding: "utf8",
      env: { ...process.env, CARGO_NET_OFFLINE: "true" },
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  if (run.error) throw new Error(`could not run ${cargo}: ${run.error.message}`);
  if (run.status !== 0) {
    throw new Error(`cargo metadata failed for ${target}:\n${run.stderr.trim()}`);
  }
  try {
    return JSON.parse(run.stdout);
  } catch (error) {
    throw new Error(`cargo metadata returned invalid JSON for ${target}: ${error.message}`);
  }
}

export function generateThirdPartyLicenses({
  root = DEFAULT_ROOT,
  cargo = "cargo",
  manifest = DEFAULT_MANIFEST,
  output = DEFAULT_OUTPUT,
  check = false,
} = {}) {
  const absoluteRoot = resolve(root);
  const manifestPath = resolve(absoluteRoot, manifest);
  const lockPath = join(dirname(manifestPath), "Cargo.lock");
  const outputPath = resolve(absoluteRoot, output);
  const metadataByTarget = new Map(
    RELEASE_TARGETS.map((target) => [target, cargoMetadata({ cargo, manifestPath, target })]),
  );
  const rendered = renderThirdPartyLicenses({
    metadataByTarget,
    lockText: readFileSync(lockPath, "utf8"),
    inputDigest: licenseInputsDigest(absoluteRoot),
  });
  writeOrCheckPayload({ outputPath, rendered, check, root: absoluteRoot });
  return { outputPath, packageCount: collectPackages(metadataByTarget).length };
}

export function checkLicenseInputs({ root = DEFAULT_ROOT, output = DEFAULT_OUTPUT } = {}) {
  const absoluteRoot = resolve(root);
  const outputPath = resolve(absoluteRoot, output);
  if (!existsSync(outputPath)) throw new Error(`${relative(absoluteRoot, outputPath)} is missing`);
  const payload = readFileSync(outputPath, "utf8");
  const matches = [...payload.matchAll(/^License inputs SHA-256: ([a-f0-9]{64})$/gm)];
  if (matches.length !== 1) {
    throw new Error(
      `${relative(absoluteRoot, outputPath)} must contain exactly one license input digest`,
    );
  }
  const recorded = matches[0][1];
  const expected = licenseInputsDigest(absoluteRoot);
  if (recorded !== expected) {
    throw new Error(
      `${relative(absoluteRoot, outputPath)} input digest is stale; run the full generator and commit it`,
    );
  }
  return { outputPath, digest: expected };
}

export function writeOrCheckPayload({ outputPath, rendered, check, root = DEFAULT_ROOT }) {
  if (check) {
    if (!existsSync(outputPath)) throw new Error(`${relative(root, outputPath)} is missing`);
    if (readFileSync(outputPath, "utf8") !== rendered) {
      throw new Error(`${relative(root, outputPath)} is stale; regenerate and commit it`);
    }
    return;
  }
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, rendered);
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === "--check") {
      options.check = true;
      continue;
    }
    if (argument === "--check-inputs") {
      options.checkInputs = true;
      continue;
    }
    const key = {
      "--root": "root",
      "--cargo": "cargo",
      "--manifest": "manifest",
      "--output": "output",
    }[argument];
    if (!key || index + 1 >= argv.length) {
      throw new Error(
        "usage: tab-third-party-licenses.mjs [--check|--check-inputs] [--root DIR] [--cargo PATH] [--manifest PATH] [--output PATH]",
      );
    }
    options[key] = argv[++index];
  }
  return options;
}

export function main(argv) {
  try {
    const options = parseArguments(argv);
    if (options.check && options.checkInputs) {
      throw new Error("--check and --check-inputs are mutually exclusive");
    }
    if (options.checkInputs) {
      const result = checkLicenseInputs(options);
      console.log(`tab third-party licenses: inputs verified in ${result.outputPath}`);
      return 0;
    }
    const result = generateThirdPartyLicenses(options);
    console.log(
      `tab third-party licenses: ${result.packageCount} package instances ${
        argv.includes("--check") ? "verified" : "written"
      } in ${result.outputPath}`,
    );
    return 0;
  } catch (error) {
    console.error(`tab third-party licenses: ${error.message}`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
