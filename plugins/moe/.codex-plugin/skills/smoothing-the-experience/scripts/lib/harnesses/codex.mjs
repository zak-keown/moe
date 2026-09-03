import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile, readdir, realpath, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { makeEvidence } from "../evidence.mjs";
import { GLOBAL_SHELL_CATALOG, PROJECT_SHELL_CATALOG, classifyShell } from "../safety/shell.mjs";

const MAX_JSON_LINE_BYTES = 1024 * 1024;
const CONFIG_LAYER_VERSION = /^sha256:[0-9a-f]{64}$/;
const RECOGNIZED_SUCCESS_STATUSES = new Set(["completed", "success", "succeeded"]);
const RECOGNIZED_FAILURE_STATUSES = new Set(["failed", "error"]);

/**
 * The three rollout envelopes documented by Codex. Additional typed operations
 * within function_call are handled by the function-call decoder, never by
 * guessing from unstructured text.
 */
export const CODEX_SCHEMA_DECODERS = Object.freeze([
  {
    name: "codex-item-completed-v1",
    matches: (row) => row?.type === "event_msg" && row?.payload?.type === "item_completed",
    decode: decodeItemCompleted,
  },
  {
    name: "codex-function-call-v1",
    matches: (row) => row?.type === "response_item" && row?.payload?.type === "function_call" && row?.payload?.name === "exec_command",
    decode: decodeFunctionCall,
  },
  {
    name: "codex-local-shell-call-v1",
    matches: (row) => row?.type === "response_item" && row?.payload?.type === "local_shell_call",
    decode: decodeLocalShellCall,
  },
]);

/**
 * @param {unknown} command
 */
function unwrapShell(command) {
  if (
    Array.isArray(command) &&
    command.length === 3 &&
    ["sh", "bash", "zsh"].includes(command[0]) &&
    command[1] === "-lc" &&
    typeof command[2] === "string"
  ) {
    return { script: command[2], wrapped: true };
  }
  return { argv: command, wrapped: false };
}

/**
 * Decode one record without retaining output, URLs, credentials, or arguments
 * outside the narrow evidence operation contract.
 *
 * @param {unknown} record
 * @param {object} state
 * @returns {object | null}
 */
export function decodeCodexLine(record, state) {
  if (!isObject(record)) return null;
  absorbSessionHeader(record, state);
  absorbApprovedPrefixes(record, state);

  for (const decoder of CODEX_SCHEMA_DECODERS) {
    if (decoder.matches(record)) {
      return decoder.decode(record, state, decoder.name);
    }
  }
  return decodeTypedFunctionCall(record, state);
}

function decodeItemCompleted(row, state, sourceSchema) {
  const item = row.payload?.item;
  if (!isObject(item) || item.type !== "CommandExecution") return null;
  return shellEvent({
    command: item.command,
    cwd: item.cwd,
    status: item.status,
    exitCode: item.exit_code,
    row,
    state,
    sourceSchema,
  });
}

function decodeFunctionCall(row, state, sourceSchema) {
  const args = parseArguments(row.payload?.arguments);
  if (!args) return null;
  return shellEvent({
    command: args.cmd ?? args.command,
    cwd: args.cwd ?? row.payload?.cwd,
    status: row.payload?.status,
    exitCode: row.payload?.exit_code,
    row,
    state,
    sourceSchema,
  });
}

function decodeLocalShellCall(row, state, sourceSchema) {
  return shellEvent({
    command: row.payload?.command ?? row.payload?.argv,
    cwd: row.payload?.cwd,
    status: row.payload?.status,
    exitCode: row.payload?.exit_code,
    row,
    state,
    sourceSchema,
  });
}

function decodeTypedFunctionCall(row, state) {
  if (row?.type !== "response_item" || row?.payload?.type !== "function_call") return null;
  const { name } = row.payload;
  const args = parseArguments(row.payload.arguments);
  if (typeof name !== "string" || !args) return null;
  const base = eventBase(row, state, "codex-function-call-v1", row.payload.cwd ?? args.cwd);
  if (!base) return null;
  if (["filesystem", "file_read", "file_write"].includes(name)) {
    const action = args.action ?? (name === "file_write" ? "modify" : "read");
    if (!["read", "modify"].includes(action) || typeof args.path !== "string" || !args.path) return null;
    return { ...base, class: "filesystem", operation: { action, path: args.path }, outcome: outcomeFor(row.payload) };
  }
  if (["network_request", "web_request"].includes(name)) {
    const hostname = hostnameFrom(args.url ?? args.uri ?? args.hostname);
    if (!hostname) return null;
    return { ...base, class: "network", operation: { hostname }, outcome: outcomeFor(row.payload) };
  }
  if (name.startsWith("mcp__")) {
    return { ...base, class: "mcp", operation: { toolId: name }, outcome: outcomeFor(row.payload) };
  }
  return null;
}

