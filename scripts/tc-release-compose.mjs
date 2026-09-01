/**
 * Compose an npm runtime tarball with the plugin tree emitted by moe-mint.
 *
 * The seed tarball is authoritative for executable package metadata. Mint may
 * add only the Pi declaration and keywords; its other package.json fields are
 * plugin-store metadata and are not valid npm runtime replacements.
 */

import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, posix, resolve } from "node:path";

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
    "skills/browsing/SKILL.md",
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

function secretFreeEnvironment(env) {
  const { PROGET_NPM_AUTH: _credential, ...safe } = env;
  return safe;
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
  for (const path of generatedFiles(pluginDirectory)) {
    const destination = join(stagingDirectory, path);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(join(pluginDirectory, path), destination, { force: true, recursive: true });
  }
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
  const safeEnv = secretFreeEnvironment(env);
  const listing = runChecked(
    runCommand,
    "tar",
    ["-tzf", tarball],
    { env: safeEnv },
    `list ${basename(tarball)}`,
  );
  const files = [
    ...new Set(
      listing.stdout
        .split(/\r?\n/u)
        .filter((entry) => entry.startsWith("package/") && !entry.endsWith("/"))
        .map((entry) => entry.slice("package/".length)),
    ),
  ].sort();
  const fileSet = new Set(files);
  const json = {};
  for (const path of JSON_PAYLOAD_FILES) {
    if (fileSet.has(path)) json[path] = archiveJson(tarball, path, runCommand, safeEnv);
  }
  if (!json["package.json"]) {
    throw new TcReleaseComposeError(`${basename(tarball)} is missing package/package.json`);
  }
  return { tarball, files, manifest: json["package.json"], json };
}

function assertFile(fileSet, path, label) {
  if (!fileSet.has(path)) throw new TcReleaseComposeError(`${label} is missing ${path}`);
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

export function assertRequiredPluginPayload(payload, expectedKind) {
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
    const mergedHooks = payload.json?.["hooks/hooks.json"];
    const bootstrapHooks = payload.json?.["hooks/moe-mint/hooks.json"];
    const mergedCommands = findCommands(mergedHooks);
    const bootstrapCommands = findCommands(bootstrapHooks);
    if (
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
      ) ||
      !bootstrapCommands.some(
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
  const safeEnv = secretFreeEnvironment(input.env ?? process.env);
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
    overlayGeneratedPlugin(pluginDirectory, stagingDirectory);

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
      manifest: runtimeManifest,
      json: Object.fromEntries(
        JSON_PAYLOAD_FILES.filter((path) => existsSync(join(stagingDirectory, path))).map(
          (path) => [path, readJson(join(stagingDirectory, path), `staged ${path}`)],
        ),
      ),
    };
    assertRequiredPluginPayload(stagedPayload, kind);

    const before = new Set(readdirSync(outputDirectory).filter((entry) => entry.endsWith(".tgz")));
    const packEnv = {
      ...safeEnv,
      NPM_CONFIG_IGNORE_SCRIPTS: "true",
      npm_config_ignore_scripts: "true",
    };
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
    const payload = inspectPluginTarball(tarball, { runCommand, env: safeEnv });
    assertRequiredPluginPayload(payload, kind);
    return { tarball, manifest: payload.manifest, files: payload.files, kind };
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}
