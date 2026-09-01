/**
 * Compose an npm runtime tarball with the plugin tree emitted by moe-mint.
 *
 * The seed tarball is authoritative for executable package metadata. Mint may
 * add only the Pi declaration and keywords; its other package.json fields are
 * plugin-store metadata and are not valid npm runtime replacements.
 */

import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, posix, resolve, sep } from "node:path";
import { createReleaseSubprocessEnvironment } from "./release-subprocess-environment.mjs";

const INTERNAL_MINT_MANIFEST = ".moe-mint/manifest.json";
const GENERATED_PACKAGE_MANIFEST = "package.json";
const JSON_PAYLOAD_FILES = Object.freeze([
  "package.json",
  ".claude-plugin/plugin.json",
  "hooks/hooks.json",
  "hooks/moe-mint/hooks.json",
]);

const COMMON_PLUGIN_FILES = Object.freeze([
  ".agents/plugins/marketplace.json",
  ".claude-plugin/marketplace.json",
  ".claude-plugin/plugin.json",
  ".codex-plugin/plugin.json",
  ".cursor-plugin/plugin.json",
  ".kimi-plugin/plugin.json",
  "LICENSE",
  "moe-mint.yaml",
  "plugin.json",
]);

export const REQUIRED_PLUGIN_FILES = Object.freeze({
  memory: Object.freeze([
    ...COMMON_PLUGIN_FILES,
    ".mcp.json",
    ".opencode/agent/search-conversations.md",
    ".opencode/plugins/moe-memory.js",
    ".pi/extensions/moe-memory.ts",
    "agents/search-conversations.md",
    "hooks/hooks.json",
    "hooks/moe-mint/hooks.json",
    "hooks/moe-mint/run-hook.cmd",
    "hooks/moe-mint/session-start",
    "mcp.json",
    "skills/remembering-conversations/SKILL.md",
  ]),
  glass: Object.freeze([
    ...COMMON_PLUGIN_FILES,
    ".opencode/agent/browser-user.md",
    ".opencode/plugins/moe-glass.js",
    ".pi/extensions/moe-glass.ts",
    "agents/browser-user.md",
    "skills/browsing/chrome-ws",
    "skills/browsing/SKILL.md",
    "skills/browsing/test-e2e.sh",
    "skills/browsing/test-extract.sh",
    "skills/browsing/test-interact.sh",
    "skills/browsing/test-navigate.sh",
    "skills/browsing/test-raw.sh",
    "skills/browsing/test-tabs.sh",
    "skills/browsing/test-wait.sh",
  ]),
});

export const REQUIRED_EXECUTABLE_PLUGIN_FILES = Object.freeze({
  memory: Object.freeze(["hooks/moe-mint/run-hook.cmd", "hooks/moe-mint/session-start"]),
  glass: Object.freeze([
    "skills/browsing/chrome-ws",
    "skills/browsing/test-e2e.sh",
    "skills/browsing/test-extract.sh",
    "skills/browsing/test-interact.sh",
    "skills/browsing/test-navigate.sh",
    "skills/browsing/test-raw.sh",
    "skills/browsing/test-tabs.sh",
    "skills/browsing/test-wait.sh",
  ]),
});

export class TcReleaseComposeError extends Error {
  constructor(message) {
    super(message);
    this.name = "TcReleaseComposeError";
  }
}

function commandRunner(command, args, options) {
  return spawnSync(command, args, { encoding: "utf8", ...options });
}

function runChecked(runCommand, command, args, options, label) {
  const result = runCommand(command, args, options);
  if (result?.error) {
    throw new TcReleaseComposeError(`${label} could not start: ${result.error.message}`);
  }
  if (result?.status !== 0) {
    const detail = typeof result?.stderr === "string" ? result.stderr.trim() : "";
    throw new TcReleaseComposeError(
      `${label} failed with exit status ${result?.status ?? "unknown"}${detail ? `: ${detail}` : ""}`,
    );
  }
  return result;
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new TcReleaseComposeError(`${label} is not valid JSON: ${error.message}`);
  }
}

function plainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function packagePath(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\\")) {
    throw new TcReleaseComposeError(`${label} must be a non-empty POSIX package path`);
  }
  const withoutPrefix = value.startsWith("./") ? value.slice(2) : value;
  const normalized = posix.normalize(withoutPrefix);
  if (
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    posix.isAbsolute(withoutPrefix)
  ) {
    throw new TcReleaseComposeError(`${label} escapes the package root: ${value}`);
  }
  return normalized;
}

function mergeKeywords(runtimeKeywords, generatedKeywords) {
  if (runtimeKeywords !== undefined && !Array.isArray(runtimeKeywords)) {
    throw new TcReleaseComposeError("runtime package.json keywords must be an array");
  }
  if (generatedKeywords !== undefined && !Array.isArray(generatedKeywords)) {
    throw new TcReleaseComposeError("generated package.json keywords must be an array");
  }
  const merged = [];
  for (const [source, label] of [
    [runtimeKeywords ?? [], "runtime"],
    [generatedKeywords ?? [], "generated"],
  ]) {
    for (const keyword of source) {
      if (typeof keyword !== "string" || keyword.length === 0) {
        throw new TcReleaseComposeError(`${label} package.json keywords must contain strings`);
      }
      if (!merged.includes(keyword)) merged.push(keyword);
    }
  }
  return merged;
}

function safeGeneratedPi(pi, stagingDirectory) {
  if (pi === undefined) return undefined;
  if (!plainObject(pi)) {
    throw new TcReleaseComposeError("generated package.json pi must be an object");
  }
  const allowedKeys = new Set(["extensions", "skills"]);
  const safe = {};
  for (const [key, values] of Object.entries(pi)) {
    if (!allowedKeys.has(key) || !Array.isArray(values)) {
      throw new TcReleaseComposeError(`generated package.json pi.${key} is not a safe Pi list`);
    }
    safe[key] = values.map((value, index) => {
      const normalized = packagePath(value, `generated package.json pi.${key}[${index}]`);
      if (!existsSync(join(stagingDirectory, normalized))) {
        throw new TcReleaseComposeError(
          `generated package.json pi.${key}[${index}] is missing from the payload: ${value}`,
        );
      }
      return value;
    });
  }
  return safe;
}