function shellEvent({ command, cwd, status, exitCode, row, state, sourceSchema }) {
  const operation = shellOperation(command);
  const base = eventBase(row, state, sourceSchema, cwd);
  if (!operation || !base) return null;
  return { ...base, class: "shell", operation, outcome: outcomeFor({ status, exit_code: exitCode }) };
}

function eventBase(row, state, sourceSchema, cwd) {
  if (typeof row.timestamp !== "string" || !Number.isFinite(Date.parse(row.timestamp))) return null;
  const session = state.currentSession;
  if (!session?.id) return null;
  return {
    sessionId: session.id,
    cwd: typeof cwd === "string" && cwd ? cwd : session.cwd,
    observedAt: row.timestamp,
    sourceSchema,
  };
}

function shellOperation(command) {
  if (typeof command === "string" && command) return { command };
  const unwrapped = unwrapShell(command);
  if (unwrapped.wrapped && unwrapped.script) return { command: unwrapped.script };
  if (Array.isArray(unwrapped.argv) && unwrapped.argv.length > 0 && unwrapped.argv.every(isNonEmptyString)) {
    return { argv: [...unwrapped.argv] };
  }
  return null;
}

function outcomeFor(value) {
  const status = value?.status;
  const exitCode = value?.exit_code;
  if (status === "denied" || status === "rejected") return "denied";
  if (typeof exitCode === "number" && exitCode !== 0) return "failed";
  if (RECOGNIZED_FAILURE_STATUSES.has(status)) return "failed";
  if (status !== undefined && !RECOGNIZED_SUCCESS_STATUSES.has(status)) return "unknown";
  if (exitCode === 0 || RECOGNIZED_SUCCESS_STATUSES.has(status)) return "success";
  return "unknown";
}

