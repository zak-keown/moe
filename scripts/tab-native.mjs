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

function asBuffer(bytes, label) {
  if (Buffer.isBuffer(bytes)) return bytes;
  if (bytes instanceof Uint8Array) return Buffer.from(bytes);
  throw new TabNativeError(`${label} must be binary data`);
}

export function inspectTabNativeBytes(bytes, target) {
  const data = asBuffer(bytes, `${target.id} payload`);
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
  return Object.freeze({ target: target.id, bytes: data.length, sha256: sha256(data) });
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
  if (manifest?.schema !== 1 || manifest?.provenance !== "apple-hardware") {
    throw new TabNativeError(
      "tracked Apple manifest must declare schema 1 and apple-hardware provenance",
    );
  }
  return { manifest, path };
}

function assertTrackedAppleFiles(root, paths, runCommand, env) {
  const relativePaths = paths.map((path) => relative(root, path));
  runChecked(
    runCommand,
    "git",
    ["-C", root, "ls-files", "--error-unmatch", "--", ...relativePaths],
    { env },
    "verify tracked Apple native payloads",
  );
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
    { cwd: join(root, TAB_PACKAGE_DIR), env: { ...env, MOE_TAB_LIB: path } },
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
  const env = secretFreeEnvironment(inputEnv);
  const { manifest: appleManifest, path: appleManifestPath } = readAppleManifest(root);
  const files = new Map();
  const trackedApplePaths = [appleManifestPath];

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
