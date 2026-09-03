import { readFile, readdir, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { makeEvidence } from "../evidence.mjs";

const DENIALS = new Set([
  "user-rejected",
  "permission-rule",
  "automode-blocked",
  "automode-unavailable",
]);
const PERMISSION_KINDS = ["deny", "ask", "allow"];

/**
 * @typedef {{ class: "shell", command?: string, argv?: string[] } | { class: "filesystem", action: "read" | "modify", path: string } | { class: "network", hostname: string } | { class: "mcp", toolId: string }} ClaudeOperation
 */

/**
 * @param {object} options
 * @param {Record<string, string | undefined>} options.env
 * @param {string} options.homeDir
 * @param {string} options.cwd
 * @param {number} options.cutoffMs
 * @param {{ readdir: typeof readdir }} [options.fsOps]
 */
export async function discoverClaude({
  env,
  homeDir,
  cwd,
  cutoffMs,
  fsOps = { readdir },
}) {
  const sessionRoot = join(env.CLAUDE_CONFIG_DIR || join(homeDir, ".claude"), "projects");
  const files = [];
  await collectJsonl(sessionRoot, sessionRoot, files, fsOps);
  files.sort((left, right) => left.localeCompare(right));
  return { sessionRoot, cwd, cutoffMs, files };
}

async function collectJsonl(root, directory, files, fsOps) {
  let entries;
  try {
    entries = await fsOps.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  for (const entry of entries) {
    if (!isSafeEntryName(entry.name)) continue;
    const path = join(directory, entry.name);
    if (!isInside(root, path)) continue;
    if (entry.isDirectory()) {
      await collectJsonl(root, path, files, fsOps);
    } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      files.push(path);
    }
  }
}

function isSafeEntryName(name) {
  return (
    typeof name === "string" &&
    name !== "." &&
    name !== ".." &&
    !name.includes("/") &&
    !name.includes("\\")
  );
}

function isInside(root, path) {
  const pathRelativeToRoot = relative(root, path);
  return pathRelativeToRoot !== "" && !pathRelativeToRoot.startsWith("..") && !isAbsolute(pathRelativeToRoot);
}

/**
 * @param {string} file
 * @param {object} options
 * @param {number} options.cutoffMs
 * @param {(cwd: string) => Promise<string>} options.resolveProjectRoot
 * @param {(path: string) => Promise<string>} options.realpath
 * @param {ClaudePermissionState} options.effectivePermissions
 * @param {(path: string, encoding: BufferEncoding) => Promise<string>} [options.readFile]
 */
export async function readClaudeSession(
  file,
  {
    cutoffMs,
    resolveProjectRoot,
    realpath: resolveRealpath,
    effectivePermissions,
    readFile: readSessionFile = readFile,
  },
) {
  const diagnostics = { invalidRecords: 0, unknownShapes: 0, invalidOperations: 0 };
  const tools = [];
  const results = new Map();
  const text = await readSessionFile(file, "utf8");

  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      diagnostics.invalidRecords += 1;
      continue;
    }
    if (!isPlainObject(row) || !["assistant", "user"].includes(row.type)) {
      diagnostics.unknownShapes += 1;
      continue;
    }
    const content = row.message?.content;
    if (!Array.isArray(content)) {
      diagnostics.unknownShapes += 1;
      continue;
    }
    for (const part of content) {
      if (!isPlainObject(part)) continue;
      if (row.type === "assistant" && part.type === "tool_use") {
        tools.push({ row, tool: part });
      } else if (row.type === "user" && part.type === "tool_result") {
        const resultTimestamp = Date.parse(row.timestamp);
        if (
          typeof part.tool_use_id === "string" &&
          Number.isFinite(resultTimestamp) &&
          resultTimestamp >= cutoffMs
        ) {
          results.set(part.tool_use_id, part);
        }
      }
    }
  }

  const evidence = [];
  for (const { row, tool } of tools) {
    const observedMs = Date.parse(row.timestamp);
    if (!Number.isFinite(observedMs) || observedMs < cutoffMs) continue;
    if (typeof row.sessionId !== "string" || typeof row.cwd !== "string") {
      diagnostics.unknownShapes += 1;
      continue;
    }
    const projected = operationFor(tool);
    if (!projected) {
      diagnostics.invalidOperations += 1;
      continue;
    }
    const projectRoot = await canonicalProjectRoot(row.cwd, resolveProjectRoot, resolveRealpath);
    if (!projectRoot) {
      diagnostics.unknownShapes += 1;
      continue;
    }
    const result = results.get(tool.id);
    const operation = { class: projected.class, ...projected.operation };
    const permission = classifyClaudePermission(operation, effectivePermissions);
    evidence.push(
      makeEvidence({
        harness: "claude",
        rootSessionId: row.sessionId,
        projectRoot,
        observedAt: new Date(observedMs).toISOString(),
        class: projected.class,
        operation: projected.operation,
        outcome: outcomeFor(result),
        approvalProvenance: approvalFor(row, result, permission),
        sourceSchema: "claude-jsonl-tool-use-v1",
      }),
    );
  }
  return { evidence, diagnostics };
}