function parseArguments(value) {
  if (isObject(value)) return value;
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function hostnameFrom(value) {
  if (typeof value !== "string" || !value) return null;
  try {
    return new URL(value).hostname || null;
  } catch {
    return /^[a-z0-9.-]+$/i.test(value) ? value : null;
  }
}

function absorbSessionHeader(row, state) {
  if (row?.type !== "session_meta" || !isObject(row.payload)) return;
  const id = row.payload.id ?? row.payload.session_id;
  if (typeof id !== "string" || !id) return;
  const parentId = row.payload.parent_id ?? row.payload.parentId ?? null;
  const header = {
    id,
    parentId: typeof parentId === "string" && parentId ? parentId : null,
    cwd: typeof row.payload.cwd === "string" ? row.payload.cwd : undefined,
    cliVersion: typeof row.payload.cli_version === "string" ? row.payload.cli_version : undefined,
  };
  state.headers ??= [];
  state.headers.push(header);
  state.currentSession = header;
}

function absorbApprovedPrefixes(row, state) {
  const prefixes = row?.payload?.state?.permissions?.approved_command_prefixes;
  if (!Array.isArray(prefixes) || !state.currentSession?.id || !Number.isFinite(Date.parse(row.timestamp))) return;
  state.capturedPrefixes ??= [];
  state.capturedPrefixes.push({
    sessionId: state.currentSession.id,
    observedAt: row.timestamp,
    prefixes: prefixes.filter(validPrefix),
  });
}

/**
 * @param {Array<{id: string, parentId?: string | null}> | Map<string, {parentId?: string | null}>} headers
 */
export function collapseCodexRoots(headers) {
  const byId = headers instanceof Map ? headers : new Map(headers.map((header) => [header.id, header]));
  const roots = new Map();
  for (const id of byId.keys()) {
    const visited = new Set();
    let current = id;
    while (byId.get(current)?.parentId && byId.has(byId.get(current).parentId) && !visited.has(current)) {
      visited.add(current);
      current = byId.get(current).parentId;
    }
    roots.set(id, current);
  }
  return roots;
}

/**
 * @param {{files: string[], cutoffMs: number, resolveProjectRoot: (cwd: string) => Promise<string>, existingPrefixes?: string[][]}} options
 */
export async function readCodexSessions({ files, cutoffMs, resolveProjectRoot, existingPrefixes = [] }) {
  const state = { headers: [], capturedPrefixes: [] };
  const decoded = [];
  const diagnostics = [];
  for (const file of [...files].sort()) {
    let contents;
    try {
      contents = await readFile(file, "utf8");
    } catch {
      diagnostics.push({ kind: "unreadable-session" });
      continue;
    }
    for (const line of contents.split(/\r?\n/)) {
      if (!line) continue;
      let row;
      try {
        row = JSON.parse(line);
      } catch {
        diagnostics.push({ kind: "malformed-record" });
        continue;
      }
      const event = decodeCodexLine(row, state);
      if (event && Date.parse(event.observedAt) >= cutoffMs) decoded.push(event);
    }
  }
  const roots = collapseCodexRoots(state.headers);
  const configuredPrefixes = existingPrefixes.filter(validPrefix);
  const evidence = [];
  const contexts = new Map();
  for (const event of decoded) {
    if (!event.cwd || !isAbsolute(event.cwd)) {
      diagnostics.push({ kind: "missing-working-directory" });
      continue;
    }
    let projectRoot;
    try {
      projectRoot = await resolveProjectRoot(event.cwd);
    } catch {
      diagnostics.push({ kind: "unresolved-project-root" });
      continue;
    }
    try {
      contexts.set(`${projectRoot}\0${event.cwd}`, { projectRoot, cwd: resolve(event.cwd) });
      const rootSessionId = roots.get(event.sessionId) ?? event.sessionId;
      evidence.push(makeEvidence({
        harness: "codex",
        rootSessionId,
        projectRoot,
        observedAt: event.observedAt,
        class: event.class,
        operation: event.operation,
        outcome: event.outcome,
        approvalProvenance: matchesPrefix(
          event.operation,
          [...configuredPrefixes, ...capturedPrefixesFor(event, rootSessionId, roots, state.capturedPrefixes)],
        )
          ? "existing-rule"
          : "unknown",
        sourceSchema: event.sourceSchema,
      }));
    } catch {
      diagnostics.push({ kind: "invalid-decoded-evidence" });
    }
  }
  for (const header of state.headers) {
    if (header.cliVersion) diagnostics.push({ cliVersion: header.cliVersion });
  }
  return { evidence, diagnostics, contexts: [...contexts.values()] };
}

function capturedPrefixesFor(event, rootSessionId, roots, capturedStates) {
  let latest = null;
  const eventMs = Date.parse(event.observedAt);
  for (const captured of capturedStates) {
    const capturedRoot = roots.get(captured.sessionId) ?? captured.sessionId;
    const capturedMs = Date.parse(captured.observedAt);
    if (capturedRoot !== rootSessionId || capturedMs > eventMs) continue;
    if (!latest || capturedMs > Date.parse(latest.observedAt)) latest = captured;
  }
  return latest?.prefixes ?? [];
}

/**
 * @param {{env: Record<string, string | undefined>, homeDir: string, cutoffMs: number, fsOps?: object}} options
 */
export async function discoverCodex({ env, homeDir, cutoffMs, fsOps = {} }) {
  const operations = { readdir, realpath, stat, ...fsOps };
  const sessionRoot = resolve(env.CODEX_HOME || join(homeDir, ".codex"), "sessions");
  let resolvedRoot;
  try {
    resolvedRoot = await operations.realpath(sessionRoot);
  } catch {
    return { status: "unavailable", sessionRoot, files: [], cutoffMs };
  }
  const files = [];
  await walkSessionFiles(resolvedRoot, resolvedRoot, files, operations);
  return { status: "ready", sessionRoot: resolvedRoot, files: files.sort(), cutoffMs };
}

async function walkSessionFiles(root, directory, files, fsOps) {
  const entries = await fsOps.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const candidate = join(directory, entry.name);
    const resolvedCandidate = await fsOps.realpath(candidate);
    if (!isInside(root, resolvedCandidate)) throw new Error("Codex session path escapes session root");
    const info = await fsOps.stat(resolvedCandidate);
    if (info.isDirectory()) await walkSessionFiles(root, resolvedCandidate, files, fsOps);
    else if (info.isFile() && resolvedCandidate.endsWith(".jsonl")) files.push(resolvedCandidate);
  }
}

function isInside(root, candidate) {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith("..") && !path.startsWith("/"));
}

/**
 * @param {{codexBin: string, cwd: string, spawnProcess: Function, timeoutMs?: number}} options
 */
