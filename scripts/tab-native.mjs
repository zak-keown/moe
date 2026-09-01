#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createReleaseSubprocessEnvironment } from "./release-subprocess-environment.mjs";

export const TAB_NATIVE_TARGETS = Object.freeze([
  Object.freeze({
    id: "darwin-arm64",
    family: "darwin",
    arch: "arm64",
    rustTarget: "aarch64-apple-darwin",
    filename: "libmoe_tab_ffi.dylib",
    machine: 0x0100000c,
  }),
  Object.freeze({
    id: "darwin-x64",
    family: "darwin",
    arch: "x64",
    rustTarget: "x86_64-apple-darwin",
    filename: "libmoe_tab_ffi.dylib",
    machine: 0x01000007,
  }),
  Object.freeze({
    id: "linux-arm64",
    family: "linux",
    arch: "arm64",
    rustTarget: "aarch64-unknown-linux-gnu",
    filename: "libmoe_tab_ffi.so",
    machine: 183,
  }),
  Object.freeze({
    id: "linux-x64",
    family: "linux",
    arch: "x64",
    rustTarget: "x86_64-unknown-linux-gnu",
    filename: "libmoe_tab_ffi.so",
    machine: 62,
  }),
]);

export const TRACKED_APPLE_NATIVE_DIR = "packages/tab/native-release";
export const TAB_PACKAGE_DIR = "packages/tab/bindings/typescript";
export const TAB_DARWIN_INSTALL_NAME = "@rpath/libmoe_tab_ffi.dylib";
export const TAB_NATIVE_ABI_EXPORTS = Object.freeze([
  "moe_tab_version",
  "moe_tab_string_free",
  "moe_tab_estimate_path",
  "moe_tab_refresh_pricing",
]);
const FORBIDDEN_DARWIN_PATHS = Object.freeze([
  "/Users/",
  "/private/tmp/",
  "/tmp/",
  "/var/folders/",
  ".cargo/registry/",
]);
export const TAB_LEGAL_PAYLOAD_FILES = Object.freeze([
  Object.freeze({ source: "LICENSE", name: "LICENSE" }),
  Object.freeze({ source: "NOTICE", name: "NOTICE" }),
  Object.freeze({
    source: `${TRACKED_APPLE_NATIVE_DIR}/THIRD_PARTY_LICENSES.txt`,
    name: "THIRD_PARTY_LICENSES.txt",
  }),
]);