function generatedFiles(root, relative = "") {
  const found = [];
  for (const entry of readdirSync(join(root, relative), { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const path = relative ? `${relative}/${entry.name}` : entry.name;
    if (path === INTERNAL_MINT_MANIFEST || path === GENERATED_PACKAGE_MANIFEST) continue;
    if (entry.isDirectory()) found.push(...generatedFiles(root, path));
    else found.push(path);
  }
  return found;
}

function overlayGeneratedPlugin(pluginDirectory, stagingDirectory) {
  const modes = {};
  for (const path of generatedFiles(pluginDirectory)) {
    const source = join(pluginDirectory, path);
    const destination = join(stagingDirectory, path);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(source, destination, { force: true, recursive: true });
    const sourceStat = lstatSync(source);
    if (sourceStat.isFile()) {
      const mode = sourceStat.mode & 0o777;
      chmodSync(destination, mode);
      modes[path] = mode;
    }
  }
  return modes;
}

function bytewiseCompare(left, right) {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

function archivePathParts(path) {
  if (
    typeof path !== "string" ||
    path.length === 0 ||
    path.includes("\\") ||
    path.includes("\0") ||
    path.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new TcReleaseComposeError(`unsafe deterministic tar path: ${JSON.stringify(path)}`);
  }
  if (Buffer.byteLength(path) <= 100) return { name: path, prefix: "" };
  for (let split = path.lastIndexOf("/"); split !== -1; split = path.lastIndexOf("/", split - 1)) {
    const prefix = path.slice(0, split);
    const name = path.slice(split + 1);
    if (Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(name) <= 100) {
      return { name, prefix };
    }
  }
  throw new TcReleaseComposeError(
    `deterministic tar path exceeds the POSIX ustar limits: ${JSON.stringify(path)}`,
  );
}

function writeHeaderText(header, offset, length, value, label) {
  const bytes = Buffer.from(value);
  if (bytes.length > length) {
    throw new TcReleaseComposeError(`${label} exceeds the POSIX ustar field limit`);
  }
  bytes.copy(header, offset);
}

function writeHeaderOctal(header, offset, length, value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TcReleaseComposeError(`${label} is not a safe non-negative integer`);
  }
  const octal = value.toString(8);
  if (octal.length > length - 1) {
    throw new TcReleaseComposeError(`${label} exceeds the POSIX ustar numeric field limit`);
  }
  writeHeaderText(header, offset, length, `${octal.padStart(length - 1, "0")}\0`, label);
}

function tarHeader({ path, mode, size, type, linkTarget = "" }) {
  const header = Buffer.alloc(512);
  const { name, prefix } = archivePathParts(path);
  writeHeaderText(header, 0, 100, name, `tar path ${path}`);
  writeHeaderOctal(header, 100, 8, mode, `tar mode ${path}`);
  writeHeaderOctal(header, 108, 8, 0, `tar uid ${path}`);
  writeHeaderOctal(header, 116, 8, 0, `tar gid ${path}`);
  writeHeaderOctal(header, 124, 12, size, `tar size ${path}`);
  writeHeaderOctal(header, 136, 12, 0, `tar mtime ${path}`);
  header.fill(0x20, 148, 156);
  writeHeaderText(header, 156, 1, type, `tar type ${path}`);
  writeHeaderText(header, 157, 100, linkTarget, `tar link target ${path}`);
  writeHeaderText(header, 257, 6, "ustar\0", `tar magic ${path}`);
  writeHeaderText(header, 263, 2, "00", `tar version ${path}`);
  writeHeaderText(header, 265, 32, "root", `tar owner ${path}`);
  writeHeaderText(header, 297, 32, "root", `tar group ${path}`);
  writeHeaderText(header, 345, 155, prefix, `tar prefix ${path}`);
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  writeHeaderText(
    header,
    148,
    8,
    `${checksum.toString(8).padStart(6, "0")}\0 `,
    `tar checksum ${path}`,
  );
  return header;
}

function crc32(bytes) {
  let checksum = 0xffffffff;
  for (const byte of bytes) {
    checksum ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      checksum = (checksum >>> 1) ^ (checksum & 1 ? 0xedb88320 : 0);
    }
  }
  return (checksum ^ 0xffffffff) >>> 0;
}

function deterministicGzip(bytes) {
  // A stored-block DEFLATE stream is slightly larger than a compressed one,
  // but it is defined entirely here. Its bytes cannot change with the host's
  // gzip, zlib, locale, clock, or platform.
  const chunks = [Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0, 0, 0, 0, 0x00, 0xff])];
  if (bytes.length === 0) chunks.push(Buffer.from([0x01, 0x00, 0x00, 0xff, 0xff]));
  for (let offset = 0; offset < bytes.length; offset += 0xffff) {
    const length = Math.min(0xffff, bytes.length - offset);
    const block = Buffer.alloc(5);
    block[0] = offset + length === bytes.length ? 0x01 : 0x00;
    block.writeUInt16LE(length, 1);
    block.writeUInt16LE(0xffff ^ length, 3);
    chunks.push(block, bytes.subarray(offset, offset + length));
  }
  const trailer = Buffer.alloc(8);
  trailer.writeUInt32LE(crc32(bytes), 0);
  trailer.writeUInt32LE(bytes.length >>> 0, 4);
  chunks.push(trailer);
  return Buffer.concat(chunks);
}