export async function readCodexConfigLayers({ codexBin, cwd, spawnProcess, timeoutMs = 2000 }) {
  let child;
  try {
    child = spawnProcess(codexBin, ["app-server", "--stdio", "--strict-config"], { stdio: ["pipe", "pipe", "pipe"] });
    const client = jsonLineClient(child, timeoutMs);
    const initialized = await client.request({ id: 1, method: "initialize", params: { clientInfo: { name: "moe-smoothing", version: "1" }, capabilities: {} } });
    if (!isInitializeResponse(initialized)) throw new Error("unsupported Codex initialize response");
    client.notify({ method: "initialized" });
    const response = await client.request({ id: 2, method: "config/read", params: { cwd, includeLayers: true } });
    return parseEnabledLayers(response);
  } catch {
    return { status: "unavailable", layers: [] };
  } finally {
    child?.kill?.();
  }
}

function jsonLineClient(child, timeoutMs) {
  const pending = new Map();
  let buffer = "";
  let terminalError = null;
  const fail = (error) => {
    if (terminalError) return;
    terminalError = error;
    for (const { reject, timer } of pending.values()) {
      clearTimeout(timer);
      reject(error);
    }
    pending.clear();
  };
  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    if (Buffer.byteLength(buffer) > MAX_JSON_LINE_BYTES && !buffer.includes("\n")) {
      fail(new Error("Codex App Server line exceeds 1 MiB"));
      return;
    }
    let newline;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (Buffer.byteLength(line) > MAX_JSON_LINE_BYTES) {
        fail(new Error("Codex App Server line exceeds 1 MiB"));
        return;
      }
      if (!line) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        fail(new Error("malformed Codex App Server JSON"));
        return;
      }
      if (!Number.isInteger(message?.id) || !pending.has(message.id)) continue;
      const request = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.error) request.reject(new Error("Codex App Server error"));
      else request.resolve(message.result);
    }
  });
  child.once?.("error", fail);
  const writeMessage = (message) => {
    if (terminalError) throw terminalError;
    child.stdin.write(`${JSON.stringify(message)}\n`);
  };
  return {
    request(message) {
      if (terminalError) return Promise.reject(terminalError);
      return new Promise((resolveRequest, reject) => {
        const timer = setTimeout(() => {
          pending.delete(message.id);
          reject(new Error("Codex App Server request timed out"));
        }, timeoutMs);
        pending.set(message.id, { resolve: resolveRequest, reject, timer });
        try {
          writeMessage(message);
        } catch (error) {
          clearTimeout(timer);
          pending.delete(message.id);
          reject(error);
        }
      });
    },
    notify(message) {
      if (!isObject(message) || Object.hasOwn(message, "id") || !isNonEmptyString(message.method)) {
        throw new TypeError("Codex App Server notification is invalid");
      }
      writeMessage(message);
    },
  };
}

function parseEnabledLayers(response) {
  if (
    !hasOnlyKeys(response, ["config", "origins", "layers"]) ||
    !isObject(response.config) ||
    !isObject(response.origins) ||
    !Array.isArray(response.layers) ||
    !Object.values(response.origins).every(isConfigLayerMetadata)
  ) {
    throw new Error("unsupported Codex config/read response");
  }
  const layers = response.layers.map(parseConfigLayer);
  if (layers.some((layer) => layer === null)) {
    throw new Error("unsupported Codex config layer");
  }
  return {
    status: "available",
    layers,
  };
}

function isInitializeResponse(value) {
  return (
    hasOnlyKeys(value, ["userAgent", "codexHome", "platformFamily", "platformOs"]) &&
    isNonEmptyString(value.userAgent) &&
    isNonEmptyString(value.codexHome) &&
    isNonEmptyString(value.platformFamily) &&
    isNonEmptyString(value.platformOs)
  );
}

function parseConfigLayer(layer) {
  if (
    !hasOnlyKeys(layer, ["name", "version", "config", "disabledReason"]) ||
    !isConfigLayerSource(layer.name) ||
    !isConfigLayerVersion(layer.version) ||
    !Object.hasOwn(layer, "config") ||
    !(layer.disabledReason === undefined || layer.disabledReason === null || typeof layer.disabledReason === "string")
  ) {
    return null;
  }
  return {
    name: { ...layer.name },
    version: layer.version,
    config: layer.config,
    ...(Object.hasOwn(layer, "disabledReason") ? { disabledReason: layer.disabledReason } : {}),
  };
}

function isConfigLayerMetadata(value) {
  return (
    hasOnlyKeys(value, ["name", "version"]) &&
    isConfigLayerSource(value.name) &&
    isConfigLayerVersion(value.version)
  );
}

function isConfigLayerVersion(value) {
  return typeof value === "string" && CONFIG_LAYER_VERSION.test(value);
}