export class TabNativeError extends Error {
  constructor(message) {
    super(message);
    this.name = "TabNativeError";
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function commandRunner(command, args, options) {
  return spawnSync(command, args, { encoding: "utf8", ...options });
}

function runChecked(runCommand, command, args, options, label) {
  const result = runCommand(command, args, options);
  if (result?.error) throw new TabNativeError(`${label} could not start: ${result.error.message}`);
  if (result?.status !== 0) {
    const detail = String(result?.stderr ?? "").trim();
    throw new TabNativeError(
      `${label} failed with exit status ${result?.status ?? "unknown"}${detail ? `: ${detail}` : ""}`,
    );
  }
  return result;
}

function asBuffer(bytes, label) {
  if (Buffer.isBuffer(bytes)) return bytes;
  if (bytes instanceof Uint8Array) return Buffer.from(bytes);
  throw new TabNativeError(`${label} must be binary data`);
}

export function inspectTabNativeBytes(bytes, target) {
  const data = asBuffer(bytes, `${target.id} payload`);
  let darwin;
  if (target.family === "darwin") {
    if (data.length < 16 || data.readUInt32LE(0) !== 0xfeedfacf) {
      throw new TabNativeError(`${target.id} is not a thin little-endian 64-bit Mach-O file`);
    }
    if (data.readUInt32LE(4) !== target.machine) {
      throw new TabNativeError(`${target.id} Mach-O CPU does not match ${target.arch}`);
    }
    if (data.readUInt32LE(12) !== 6) {
      throw new TabNativeError(`${target.id} Mach-O payload is not a dynamic library`);
    }
    darwin = inspectDarwinReleaseBytes(data, target);
  } else {
    if (
      data.length < 20 ||
      data[0] !== 0x7f ||
      data[1] !== 0x45 ||
      data[2] !== 0x4c ||
      data[3] !== 0x46 ||
      data[4] !== 2 ||
      data[5] !== 1
    ) {
      throw new TabNativeError(`${target.id} is not a little-endian ELF64 file`);
    }
    if (data.readUInt16LE(16) !== 3) {
      throw new TabNativeError(`${target.id} ELF payload is not a shared object`);
    }
    if (data.readUInt16LE(18) !== target.machine) {
      throw new TabNativeError(`${target.id} ELF machine does not match ${target.arch}`);
    }
  }
  return Object.freeze({ target: target.id, bytes: data.length, sha256: sha256(data), ...darwin });
}

function readMachOCString(data, start, end, label) {
  if (start < 0 || start >= end || end > data.length) {
    throw new TabNativeError(`${label} has an invalid Mach-O string offset`);
  }
  const nul = data.indexOf(0, start);
  if (nul === -1 || nul >= end) throw new TabNativeError(`${label} is not NUL-terminated`);
  return data.subarray(start, nul).toString("utf8");
}

function inspectDarwinReleaseBytes(data, target) {
  if (data.length < 32) throw new TabNativeError(`${target.id} has a truncated Mach-O header`);
  const commandCount = data.readUInt32LE(16);
  const commandBytes = data.readUInt32LE(20);
  const commandEnd = 32 + commandBytes;
  if (commandEnd > data.length) {
    throw new TabNativeError(`${target.id} has truncated Mach-O load commands`);
  }

  const installNames = [];
  let offset = 32;
  for (let index = 0; index < commandCount; index += 1) {
    if (offset + 8 > commandEnd) {
      throw new TabNativeError(`${target.id} has a truncated Mach-O load command`);
    }
    const command = data.readUInt32LE(offset);
    const size = data.readUInt32LE(offset + 4);
    if (size < 8 || offset + size > commandEnd) {
      throw new TabNativeError(`${target.id} has an invalid Mach-O load command size`);
    }
    if (command === 0x0d) {
      if (size < 24) throw new TabNativeError(`${target.id} has a truncated LC_ID_DYLIB command`);
      const nameOffset = data.readUInt32LE(offset + 8);
      installNames.push(
        readMachOCString(data, offset + nameOffset, offset + size, `${target.id} LC_ID_DYLIB`),
      );
    }
    offset += size;
  }
  if (offset !== commandEnd) {
    throw new TabNativeError(`${target.id} Mach-O load command table is inconsistent`);
  }
  if (installNames.length !== 1 || installNames[0] !== TAB_DARWIN_INSTALL_NAME) {
    throw new TabNativeError(
      `${target.id} must use exactly one relocatable LC_ID_DYLIB ${TAB_DARWIN_INSTALL_NAME}`,
    );
  }

  for (const forbidden of FORBIDDEN_DARWIN_PATHS) {
    if (data.includes(Buffer.from(forbidden))) {
      throw new TabNativeError(`${target.id} embeds forbidden build path ${forbidden}`);
    }
  }
  for (const symbol of TAB_NATIVE_ABI_EXPORTS) {
    if (!data.includes(Buffer.from(`_${symbol}\0`))) {
      throw new TabNativeError(`${target.id} is missing C ABI export ${symbol}`);
    }
  }
  return Object.freeze({ installName: installNames[0], exports: TAB_NATIVE_ABI_EXPORTS });
}

export function inspectTabNativeFile(path, target) {
  if (!existsSync(path) || !statSync(path).isFile()) {
    throw new TabNativeError(`${target.id} native payload is missing: ${path}`);
  }
  return inspectTabNativeBytes(readFileSync(path), target);
}

function readAppleManifest(root) {
  const path = join(root, TRACKED_APPLE_NATIVE_DIR, "manifest.json");
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new TabNativeError(`tracked Apple manifest is unreadable: ${error.message}`);
  }
  if (manifest?.schema !== 2 || manifest?.provenance !== "apple-hardware") {
    throw new TabNativeError(
      "tracked Apple manifest must declare schema 2 and apple-hardware provenance",
    );
  }
  const sha1 = /^[a-f0-9]{40}$/;
  const sha256Pattern = /^[a-f0-9]{64}$/;
  if (
    !sha1.test(manifest.source?.commit ?? "") ||
    !sha1.test(manifest.source?.cratesTree ?? "") ||
    !sha256Pattern.test(manifest.source?.cargoManifestSha256 ?? "") ||
    !sha256Pattern.test(manifest.source?.cargoLockSha256 ?? "") ||
    typeof manifest.builder?.rustc?.version !== "string" ||
    !sha1.test(manifest.builder?.rustc?.commit ?? "") ||
    typeof manifest.builder?.cargo?.version !== "string" ||
    !sha1.test(manifest.builder?.cargo?.commit ?? "") ||
    typeof manifest.builder?.apple?.sdk !== "string" ||
    typeof manifest.builder?.apple?.clang !== "string" ||
    typeof manifest.builder?.apple?.linker !== "string" ||
    manifest.build?.profile !== "release" ||
    manifest.build?.locked !== true ||
    manifest.build?.cargoIncremental !== false ||
    manifest.build?.installName !== TAB_DARWIN_INSTALL_NAME ||
    !Array.isArray(manifest.build?.rustFlags) ||
    !manifest.build.rustFlags.some((flag) =>
      flag.includes("--remap-path-prefix=<repository-root>"),
    ) ||
    !manifest.build.rustFlags.some((flag) => flag.includes("--remap-path-prefix=<cargo-home>")) ||
    !manifest.build.rustFlags.some((flag) => flag.includes("--remap-path-prefix=<build-root>")) ||
    !Array.isArray(manifest.build?.postLink) ||
    !manifest.build.postLink.includes(
      "install_name_tool -id @rpath/libmoe_tab_ffi.dylib <artifact>",
    ) ||
    !manifest.build.postLink.includes("strip -x <artifact>")
  ) {
    throw new TabNativeError("tracked Apple manifest has incomplete source or build provenance");
  }
  return { manifest, path };
}

function gitOutput(runCommand, root, args, env, label) {
  return String(
    runChecked(runCommand, "git", ["-C", root, ...args], { env }, label).stdout ?? "",
  ).trim();
}

function assertTrackedAppleFiles(root, paths, runCommand, env) {
  const relativePaths = paths.map((path) => relative(root, path));
  const stageLines = gitOutput(
    runCommand,
    root,
    ["ls-files", "--stage", "--", ...relativePaths],
    env,
    "read tracked Apple index entries",
  );
  const indexed = new Map();
  for (const line of stageLines.split("\n")) {
    const match = /^(100644) ([a-f0-9]{40}|[a-f0-9]{64}) 0\t(.+)$/.exec(line);
    if (!match || indexed.has(match[3])) {
      throw new TabNativeError("tracked Apple inputs must be unique regular index blobs");
    }
    indexed.set(match[3], match[2]);
  }
  if (indexed.size !== relativePaths.length || relativePaths.some((path) => !indexed.has(path))) {
    throw new TabNativeError("tracked Apple inputs are missing from the Git index");
  }

  const workingHashes = gitOutput(
    runCommand,
    root,
    ["hash-object", "--no-filters", "--", ...relativePaths],
    env,
    "hash tracked Apple working bytes",
  ).split("\n");
  if (
    workingHashes.length !== relativePaths.length ||
    relativePaths.some((path, index) => workingHashes[index] !== indexed.get(path))
  ) {
    throw new TabNativeError("tracked Apple working bytes do not equal their Git index blobs");
  }
}

function assertAppleSourceProvenance(root, manifest, runCommand, env) {
  const cratesTree = gitOutput(
    runCommand,
    root,
    ["rev-parse", `${manifest.source.commit}:packages/tab/crates`],
    env,
    "resolve tracked Apple source commit",
  );
  if (cratesTree !== manifest.source.cratesTree) {
    throw new TabNativeError("tracked Apple source commit does not match its crates tree");
  }
  for (const [path, recorded] of [
    ["packages/tab/Cargo.toml", manifest.source.cargoManifestSha256],
    ["packages/tab/Cargo.lock", manifest.source.cargoLockSha256],
  ]) {
    const content = runChecked(
      runCommand,
      "git",
      ["-C", root, "show", `${manifest.source.commit}:${path}`],
      { env, encoding: null },
      `read ${path} at tracked Apple source commit`,
    ).stdout;
    if (sha256(asBuffer(content, path)) !== recorded) {
      throw new TabNativeError(`tracked Apple source commit does not match ${path}`);
    }
  }
}

function assertLicenseProvenance(root, manifest) {
  const record = manifest.licenses;
  if (
    record?.path !== "THIRD_PARTY_LICENSES.txt" ||
    !/^[a-f0-9]{64}$/.test(record?.inputSha256 ?? "") ||
    !/^[a-f0-9]{64}$/.test(record?.payloadSha256 ?? "")
  ) {
    throw new TabNativeError("tracked Apple manifest has incomplete license provenance");
  }
  const path = join(root, TRACKED_APPLE_NATIVE_DIR, record.path);
  const payload = readFileSync(path);
  if (sha256(payload) !== record.payloadSha256) {
    throw new TabNativeError("tracked tab third-party license payload does not match its manifest");
  }
  const inputMatches = [
    ...payload.toString("utf8").matchAll(/^License inputs SHA-256: ([a-f0-9]{64})$/gm),
  ];
  if (inputMatches.length !== 1 || inputMatches[0][1] !== record.inputSha256) {
    throw new TabNativeError(
      "tracked tab third-party license input digest does not match its manifest",
    );
  }
}

function sourcePath(root, linuxDir, target) {
  const base = target.family === "darwin" ? join(root, TRACKED_APPLE_NATIVE_DIR) : linuxDir;
  return join(base, target.id, target.filename);
}

function hostTarget() {
  return TAB_NATIVE_TARGETS.find(
    (target) => target.family === process.platform && target.arch === process.arch,
  );
}

function executableVersion({ root, path, target, runCommand, env }) {
  const binding = pathToFileURL(join(root, TAB_PACKAGE_DIR, "dist/index.js")).href;
  const program = [
    `const tab = await import(${JSON.stringify(binding)});`,
    'process.stdout.write((await tab.version()) + "\\n");',
  ].join("\n");
  const result = runChecked(
    runCommand,
    process.execPath,
    ["--input-type=module", "--eval", program],
    {
      cwd: join(root, TAB_PACKAGE_DIR),
      env: createReleaseSubprocessEnvironment(env, { MOE_TAB_LIB: path }),
    },
    `execute ${target.id} native payload`,
  );
  return String(result.stdout).trim();
}

export function validateTabNativeMatrix({
  root: rootInput = ".",
  linuxDir: linuxDirInput = ".tc-tab-native",
  releaseVersion,
  runCommand = commandRunner,
  env: inputEnv = process.env,
  requireTrackedApple = true,
  executeHost = true,
}) {
  if (typeof releaseVersion !== "string" || releaseVersion.length === 0) {
    throw new TabNativeError("releaseVersion is required");
  }
  const root = resolve(rootInput);
  const linuxDir = isAbsolute(linuxDirInput) ? linuxDirInput : resolve(root, linuxDirInput);
  const env = createReleaseSubprocessEnvironment(inputEnv);
  const { manifest: appleManifest, path: appleManifestPath } = readAppleManifest(root);
  const files = new Map();
  assertLicenseProvenance(root, appleManifest);
  const trackedApplePaths = [
    appleManifestPath,
    join(root, TRACKED_APPLE_NATIVE_DIR, appleManifest.licenses.path),
  ];

  for (const target of TAB_NATIVE_TARGETS) {
    const path = sourcePath(root, linuxDir, target);
    const inspection = inspectTabNativeFile(path, target);
    if (target.family === "darwin") {
      trackedApplePaths.push(path);
      const recorded = appleManifest.artifacts?.[target.id];
      if (
        recorded?.path !== `${target.id}/${target.filename}` ||
        recorded?.rustTarget !== target.rustTarget ||
        recorded?.version !== releaseVersion ||
        recorded?.bytes !== inspection.bytes ||
        inspection.installName !== appleManifest.build.installName ||
        recorded?.sha256 !== inspection.sha256
      ) {
        throw new TabNativeError(
          `${target.id} does not match its tracked Apple manifest for ${releaseVersion}`,
        );
      }
    }
    files.set(target.id, Object.freeze({ ...inspection, path, target }));
  }

  if (requireTrackedApple) {
    assertTrackedAppleFiles(root, trackedApplePaths, runCommand, env);
    assertAppleSourceProvenance(root, appleManifest, runCommand, env);
  }

  let executed;
  const current = hostTarget();
  if (executeHost && current) {
    const file = files.get(current.id);
    const reportedVersion = executableVersion({
      root,
      path: file.path,
      target: current,
      runCommand,
      env,
    });
    if (reportedVersion !== releaseVersion) {
      throw new TabNativeError(
        `${current.id} reports ${JSON.stringify(reportedVersion)}; expected ${releaseVersion}`,
      );
    }
    executed = Object.freeze({ target: current.id, version: reportedVersion });
  }

  return Object.freeze({ root, linuxDir, releaseVersion, files, executed });
}

function copyDirectory(source, destination) {
  if (!existsSync(source) || !statSync(source).isDirectory()) {
    throw new TabNativeError(`required package directory is missing: ${source}`);
  }
  cpSync(source, destination, { recursive: true, dereference: false, preserveTimestamps: false });
}

export function stageTabNpmPackage({ root: rootInput = ".", destination, matrix }) {
  const root = resolve(rootInput);
  if (!destination) throw new TabNativeError("destination is required");
  const output = isAbsolute(destination) ? destination : resolve(root, destination);
  if (existsSync(output) && readdirSync(output).length > 0) {
    throw new TabNativeError(`tab package staging directory must be empty: ${output}`);
  }
  if (matrix?.root !== root) throw new TabNativeError("native matrix belongs to a different root");

  const packageRoot = join(root, TAB_PACKAGE_DIR);
  mkdirSync(output, { recursive: true });
  for (const file of ["package.json", "README.md"]) {
    copyFileSync(join(packageRoot, file), join(output, file));
  }
  copyDirectory(join(packageRoot, "dist"), join(output, "dist"));
  for (const legal of TAB_LEGAL_PAYLOAD_FILES) {
    const source = join(root, legal.source);
    if (!existsSync(source)) {
      throw new TabNativeError(`required legal payload is missing: ${source}`);
    }
    copyFileSync(source, join(output, legal.name));
  }
  for (const target of TAB_NATIVE_TARGETS) {
    const source = matrix.files.get(target.id)?.path;
    const targetDirectory = join(output, "native", target.id);
    mkdirSync(targetDirectory, { recursive: true });
    const destination = join(targetDirectory, target.filename);
    copyFileSync(source, destination);
    chmodSync(destination, 0o644);
  }
  return output;
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = { command };
  for (let index = 0; index < rest.length; index += 2) {
    const name = rest[index];
    const value = rest[index + 1];
    if (!name?.startsWith("--") || value === undefined) {
      throw new TabNativeError(`invalid argument: ${name ?? "<missing>"}`);
    }
    options[name.slice(2)] = value;
  }
  return options;
}

export function main(argv, runtime = {}) {
  const stdout = runtime.stdout ?? process.stdout;
  const stderr = runtime.stderr ?? process.stderr;
  try {
    const options = parseArgs(argv);
    if (!["validate", "stage"].includes(options.command)) {
      throw new TabNativeError(
        "usage: tab-native.mjs <validate|stage> --version <version> [--root <path>] [--linux-dir <path>] [--output <path>]",
      );
    }
    const matrix = validateTabNativeMatrix({
      root: options.root,
      linuxDir: options["linux-dir"],
      releaseVersion: options.version,
      runCommand: runtime.runCommand,
      env: runtime.env,
    });
    if (options.command === "stage") {
      stageTabNpmPackage({ root: matrix.root, destination: options.output, matrix });
    }
    stdout.write(
      `${options.command === "stage" ? "staged" : "validated"} ${matrix.files.size} tab native payloads for ${matrix.releaseVersion}${matrix.executed ? `; ${matrix.executed.target} reported ${matrix.executed.version}` : ""}\n`,
    );
    return 0;
  } catch (error) {
    stderr.write(`tab-native: ${error.message}\n`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