async function canonicalProjectRoot(cwd, resolveProjectRoot, resolveRealpath) {
  try {
    return await resolveRealpath(await resolveProjectRoot(cwd));
  } catch {
    return undefined;
  }
}

function outcomeFor(result) {
  if (!result) return "unknown";
  if (DENIALS.has(result.toolDenialKind)) return "denied";
  if (Object.hasOwn(result, "toolDenialKind")) return "denied";
  return result.is_error === true ? "failed" : "success";
}

function approvalFor(row, result, permission) {
  if (permission === "existing-rule") return "existing-rule";
  if (namesAutomaticMode(row) || namesAutomaticMode(result)) return "automatic";
  return "unknown";
}

function namesAutomaticMode(value) {
  return (
    isPlainObject(value) &&
    [value.permissionMode, value.permission_mode, value.mode].includes("automatic")
  );
}

function operationFor(tool) {
  if (!isPlainObject(tool) || typeof tool.name !== "string" || !isPlainObject(tool.input)) return undefined;
  if (tool.name === "Bash" && isNonEmptyString(tool.input.command)) {
    return { class: "shell", operation: { command: tool.input.command } };
  }
  if (tool.name === "Read" && isNonEmptyString(tool.input.file_path)) {
    return { class: "filesystem", operation: { action: "read", path: tool.input.file_path } };
  }
  if (["Edit", "Write"].includes(tool.name) && isNonEmptyString(tool.input.file_path)) {
    return { class: "filesystem", operation: { action: "modify", path: tool.input.file_path } };
  }
  if (tool.name === "WebFetch") {
    const hostname = hostnameFor(tool.input.url);
    return hostname ? { class: "network", operation: { hostname } } : undefined;
  }
  if (tool.name.startsWith("mcp__")) {
    return { class: "mcp", operation: { toolId: tool.name } };
  }
  return undefined;
}

function hostnameFor(value) {
  if (!isNonEmptyString(value)) return undefined;
  try {
    const hostname = new URL(value).hostname;
    return isEvidenceHostname(hostname) ? hostname : undefined;
  } catch {
    return undefined;
  }
}

function isEvidenceHostname(value) {
  return (
    isNonEmptyString(value) &&
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(
      value,
    )
  );
}

/**
 * @typedef {object} ClaudePermissionEntry
 * @property {"user" | "project" | "local"} scope
 * @property {string} rule
 * @property {{ projectRoot: string, primaryCwd: string, anchorProven: boolean }} context
 */

/**
 * @typedef {object} ClaudePermissionState
 * @property {ClaudePermissionEntry[]} deny
 * @property {ClaudePermissionEntry[]} ask
 * @property {ClaudePermissionEntry[]} allow
 * @property {string} canonicalConfigDir
 * @property {string} canonicalProjectRoot
 * @property {string} canonicalPrimaryCwd
 * @property {boolean} anchorProven
 */

/**
 * @param {object} options
 * @param {string} options.configDir
 * @param {string} options.projectRoot
 * @param {string} options.primaryCwd
 * @param {{ readFile: typeof readFile, realpath: typeof realpath }} options.fsOps
 * @returns {Promise<ClaudePermissionState>}
 */
export async function loadClaudePermissions({ configDir, projectRoot, primaryCwd, fsOps }) {
  const [canonicalConfigDir, canonicalProjectRoot, canonicalPrimaryCwd] = await Promise.all([
    fsOps.realpath(configDir),
    fsOps.realpath(projectRoot),
    fsOps.realpath(primaryCwd),
  ]);
  const anchorProven = primaryCwd === canonicalProjectRoot;
  const context = {
    projectRoot: canonicalProjectRoot,
    primaryCwd: canonicalPrimaryCwd,
    anchorProven,
  };
  const state = {
    deny: [],
    ask: [],
    allow: [],
    canonicalConfigDir,
    canonicalProjectRoot,
    canonicalPrimaryCwd,
    anchorProven,
  };
  for (const setting of settingsPaths({ configDir, primaryCwd })) {
    const parsed = await readSettings(setting.path, fsOps.readFile);
    if (!parsed) continue;
    for (const kind of PERMISSION_KINDS) {
      for (const rule of parsed.permissions[kind]) {
        state[kind].push({ scope: setting.scope, rule, context });
      }
    }
  }
  return state;
}