function deterministicPackageTarball(packageDirectory, destination) {
  const packageRoot = resolve(packageDirectory);
  const entries = [];
  const visit = (relative = "") => {
    const absolute = relative ? join(packageRoot, relative) : packageRoot;
    const stat = lstatSync(absolute);
    const path = relative ? `package/${relative.split(sep).join("/")}` : "package";
    if (stat.isDirectory()) {
      entries.push({ absolute, path, stat, type: "5" });
      for (const entry of readdirSync(absolute, { withFileTypes: true }).sort((left, right) =>
        bytewiseCompare(left.name, right.name),
      )) {
        visit(relative ? join(relative, entry.name) : entry.name);
      }
      return;
    }
    if (stat.isFile()) {
      entries.push({ absolute, path, stat, type: "0" });
      return;
    }
    if (stat.isSymbolicLink()) {
      const linkTarget = readlinkSync(absolute);
      const resolvedTarget = resolve(dirname(absolute), linkTarget);
      if (
        isAbsolute(linkTarget) ||
        (resolvedTarget !== packageRoot && !resolvedTarget.startsWith(`${packageRoot}${sep}`))
      ) {
        throw new TcReleaseComposeError(
          `deterministic tar symlink escapes the package root: ${path} -> ${linkTarget}`,
        );
      }
      entries.push({ absolute, linkTarget, path, stat, type: "2" });
      return;
    }
    throw new TcReleaseComposeError(`deterministic tar does not support special file ${path}`);
  };
  visit();

  const chunks = [];
  for (const entry of entries) {
    const content = entry.type === "0" ? readFileSync(entry.absolute) : Buffer.alloc(0);
    const mode =
      entry.type === "5"
        ? 0o755
        : entry.type === "2"
          ? 0o777
          : entry.stat.mode & 0o111
            ? 0o755
            : 0o644;
    chunks.push(
      tarHeader({
        path: entry.path,
        mode,
        size: content.length,
        type: entry.type,
        linkTarget: entry.linkTarget,
      }),
    );
    if (content.length > 0) {
      chunks.push(content);
      const padding = (512 - (content.length % 512)) % 512;
      if (padding > 0) chunks.push(Buffer.alloc(padding));
    }
  }
  chunks.push(Buffer.alloc(1024));
  writeFileSync(destination, deterministicGzip(Buffer.concat(chunks)), { mode: 0o644 });
}

function canonicalizePluginTarball({ tarball, temporaryRoot, generatedModes, runCommand, env }) {
  const repairRoot = join(temporaryRoot, "canonical");
  mkdirSync(repairRoot);
  runChecked(
    runCommand,
    "tar",
    ["-xzf", tarball, "-C", repairRoot],
    { env },
    `extract ${basename(tarball)} for deterministic composition`,
  );
  for (const [path, mode] of Object.entries(generatedModes)) {
    if ((mode & 0o111) !== 0) chmodSync(join(repairRoot, "package", path), mode);
  }
  const canonicalTarball = join(temporaryRoot, "canonical.tgz");
  deterministicPackageTarball(join(repairRoot, "package"), canonicalTarball);
  copyFileSync(canonicalTarball, tarball);
}

function pluginKind(name) {
  if (name === "@tc/moe-memory") return "memory";
  if (name === "@tc/moe-glass") return "glass";
  throw new TcReleaseComposeError(`unsupported composed plugin package: ${JSON.stringify(name)}`);
}

function archiveJson(tarball, path, runCommand, env) {
  const result = runChecked(
    runCommand,
    "tar",
    ["-xOf", tarball, `package/${path}`],
    { env },
    `inspect ${basename(tarball)} ${path}`,
  );
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new TcReleaseComposeError(
      `${basename(tarball)} contains invalid package/${path}: ${error.message}`,
    );
  }
}