function isConfigLayerSource(source) {
  if (!isObject(source) || !isNonEmptyString(source.type)) return false;
  switch (source.type) {
    case "packagedDefaults":
    case "system":
    case "legacyManagedConfigTomlFromFile":
      return hasOnlyKeys(source, ["type", "file"]) && isNonEmptyString(source.file);
    case "mdm":
      return hasOnlyKeys(source, ["type", "domain", "key"]) && isNonEmptyString(source.domain) && isNonEmptyString(source.key);
    case "enterpriseManaged":
      return hasOnlyKeys(source, ["type", "id", "name"]) && isNonEmptyString(source.id) && isNonEmptyString(source.name);
    case "user":
      return (
        hasOnlyKeys(source, ["type", "file", "profile"]) &&
        isNonEmptyString(source.file) &&
        Object.hasOwn(source, "profile") &&
        (source.profile === null || isNonEmptyString(source.profile))
      );
    case "project":
      return hasOnlyKeys(source, ["type", "dotCodexFolder"]) && isNonEmptyString(source.dotCodexFolder);
    case "sessionFlags":
    case "legacyManagedConfigTomlFromMdm":
      return hasOnlyKeys(source, ["type"]);
    default:
      return false;
  }
}

/**
 * @param {{scope: "project" | "global", codexHome: string, projectRoot: string, layerState: object}} options
 */
export function codexDestination({ scope, codexHome, projectRoot, layerState }) {
  if (
    scope === "project" &&
    layerState?.status === "available" &&
    hasTrustedProjectLayer(layerState.layers, projectRoot)
  ) {
    return { path: join(projectRoot, ".codex", "rules", "moe-smoothing.rules"), scope, restartRequired: true };
  }
  if (scope === "global" && layerState?.status === "available" && hasEnabledUserLayer(layerState.layers)) {
    return { path: join(codexHome, "rules", "moe-smoothing.rules"), scope: "global", restartRequired: true };
  }
  return null;
}

function hasTrustedProjectLayer(layers, projectRoot) {
  return Array.isArray(layers) && layers.some((layer) => {
    const parsed = parseConfigLayer(layer);
    return (
      parsed?.name.type === "project" &&
      parsed.disabledReason == null &&
      parsed.name.dotCodexFolder === join(projectRoot, ".codex")
    );
  });
}

function hasEnabledUserLayer(layers) {
  return Array.isArray(layers) && layers.some((layer) => {
    const parsed = parseConfigLayer(layer);
    return parsed?.name.type === "user" && parsed.disabledReason == null;
  });
}

/** Return every enabled native rules directory named by a protocol-validated layer. */
export function codexRuleDirectories(layerState) {
  if (layerState?.status !== "available" || !Array.isArray(layerState.layers)) return [];
  const directories = [];
  for (const layer of layerState.layers) {
    const parsed = parseConfigLayer(layer);
    if (!parsed || parsed.disabledReason != null) continue;
    if (parsed.name.type === "project") {
      directories.push(join(parsed.name.dotCodexFolder, "rules"));
    } else if (isNonEmptyString(parsed.name.file)) {
      directories.push(join(dirname(parsed.name.file), "rules"));
    }
  }
  return [...new Set(directories)];
}

function matchesPrefix(operation, prefixes) {
  const command = operation.argv ?? conservativeTokens(operation.command);
  return Array.isArray(command) && prefixes.some((prefix) => prefix.every((part, index) => command[index] === part));
}