function settingsPaths({ configDir, primaryCwd }) {
  return [
    { scope: "user", path: join(configDir, "settings.json") },
    { scope: "project", path: join(primaryCwd, ".claude", "settings.json") },
    { scope: "local", path: join(primaryCwd, ".claude", "settings.local.json") },
  ];
}

async function readSettings(path, readSettingsFile) {
  let text;
  try {
    text = await readSettingsFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
  let settings;
  try {
    settings = JSON.parse(text);
  } catch (error) {
    throw new TypeError(`invalid JSON in ${path}: ${error.message}`);
  }
  if (!isPlainObject(settings)) throw new TypeError(`${path} must contain an object`);
  if (settings.permissions === undefined) {
    return { permissions: { deny: [], ask: [], allow: [] } };
  }
  if (!isPlainObject(settings.permissions)) throw new TypeError("permissions must contain an object");
  const permissions = {};
  for (const kind of PERMISSION_KINDS) {
    const rules = Object.hasOwn(settings.permissions, kind) ? settings.permissions[kind] : [];
    if (!Array.isArray(rules) || !rules.every((rule) => typeof rule === "string")) {
      throw new TypeError(`permissions.${kind} must contain strings`);
    }
    permissions[kind] = rules;
  }
  return { permissions };
}

/**
 * @param {ClaudeOperation} operation
 * @param {ClaudePermissionState} state
 * @returns {"denied" | "existing-rule" | "ask" | "unmatched"}
 */
export function classifyClaudePermission(operation, state) {
  if (state.deny.some((entry) => matchClaudePermission(entry.rule, operation, entry.context))) return "denied";
  if (state.ask.some((entry) => matchClaudePermission(entry.rule, operation, entry.context))) return "ask";
  if (state.allow.some((entry) => matchClaudePermission(entry.rule, operation, entry.context))) return "existing-rule";
  return "unmatched";
}

/**
 * @param {string} rule
 * @param {ClaudeOperation} operation
 * @param {{ projectRoot?: string, primaryCwd?: string }} context
 */
export function matchClaudePermission(rule, operation, context = {}) {
  if (!isNonEmptyString(rule) || !isPlainObject(operation)) return false;
  const parsed = parseRule(rule);
  if (!parsed) return false;
  if (operation.class === "shell") {
    if (parsed.tool !== "Bash") return false;
    return parsed.argument === undefined || matchesPattern(shellText(operation), parsed.argument);
  }
  if (operation.class === "filesystem") {
    const tool = operation.action === "read" ? "Read" : undefined;
    if (tool ? parsed.tool !== tool : !["Edit", "Write"].includes(parsed.tool)) return false;
    return parsed.argument === undefined || matchesPath(operation.path, parsed.argument, context);
  }
  if (operation.class === "network") {
    if (parsed.tool !== "WebFetch") return false;
    if (parsed.argument === undefined) return true;
    const hostname = parsed.argument.startsWith("domain:") ? parsed.argument.slice("domain:".length) : parsed.argument;
    return matchesPattern(operation.hostname.toLowerCase(), hostname.toLowerCase());
  }
  if (operation.class === "mcp") {
    if (parsed.tool !== operation.toolId) return false;
    return parsed.argument === undefined || parsed.argument === "";
  }
  return false;
}

function parseRule(rule) {
  const match = /^([A-Za-z0-9_:-]+)(?:\((.*)\))?$/.exec(rule);
  return match ? { tool: match[1], argument: match[2] } : undefined;
}

function shellText(operation) {
  if (isNonEmptyString(operation.command)) return operation.command;
  if (Array.isArray(operation.argv) && operation.argv.length > 0 && operation.argv.every(isNonEmptyString)) {
    return operation.argv.join(" ");
  }
  return "";
}

function matchesPath(path, pattern, context) {
  if (!isNonEmptyString(path) || !isNonEmptyString(pattern)) return false;
  const anchor = context.primaryCwd || context.projectRoot;
  const operationPath = isAbsolute(path) ? resolve(path) : anchor ? resolve(anchor, path) : path;
  const rulePath = isAbsolute(pattern) ? resolve(pattern) : anchor ? resolve(anchor, pattern) : pattern;
  return matchesPattern(operationPath, rulePath);
}

function matchesPattern(value, pattern) {
  const expression = pattern
    .split("*")
    .map((part) => part.replace(/[|\\{}()[\]^$+?.]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${expression}$`).test(value);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}