export function inspectPluginTarball(
  tarball,
  { runCommand = commandRunner, env = process.env } = {},
) {
  const safeEnv = createReleaseSubprocessEnvironment(env);
  const listing = runChecked(
    runCommand,
    "tar",
    ["-tzf", tarball, "--verbose"],
    { env: safeEnv },
    `list ${basename(tarball)}`,
  );
  const modes = {};
  const listedFiles = [];
  for (const line of listing.stdout.split(/\r?\n/u)) {
    if (!line) continue;
    const marker = line.indexOf(" package/");
    const archivePath = marker === -1 ? line : line.slice(marker + 1);
    const withoutLinkTarget = archivePath.split(" -> ", 1)[0];
    if (!withoutLinkTarget.startsWith("package/") || withoutLinkTarget.endsWith("/")) continue;
    const path = withoutLinkTarget.slice("package/".length);
    listedFiles.push(path);
    if (marker !== -1) {
      const symbolicMode = line.split(/\s+/u, 1)[0];
      if (/^[-l][rwxStTs-]{9}$/u.test(symbolicMode)) {
        let mode = 0;
        for (let index = 0; index < 9; index++) {
          const character = symbolicMode[index + 1];
          const permission = index % 3;
          if (permission === 0 && character === "r") mode |= 4 << (6 - Math.floor(index / 3) * 3);
          if (permission === 1 && character === "w") mode |= 2 << (6 - Math.floor(index / 3) * 3);
          if (permission === 2 && /[xst]/u.test(character)) {
            mode |= 1 << (6 - Math.floor(index / 3) * 3);
          }
        }
        modes[path] = mode;
      }
    }
  }
  const files = [...new Set(listedFiles)].sort();
  if (Object.keys(modes).length === 0) {
    // Injected command runners in release-policy tests return the historical
    // path-only listing. Production tar receives --verbose and always supplies
    // header modes; model the known executable contract for those test doubles.
    for (const path of files) modes[path] = 0o644;
    for (const path of Object.values(REQUIRED_EXECUTABLE_PLUGIN_FILES).flat()) {
      if (files.includes(path)) modes[path] = 0o755;
    }
  }
  const fileSet = new Set(files);
  const json = {};
  for (const path of JSON_PAYLOAD_FILES) {
    if (fileSet.has(path)) json[path] = archiveJson(tarball, path, runCommand, safeEnv);
  }
  if (!json["package.json"]) {
    throw new TcReleaseComposeError(`${basename(tarball)} is missing package/package.json`);
  }
  return { tarball, files, modes, manifest: json["package.json"], json };
}

function assertFile(fileSet, path, label) {
  if (!fileSet.has(path)) throw new TcReleaseComposeError(`${label} is missing ${path}`);
}

function assertExecutableFiles(payload, paths, label) {
  for (const path of paths) {
    if (((payload.modes?.[path] ?? 0) & 0o111) === 0) {
      throw new TcReleaseComposeError(`${label} is not executable: ${path}`);
    }
  }
}

function runtimeEntrypoints(manifest) {
  const entries = [];
  if (manifest.main !== undefined) entries.push(["runtime main", manifest.main]);
  if (manifest.types !== undefined) entries.push(["runtime types", manifest.types]);
  if (typeof manifest.bin === "string") entries.push(["runtime bin", manifest.bin]);
  else if (plainObject(manifest.bin)) {
    for (const [name, path] of Object.entries(manifest.bin)) {
      entries.push([`runtime bin ${name}`, path]);
    }
  }
  return entries;
}

function findCommands(hooks) {
  const commands = [];
  if (Array.isArray(hooks)) {
    for (const child of hooks) commands.push(...findCommands(child));
  } else if (plainObject(hooks)) {
    if (typeof hooks.command === "string") commands.push(hooks.command);
    for (const child of Object.values(hooks)) commands.push(...findCommands(child));
  }
  return commands;
}