function conservativeTokens(command) {
  if (typeof command !== "string" || !command || /[;|&$><`\\"']/.test(command)) return null;
  return command.split(/\s+/);
}

function validPrefix(prefix) {
  return Array.isArray(prefix) && prefix.length > 0 && prefix.every(isNonEmptyString);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value, allowed) {
  return isObject(value) && Object.keys(value).every((key) => allowed.includes(key));
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

/**
 * Render a literal-only prefix rule for the two suffix-safe Codex catalog
 * entries. Passing explicit layer state also binds rendering to a proven
 * destination; callers that only need a canonical body may omit it.
 *
 * @param {object} candidate
 * @param {object} [context]
 */
export function renderCodexPermission(candidate, context = {}) {
  if (!isNonEmptyString(candidate?.id)) return null;
  const canonical = codexPermissionBody(candidate, context);
  if (!canonical) return null;
  const projectRoot = candidate.projectRoot ?? context.projectRoot;
  const layerState = candidate.layerState ?? context.layerState;
  const codexHome = candidate.codexHome ?? context.codexHome;
  if (
    candidate.scope === "project" && !isNonEmptyString(projectRoot) ||
    candidate.scope === "global" && !isNonEmptyString(codexHome)
  ) {
    return null;
  }
  const destination = codexDestination({
    scope: candidate.scope,
    codexHome,
    projectRoot,
    layerState,
  });
  if (!destination) return null;

  const rule = `# moe-smoothing:${candidate.id}\n${canonical.rule}`;
  return {
    ...candidate,
    operation: canonical.operation,
    rule,
    destination: destination.path,
    restartRequired: true,
  };
}

/**
 * Produce the metadata-free rule body used to group observed operations by
 * the authority they would grant. This helper deliberately performs no layer
 * or destination decision; only renderCodexPermission may produce a selectable
 * candidate.
 *
 * @param {object} candidate
 * @param {object} [context]
 */
export function renderCodexPermissionBody(candidate, context = {}) {
  return codexPermissionBody(candidate, context)?.rule ?? null;
}

function codexPermissionBody(candidate, context = {}) {
  if (!isObject(candidate) || candidate.harness && candidate.harness !== "codex") return null;
  if (candidate.class !== "shell" || !["project", "global"].includes(candidate.scope)) return null;
  const classified = classifyShell(candidate.operation, {
    harness: "codex",
    projectRoot: candidate.projectRoot ?? context.projectRoot ?? "",
    realpath: context.realpath,
  });
  if (!classified.eligible) return null;
  const command = classified.normalized.argv.slice(0, 2).join(" ");
  const catalog = PROJECT_SHELL_CATALOG.get(command);
  if (!catalog?.suffixSafe) return null;
  if (candidate.scope === "global" && !GLOBAL_SHELL_CATALOG.has(command)) return null;
  const pattern = catalog.prefix.map((token) => JSON.stringify(token)).join(", ");
  return {
    operation: classified.normalized,
    rule: `prefix_rule(\n    pattern = [${pattern}],\n    decision = "allow",\n    justification = "Moe smoothing: repeated safe use",\n)\n`,
  };
}

/**
 * Append selected Moe-owned blocks in stable-ID order while preserving an
 * unrelated existing rule file byte-for-byte apart from normalized trailing
 * newlines at the append boundary.
 *
 * @param {string} sourceContents
 * @param {{id: string, rule: string}[]} selected
 */
export function renderCodexRules(sourceContents, selected) {
  if (typeof sourceContents !== "string" || !Array.isArray(selected)) {
    throw new TypeError("Codex rule source and selected blocks are required");
  }
  const byId = new Map();
  for (const entry of selected) {
    if (!isNonEmptyString(entry?.id) || !isNonEmptyString(entry?.rule)) {
      throw new TypeError("selected Codex blocks require IDs and rules");
    }
    if (!entry.rule.startsWith(`# moe-smoothing:${entry.id}\n`)) {
      throw new TypeError("Codex block marker does not match its ID");
    }
    byId.set(entry.id, entry.rule.trimEnd());
  }
  const sections = [
    sourceContents.trimEnd(),
    ...[...byId].sort(([left], [right]) => compareCodeUnits(left, right)).map(([, rule]) => rule),
  ].filter(Boolean);
  return sections.length === 0 ? "" : `${sections.join("\n\n")}\n`;
}

/**
 * Classify shell evidence against every active native Codex rule before
 * candidate construction. The input remains untouched, duplicate witnesses
 * are evaluated once, and an unavailable or drifting execpolicy result rejects
 * this adapter rather than manufacturing permission provenance.
 *
 * @param {object} options
 */
export async function classifyCodexActiveRules({
  evidence,
  ruleFiles,
  codexBin = "codex",
  runExecpolicy = runExecpolicyFile,
  timeoutMs = 2000,
}) {
  if (!Array.isArray(evidence)) throw new TypeError("Codex evidence must be an array");
  if (!Array.isArray(ruleFiles) || !ruleFiles.every(isNonEmptyString)) {
    throw new TypeError("Codex rule files must contain paths");
  }
  if (ruleFiles.length === 0) return [...evidence];

  const decisions = new Map();
  for (const record of evidence) {
    if (record?.class !== "shell") continue;
    const argv = record.operation?.argv ?? conservativeTokens(record.operation?.command);
    if (!Array.isArray(argv) || argv.length === 0 || !argv.every(isNonEmptyString)) continue;
    const key = JSON.stringify(argv);
    if (decisions.has(key)) continue;
    const result = await inspectCodexDecision({
      ruleFiles,
      argv,
      codexBin,
      runExecpolicy,
      timeoutMs,
    });
    decisions.set(key, result.decision);
  }

  return evidence.map((record) => {
    if (record?.class !== "shell") return record;
    const argv = record.operation?.argv ?? conservativeTokens(record.operation?.command);
    if (!Array.isArray(argv)) return record;
    const decision = decisions.get(JSON.stringify(argv));
    return ["allow", "prompt", "forbidden"].includes(decision)
      ? { ...record, approvalProvenance: "existing-rule" }
      : record;
  });
}

/**
 * Run one execpolicy check and accept only the currently recognized JSON
 * result schema. Unknown fields and malformed match records fail closed.
 *
 * @param {object} options
 */
export async function inspectCodexDecision({
  ruleFiles,
  argv,
  codexBin = "codex",
  runExecpolicy = runExecpolicyFile,
  timeoutMs = 2000,
}) {
  if (!Array.isArray(ruleFiles) || !ruleFiles.every(isNonEmptyString)) {
    throw new TypeError("Codex rule files must contain paths");
  }
  if (!Array.isArray(argv) || argv.length === 0 || !argv.every(isNonEmptyString)) {
    throw new TypeError("Codex witness argv is required");
  }
  const args = [
    "execpolicy",
    "check",
    ...ruleFiles.flatMap((path) => ["--rules", path]),
    "--",
    ...argv,
  ];
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError("Codex execpolicy timeout must be a positive integer");
  }
  const output = await boundedExecpolicy(
    () => runExecpolicy(codexBin, args, { timeoutMs }),
    timeoutMs,
  );
  const parsed = parseExecpolicyOutput(output);
  if (!isRecognizedDecision(parsed)) throw new Error("unsupported execpolicy output");
  return {
    decision: parsed.decision ?? "not_match",
    matchedRules: parsed.matchedRules,
  };
}

function runExecpolicyFile(codexBin, args, { timeoutMs = 2000 } = {}) {
  return new Promise((resolveRun, reject) => {
    execFile(codexBin, args, { encoding: "utf8", maxBuffer: MAX_JSON_LINE_BYTES, timeout: timeoutMs }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`codex execpolicy failed: ${stderr || error.message}`));
      } else {
        resolveRun({ stdout });
      }
    });
  });
}

