import { readFile, readdir, realpath, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { makeEvidence } from "../evidence.mjs";

const MAX_JSON_LINE_BYTES = 1024 * 1024;

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
  if (value?.status === "denied" || value?.status === "rejected") return "denied";
  if (value?.exit_code === 0 || ["completed", "success", "succeeded"].includes(value?.status)) return "success";
  if (typeof value?.exit_code === "number" || ["failed", "error"].includes(value?.status)) return "failed";
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
  if (!Array.isArray(prefixes)) return;
  state.capturedPrefixes ??= [];
  for (const prefix of prefixes) {
    if (Array.isArray(prefix) && prefix.length > 0 && prefix.every(isNonEmptyString)) {
      state.capturedPrefixes.push(prefix);
    }
  }
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
  const prefixes = [...existingPrefixes, ...state.capturedPrefixes].filter(validPrefix);
  const evidence = [];
  for (const event of decoded) {
    if (!event.cwd) {
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
      evidence.push(makeEvidence({
        harness: "codex",
        rootSessionId: roots.get(event.sessionId) ?? event.sessionId,
        projectRoot,
        observedAt: event.observedAt,
        class: event.class,
        operation: event.operation,
        outcome: event.outcome,
        approvalProvenance: matchesPrefix(event.operation, prefixes) ? "existing-rule" : "unknown",
        sourceSchema: event.sourceSchema,
      }));
    } catch {
      diagnostics.push({ kind: "invalid-decoded-evidence" });
    }
  }
  for (const header of state.headers) {
    if (header.cliVersion) diagnostics.push({ cliVersion: header.cliVersion });
  }
  return { evidence, diagnostics };
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
    await client.request({ id: 1, method: "initialize", params: { clientInfo: { name: "moe-smoothing", version: "1" }, capabilities: {} } });
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
          child.stdin.write(`${JSON.stringify(message)}\n`);
        } catch (error) {
          clearTimeout(timer);
          pending.delete(message.id);
          reject(error);
        }
      });
    },
  };
}

function parseEnabledLayers(response) {
  const layers = Array.isArray(response?.layers) ? response.layers.filter(isObject) : [];
  const trustedProjectRoots = layers
    .filter((layer) => layer.scope === "project" && layer.enabled === true && layer.trusted === true && typeof layer.root === "string")
    .map((layer) => layer.root);
  return {
    status: "available",
    layers: layers.map((layer) => ({ scope: layer.scope, enabled: layer.enabled === true, trusted: layer.trusted === true, root: layer.root })).filter((layer) => typeof layer.scope === "string"),
    trustedProjectRoots,
    userLayerEnabled: layers.some((layer) => layer.scope === "user" && layer.enabled === true),
  };
}

/**
 * @param {{scope: "project" | "global", codexHome: string, projectRoot: string, layerState: object}} options
 */
export function codexDestination({ scope, codexHome, projectRoot, layerState }) {
  if (
    scope === "project" &&
    layerState?.status === "available" &&
    layerState.trustedProjectRoots?.includes(projectRoot)
  ) {
    return { path: join(projectRoot, ".codex", "rules", "moe-smoothing.rules"), scope, restartRequired: true };
  }
  if (scope === "global" && layerState?.status === "available" && layerState.userLayerEnabled) {
    return { path: join(codexHome, "rules", "moe-smoothing.rules"), scope: "global", restartRequired: true };
  }
  return null;
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

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}