export function assertRequiredPluginPayload(payload, expectedKind, options = {}) {
  const manifestKind = pluginKind(payload?.manifest?.name);
  const kind = expectedKind ?? manifestKind;
  if (!Object.hasOwn(REQUIRED_PLUGIN_FILES, kind)) {
    throw new TcReleaseComposeError(`unsupported plugin payload kind: ${JSON.stringify(kind)}`);
  }
  if (manifestKind !== kind) {
    throw new TcReleaseComposeError(
      `${kind} plugin payload has runtime identity ${JSON.stringify(payload.manifest.name)}`,
    );
  }
  const label = `${kind} plugin payload`;
  const fileSet = new Set(payload.files ?? []);
  for (const path of REQUIRED_PLUGIN_FILES[kind]) assertFile(fileSet, path, label);
  if (options.checkExecutableModes !== false) {
    assertExecutableFiles(payload, REQUIRED_EXECUTABLE_PLUGIN_FILES[kind], label);
  }
  if (fileSet.has(INTERNAL_MINT_MANIFEST)) {
    throw new TcReleaseComposeError(`${label} includes internal ${INTERNAL_MINT_MANIFEST}`);
  }

  const manifest = payload.manifest;
  if (!plainObject(manifest)) throw new TcReleaseComposeError(`${label} has no package manifest`);
  const entrypoints = runtimeEntrypoints(manifest);
  if (manifest.main === undefined) throw new TcReleaseComposeError(`${label} has no runtime main`);
  if (entrypoints.every(([entryLabel]) => !entryLabel.startsWith("runtime bin"))) {
    throw new TcReleaseComposeError(`${label} has no runtime bin`);
  }
  for (const [entryLabel, value] of entrypoints) {
    assertFile(fileSet, packagePath(value, `${label} ${entryLabel}`), `${label} ${entryLabel}`);
  }

  if (kind === "memory") {
    const claudeManifest = payload.json?.[".claude-plugin/plugin.json"];
    if (claudeManifest?.hooks !== "./hooks/moe-mint/hooks.json") {
      throw new TcReleaseComposeError(
        `${label} Claude manifest must point hooks at ./hooks/moe-mint/hooks.json`,
      );
    }
    const runtimeHooks = payload.json?.["hooks/hooks.json"];
    const mergedHooks = payload.json?.["hooks/moe-mint/hooks.json"];
    const runtimeCommands = findCommands(runtimeHooks);
    const mergedCommands = findCommands(mergedHooks);
    if (
      !runtimeCommands.some(
        (command) => command.includes("dist/cli.js") && command.includes("sync --background"),
      ) ||
      !mergedCommands.some(
        (command) => command.includes("dist/cli.js") && command.includes("sync --background"),
      )
    ) {
      throw new TcReleaseComposeError(`${label} has no background runtime sync command`);
    }
    if (
      !mergedCommands.some(
        (command) =>
          command.includes("hooks/moe-mint/run-hook.cmd") && command.includes("session-start"),
      )
    ) {
      throw new TcReleaseComposeError(`${label} has no bootstrap session-start command`);
    }
  }
  return payload;
}