function boundedExecpolicy(run, timeoutMs) {
  let timer;
  return Promise.race([
    Promise.resolve().then(run),
    new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error("Codex execpolicy timed out")),
        timeoutMs,
      );
    }),
  ]).finally(() => clearTimeout(timer));
}

function parseExecpolicyOutput(output) {
  if (isObject(output) && Object.hasOwn(output, "stdout")) return parseJson(output.stdout);
  if (typeof output === "string" || Buffer.isBuffer(output)) return parseJson(output.toString());
  return output;
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isRecognizedDecision(value) {
  if (!isObject(value)) return false;
  if (Object.keys(value).some((key) => !["matchedRules", "decision"].includes(key))) return false;
  if (!Array.isArray(value.matchedRules) || !value.matchedRules.every(isRecognizedMatch)) return false;
  if (value.decision === undefined) return value.matchedRules.length === 0;
  if (!["allow", "prompt", "forbidden"].includes(value.decision)) return false;
  return value.matchedRules.length > 0;
}

function isRecognizedMatch(match) {
  if (!isObject(match) || Object.keys(match).length !== 1 || !isObject(match.prefixRuleMatch)) {
    return false;
  }
  const value = match.prefixRuleMatch;
  if (
    Object.keys(value).some(
      (key) => !["matchedPrefix", "decision", "justification"].includes(key),
    ) ||
    !Array.isArray(value.matchedPrefix) ||
    value.matchedPrefix.length === 0 ||
    !value.matchedPrefix.every(isNonEmptyString) ||
    !["allow", "prompt", "forbidden"].includes(value.decision)
  ) {
    return false;
  }
  return value.justification === undefined || typeof value.justification === "string";
}

/**
 * Validate a complete replacement using positive and adjacent negative
 * witnesses, then remove the temporary rule file regardless of outcome.
 *
 * @param {object} options
 */
export async function validateCodexReplacement({
  contents,
  ruleFiles,
  witnesses,
  codexBin = "codex",
  tempDir,
  runExecpolicy = runExecpolicyFile,
  fsOps = { writeFile, unlink },
}) {
  if (typeof contents !== "string" || !isNonEmptyString(tempDir)) {
    throw new TypeError("Codex replacement contents and temporary directory are required");
  }
  const normalizedWitnesses = normalizeWitnesses(witnesses);
  const byRule = Map.groupBy(normalizedWitnesses, ({ ruleId }) => ruleId);
  const validationPaths = [];
  try {
    for (const [ruleId, ruleWitnesses] of [...byRule].sort(([left], [right]) => compareCodeUnits(left, right))) {
      const validationPath = temporaryRulePath(tempDir);
      validationPaths.push(validationPath);
      await fsOps.writeFile(validationPath, extractSelectedRule(contents, ruleId), {
        flag: "wx",
        mode: 0o600,
      });
      await validateWitnessSet({
        ruleFiles: [validationPath],
        witnesses: ruleWitnesses,
        codexBin,
        runExecpolicy,
      });
    }

    const replacementPath = temporaryRulePath(tempDir);
    validationPaths.push(replacementPath);
    await fsOps.writeFile(replacementPath, contents, { flag: "wx", mode: 0o600 });
    await validateWitnessSet({
      ruleFiles: [...ruleFiles, replacementPath],
      witnesses: normalizedWitnesses,
      codexBin,
      runExecpolicy,
    });
  } finally {
    for (const validationPath of validationPaths.reverse()) {
      try {
        await fsOps.unlink(validationPath);
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
  }
}

function temporaryRulePath(tempDir) {
  const validationPath = resolve(tempDir, `moe-smoothing-${randomUUID()}.rules`);
  const relativePath = relative(resolve(tempDir), validationPath);
  if (relativePath.startsWith("..") || relativePath.startsWith("/")) {
    throw new Error("Codex validation path escaped its temporary directory");
  }
  return validationPath;
}

const RENDERED_PREFIX_RULE = /^prefix_rule\(\n    pattern = \["(?:\\.|[^"\\])*"(?:, "(?:\\.|[^"\\])*")*\],\n    decision = "allow",\n    justification = "Moe smoothing: repeated safe use",\n\)\n/;

function extractSelectedRule(contents, ruleId) {
  const marker = `# moe-smoothing:${ruleId}\n`;
  const markerIndex = contents.indexOf(marker);
  if (markerIndex < 0 || contents.indexOf(marker, markerIndex + marker.length) >= 0) {
    throw new Error(`selected Codex rule ${ruleId} is missing or duplicated`);
  }
  const body = RENDERED_PREFIX_RULE.exec(contents.slice(markerIndex + marker.length))?.[0];
  if (!body) throw new Error(`selected Codex rule ${ruleId} is malformed`);
  return `${marker}${body}`;
}

function normalizeWitnesses(witnesses) {
  if (!Array.isArray(witnesses) || witnesses.length === 0) {
    throw new TypeError("Codex validation witnesses are required");
  }
  const normalized = witnesses.map((witness) => {
    if (
      !isObject(witness) ||
      !isNonEmptyString(witness.ruleId) ||
      !Array.isArray(witness.argv) ||
      witness.argv.length === 0 ||
      !witness.argv.every(isNonEmptyString) ||
      !["match", "not_match"].includes(witness.expectation)
    ) {
      throw new TypeError("invalid Codex validation witness");
    }
    return {
      ruleId: witness.ruleId,
      argv: [...witness.argv],
      expectation: witness.expectation,
    };
  });
  for (const ruleWitnesses of Map.groupBy(normalized, ({ ruleId }) => ruleId).values()) {
    const positives = ruleWitnesses.filter(({ expectation }) => expectation === "match");
    const negatives = ruleWitnesses.filter(({ expectation }) => expectation === "not_match");
    if (
      positives.length === 0 ||
      negatives.length === 0 ||
      !negatives.some((negative) =>
        positives.some(
          (positive) =>
            positive.argv[0] === negative.argv[0] &&
            (positive.argv.length !== negative.argv.length ||
              positive.argv.some((token, index) => token !== negative.argv[index])),
        ),
      )
    ) {
      throw new TypeError("Codex validation requires positive and adjacent negative witnesses");
    }
  }
  return normalized;
}

async function validateWitnessSet({ ruleFiles, witnesses, codexBin, runExecpolicy }) {
  for (const witness of witnesses) {
    const result = await inspectCodexDecision({
      ruleFiles,
      argv: witness.argv,
      codexBin,
      runExecpolicy,
    });
    if (witness.expectation === "match" && result.decision !== "allow") {
      throw new Error("Codex positive witness did not match the proposed rule");
    }
    if (witness.expectation === "not_match" && result.decision !== "not_match") {
      throw new Error("Codex negative witness matched the proposed rule");
    }
  }
}

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
