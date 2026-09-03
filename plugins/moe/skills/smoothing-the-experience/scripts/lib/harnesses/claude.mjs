import { readFile, readdir, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { makeEvidence } from "../evidence.mjs";
import { classifyMcp } from "../safety/mcp.mjs";
import { classifyNetwork } from "../safety/network.mjs";
import { classifyShell } from "../safety/shell.mjs";

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
  files.sort(compareCodeUnits);
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
    const canonicalCwd = await canonicalPath(row.cwd, resolveRealpath);
    if (!projectRoot || !canonicalCwd) {
      diagnostics.unknownShapes += 1;
      continue;
    }
    const result = results.get(tool.id);
    const normalizedOperation = normalizeObservedOperation(projected, canonicalCwd, projectRoot);
    const operation = { class: projected.class, ...normalizedOperation };
    const permission = classifyClaudePermission(operation, effectivePermissions);
    evidence.push(
      makeEvidence({
        harness: "claude",
        rootSessionId: row.sessionId,
        projectRoot,
        observedAt: new Date(observedMs).toISOString(),
        class: projected.class,
        operation: normalizedOperation,
        outcome: outcomeFor(result),
        approvalProvenance: approvalFor(row, result, permission),
        sourceSchema: "claude-jsonl-tool-use-v1",
      }),
    );
  }
  return { evidence, diagnostics };
}

function normalizeObservedOperation(projected, cwd, projectRoot) {
  if (projected.class !== "filesystem") return projected.operation;
  const observedPath = projected.operation.path;
  const absolutePath = isAbsolute(observedPath) ? resolve(observedPath) : resolve(cwd, observedPath);
  return {
    ...projected.operation,
    path: relative(projectRoot, absolutePath).split(sep).join("/"),
  };
}

async function canonicalProjectRoot(cwd, resolveProjectRoot, resolveRealpath) {
  try {
    return await resolveRealpath(await resolveProjectRoot(cwd));
  } catch {
    return undefined;
  }
}

async function canonicalPath(path, resolveRealpath) {
  try {
    return await resolveRealpath(path);
  } catch {
    return undefined;
  }
}