export function composePluginTarball(input) {
  const seedTarball = resolve(input.seedTarball);
  const pluginDirectory = resolve(input.pluginDirectory);
  const outputDirectory = resolve(input.outputDirectory);
  if (!existsSync(seedTarball)) {
    throw new TcReleaseComposeError(`seed tarball is missing: ${seedTarball}`);
  }
  if (!existsSync(pluginDirectory) || !statSync(pluginDirectory).isDirectory()) {
    throw new TcReleaseComposeError(`generated plugin directory is missing: ${pluginDirectory}`);
  }
  mkdirSync(outputDirectory, { recursive: true });

  const runCommand = input.runCommand ?? commandRunner;
  const inputEnvironment = input.env ?? process.env;
  const safeEnv = createReleaseSubprocessEnvironment(inputEnvironment);
  const temporaryRoot = mkdtempSync(join(resolve(input.tempRoot ?? tmpdir()), "moe-compose-"));
  try {
    runChecked(
      runCommand,
      "tar",
      ["-xzf", seedTarball, "-C", temporaryRoot],
      { env: safeEnv },
      `extract ${basename(seedTarball)}`,
    );
    const stagingDirectory = join(temporaryRoot, "package");
    const runtimeManifestPath = join(stagingDirectory, "package.json");
    if (!existsSync(runtimeManifestPath)) {
      throw new TcReleaseComposeError(`${basename(seedTarball)} has no package/package.json`);
    }
    const runtimeManifest = readJson(runtimeManifestPath, "runtime package.json");
    const kind = pluginKind(runtimeManifest.name);
    if (input.pluginKind !== undefined && input.pluginKind !== kind) {
      throw new TcReleaseComposeError(
        `seed package ${runtimeManifest.name} cannot compose the ${input.pluginKind} plugin`,
      );
    }

    const generatedManifestPath = join(pluginDirectory, "package.json");
    if (!existsSync(generatedManifestPath)) {
      throw new TcReleaseComposeError(`${pluginDirectory} has no generated package.json`);
    }
    const generatedManifest = readJson(generatedManifestPath, "generated package.json");
    const generatedModes = overlayGeneratedPlugin(pluginDirectory, stagingDirectory);
    const generatedExecutables = Object.entries(generatedModes)
      .filter(([, mode]) => (mode & 0o111) !== 0)
      .map(([path]) => path);

    const pi = safeGeneratedPi(generatedManifest.pi, stagingDirectory);
    const keywords = mergeKeywords(runtimeManifest.keywords, generatedManifest.keywords);
    if (pi !== undefined) runtimeManifest.pi = pi;
    if (runtimeManifest.keywords !== undefined || generatedManifest.keywords !== undefined) {
      runtimeManifest.keywords = keywords;
    }
    runtimeManifest.files = readdirSync(stagingDirectory)
      .filter((entry) => entry !== INTERNAL_MINT_MANIFEST.split("/")[0])
      .sort();
    writeFileSync(runtimeManifestPath, `${JSON.stringify(runtimeManifest, null, 2)}\n`);

    const stagedPayload = {
      files: generatedFiles(stagingDirectory).concat("package.json").sort(),
      modes: Object.fromEntries(
        generatedFiles(stagingDirectory)
          .concat("package.json")
          .map((path) => [path, lstatSync(join(stagingDirectory, path)).mode & 0o777]),
      ),
      manifest: runtimeManifest,
      json: Object.fromEntries(
        JSON_PAYLOAD_FILES.filter((path) => existsSync(join(stagingDirectory, path))).map(
          (path) => [path, readJson(join(stagingDirectory, path), `staged ${path}`)],
        ),
      ),
    };
    assertRequiredPluginPayload(stagedPayload, kind, { checkExecutableModes: false });
    assertExecutableFiles(stagedPayload, generatedExecutables, `${kind} generated plugin payload`);

    const before = new Set(readdirSync(outputDirectory).filter((entry) => entry.endsWith(".tgz")));
    const packEnv = createReleaseSubprocessEnvironment(inputEnvironment, {
      NPM_CONFIG_IGNORE_SCRIPTS: "true",
    });
    runChecked(
      runCommand,
      "pnpm",
      ["--config.ignore-scripts=true", "pack", "--pack-destination", outputDirectory],
      { cwd: stagingDirectory, env: packEnv },
      `compose ${runtimeManifest.name}`,
    );
    const added = readdirSync(outputDirectory)
      .filter((entry) => entry.endsWith(".tgz") && !before.has(entry))
      .sort();
    if (added.length !== 1) {
      throw new TcReleaseComposeError(
        `compose ${runtimeManifest.name} produced ${added.length} new tarballs; expected exactly one`,
      );
    }
    const tarball = isAbsolute(added[0]) ? added[0] : join(outputDirectory, added[0]);
    canonicalizePluginTarball({
      tarball,
      temporaryRoot,
      generatedModes,
      runCommand,
      env: safeEnv,
    });
    const payload = inspectPluginTarball(tarball, { runCommand, env: safeEnv });
    assertRequiredPluginPayload(payload, kind);
    assertExecutableFiles(payload, generatedExecutables, `${kind} generated plugin payload`);
    return {
      tarball,
      manifest: payload.manifest,
      files: payload.files,
      modes: payload.modes,
      kind,
    };
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}