function outcomeFor(result) {
  if (!result) return "unknown";
  if (DENIALS.has(result.toolDenialKind)) return "denied";
  if (Object.hasOwn(result, "toolDenialKind")) return "denied";
  if (result.is_error === true) return "failed";
  if (result.is_error === false) return "success";
  return "unknown";
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
 * @property {{ projectRoot: string, primaryCwd: string, homeDir: string, anchorProven: boolean, observationCwdProven: boolean }} context
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
 * @param {string} [options.homeDir]
 * @param {boolean} [options.observationCwdProven]
 * @param {{ readFile: typeof readFile, realpath: typeof realpath }} options.fsOps
 * @returns {Promise<ClaudePermissionState>}
 */
export async function loadClaudePermissions({
  configDir,
  projectRoot,
  primaryCwd,
  homeDir = homedir(),
  observationCwdProven = false,
  fsOps,
}) {
  const [canonicalConfigDir, canonicalProjectRoot, canonicalPrimaryCwd, canonicalHomeDir] = await Promise.all([
    fsOps.realpath(configDir),
    fsOps.realpath(projectRoot),
    fsOps.realpath(primaryCwd),
    fsOps.realpath(homeDir),
  ]);
  const anchorProven = canonicalPrimaryCwd === canonicalProjectRoot;
  const context = {
    projectRoot: canonicalProjectRoot,
    primaryCwd: canonicalPrimaryCwd,
    homeDir: canonicalHomeDir,
    anchorProven,
    observationCwdProven,
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
  for (const setting of settingsPaths({ configDir, projectRoot })) {
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

function settingsPaths({ configDir, projectRoot }) {
  return [
    { scope: "user", path: join(configDir, "settings.json") },
    { scope: "project", path: join(projectRoot, ".claude", "settings.json") },
    { scope: "local", path: join(projectRoot, ".claude", "settings.local.json") },
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
 * @param {{ projectRoot?: string, primaryCwd?: string, homeDir?: string, observationCwdProven?: boolean }} context
 */
export function matchClaudePermission(rule, operation, context = {}) {
  if (!isNonEmptyString(rule) || !isPlainObject(operation)) return false;
  const parsed = parseRule(rule);
  if (!parsed) return false;
  if (operation.class === "shell") {
    if (parsed.tool !== "Bash") return false;
    return parsed.argument === undefined || matchesShellPattern(shellText(operation), parsed.argument);
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
  const operationPath = isAbsolute(path)
    ? resolve(path)
    : context.projectRoot
      ? resolve(context.projectRoot, path)
      : undefined;
  const rulePath = resolveClaudeRulePath(pattern, context);
  if (!operationPath || !rulePath) return false;
  return matchesPathPattern(toPosixPath(operationPath), toPosixPath(rulePath));
}

function resolveClaudeRulePath(pattern, context) {
  if (pattern.startsWith("//")) return resolve(pattern.slice(1));
  if (pattern.startsWith("/")) {
    return context.projectRoot ? resolve(context.projectRoot, pattern.slice(1)) : undefined;
  }
  if (pattern.startsWith("~/")) {
    return context.homeDir ? resolve(context.homeDir, pattern.slice(2)) : undefined;
  }
  if (context.observationCwdProven !== true || !context.primaryCwd) return undefined;
  return resolve(context.primaryCwd, pattern);
}

function toPosixPath(path) {
  return path.split(sep).join("/");
}

function matchesPathPattern(value, pattern) {
  let expression = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character !== "*") {
      expression += character.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
      continue;
    }
    if (pattern[index + 1] !== "*") {
      expression += "[^/]*";
      continue;
    }
    index += 1;
    if (pattern[index + 1] === "/") {
      expression += "(?:.*/)?";
      index += 1;
    } else {
      expression += ".*";
    }
  }
  return new RegExp(`^${expression}$`).test(value);
}

function matchesShellPattern(value, pattern) {
  if (pattern.endsWith(":*")) {
    const command = pattern.slice(0, -2);
    return value === command || value.startsWith(`${command} `);
  }
  return matchesPattern(value, pattern);
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

const CLAUDE_RULE = {
  read: (path) => `Read(/${path})`,
  modify: (path) => `Edit(/${path})`,
  network: (hostname) => `WebFetch(domain:${hostname})`,
  mcp: (toolId) => toolId,
};

/**
 * Render one already-classified candidate without broadening its scope.
 * Context is optional so callers may render a canonical rule body before a
 * destination is available; when path information is supplied it is retained
 * on the returned candidate for planning.
 *
 * @param {object} candidate
 * @param {object} [context]
 */
export function renderClaudeCandidate(candidate, context = {}) {
  if (!isPlainObject(candidate) || candidate.harness && candidate.harness !== "claude") {
    return null;
  }
  const scope = candidate.scope;
  if (!["project", "global"].includes(scope)) return null;

  let rule;
  if (candidate.class === "shell") {
    const classified = classifyShell(candidate.operation, {
      harness: "claude",
      projectRoot: candidate.projectRoot ?? context.projectRoot ?? "",
      realpath: context.realpath,
    });
    if (!classified.eligible || (scope === "global" && !classified.globalSafe)) return null;
    rule = renderClaudeShell(classified.normalized);
    if (!rule) return null;
  } else if (candidate.class === "filesystem") {
    if (scope !== "project" || context.anchorProven !== true) return null;
    const { action, path } = candidate.operation ?? {};
    if (
      !["read", "modify"].includes(action) ||
      !isNonEmptyString(path) ||
      isAbsolute(path) ||
      path.includes("*") ||
      path.includes("\\") ||
      path.split(/[\\/]/).includes("..")
    ) {
      return null;
    }
    rule = CLAUDE_RULE[action](path);
  } else if (candidate.class === "network") {
    const classified = classifyNetwork(candidate.operation);
    if (!classified.eligible) return null;
    rule = CLAUDE_RULE.network(classified.normalized.hostname);
  } else if (candidate.class === "mcp") {
    const classified = classifyMcp(candidate.operation);
    if (scope !== "project" || !classified.eligible) return null;
    rule = CLAUDE_RULE.mcp(classified.normalized.toolId);
  } else {
    return null;
  }

  const projectRoot = candidate.projectRoot ?? context.projectRoot;
  const configDir = context.configDir ?? context.canonicalConfigDir;
  const destination = scope === "project"
    ? isNonEmptyString(projectRoot)
      ? join(projectRoot, ".claude", "settings.local.json")
      : undefined
    : isNonEmptyString(configDir)
      ? join(configDir, "settings.json")
      : undefined;
  return {
    ...candidate,
    rule,
    ...(destination ? { destination } : {}),
    restartRequired: false,
  };
}

function renderClaudeShell(operation) {
  const argv = operation?.argv;
  if (!Array.isArray(argv) || argv.length < 2 || !argv.every(isNonEmptyString)) return null;
  const command = argv.slice(0, 2).join(" ");
  if (["git status", "git add"].includes(command)) return `Bash(${command}:*)`;
  if (["git diff", "git log", "git show"].includes(command) && argv.length === 2) {
    return `Bash(${command})`;
  }
  if (
    argv.some((token) => /\s/.test(token)) ||
    !(
      ["git diff", "git log", "git show"].includes(command) ||
      (argv.length === 4 && argv[0] === "cp" && argv[1] === "-n")
    )
  ) {
    return null;
  }
  return `Bash(${argv.join(" ")})`;
}

/**
 * Clone a complete Claude settings document and append selected allow rules.
 * Existing settings retain their order and values; duplicate selected rules
 * are collapsed without rewriting any other permission list.
 *
 * @param {string} sourceJson
 * @param {string[]} selectedRules
 */
export function renderClaudeSettings(sourceJson, selectedRules) {
  let settings;
  try {
    settings = JSON.parse(sourceJson);
  } catch {
    throw new TypeError("invalid Claude settings JSON");
  }
  if (!isPlainObject(settings)) throw new TypeError("Claude settings must contain an object");
  if (!Array.isArray(selectedRules) || !selectedRules.every(isNonEmptyString)) {
    throw new TypeError("selected Claude rules must contain strings");
  }
  if (selectedRules.some((rule) => rule.startsWith("Write("))) {
    throw new TypeError("Write rules are not supported");
  }

  const permissions = settings.permissions === undefined ? {} : settings.permissions;
  if (!isPlainObject(permissions)) throw new TypeError("permissions must contain an object");
  for (const kind of PERMISSION_KINDS) {
    const rules = permissions[kind];
    if (rules !== undefined && (!Array.isArray(rules) || !rules.every((rule) => typeof rule === "string"))) {
      throw new TypeError(`permissions.${kind} must contain strings`);
    }
  }
  const existing = permissions.allow ?? [];
  const replacement = {
    ...settings,
    permissions: {
      ...permissions,
      allow: [...new Set([...existing, ...selectedRules])],
    },
  };
  return `${JSON.stringify(replacement, null, 2)}\n`;
}

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
