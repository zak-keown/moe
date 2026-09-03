#!/usr/bin/env node
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// packages/crew/src/cli.ts
var cli_exports = {};
__export(cli_exports, {
  followStream: () => followStream,
  grantConsentConfirm: () => grantConsentConfirm,
  readLine: () => readLine,
  run: () => run2
});
module.exports = __toCommonJS(cli_exports);
var import_node_os4 = require("os");
var import_node_path11 = require("path");
var import_node_readline = require("readline");

// packages/crew/src/commands/adopt.ts
var import_node_fs6 = require("fs");
var import_node_path8 = require("path");

// packages/crew/src/core/consent.ts
var import_node_fs = require("fs");
var import_node_path = require("path");
function consentPath(home) {
  return `${home}/.claude/.moe-crew-consent`;
}
function hasConsent(home) {
  return (0, import_node_fs.existsSync)(consentPath(home));
}
function grantConsent(home) {
  const p = consentPath(home);
  (0, import_node_fs.mkdirSync)((0, import_node_path.dirname)(p), { recursive: true });
  (0, import_node_fs.writeFileSync)(p, "");
}

// packages/crew/src/core/paths.ts
var import_node_os = require("os");
var import_node_path2 = require("path");
function defaultWorkerDir() {
  const xdgRuntimeDir = process.env.XDG_RUNTIME_DIR;
  if (xdgRuntimeDir) return (0, import_node_path2.join)(xdgRuntimeDir, "moe-crew-workers");
  return (0, import_node_path2.join)((0, import_node_os.homedir)(), ".local", "state", "moe-crew", "workers");
}
function workerDir() {
  return process.env.MOE_CREW_WORKER_DIR ?? defaultWorkerDir();
}
function eventsPath(dir, sid) {
  return `${dir}/${sid}.events.jsonl`;
}
function metaPath(dir, sid) {
  return `${dir}/${sid}.meta`;
}
function assertSafeSegment(name) {
  if (!/^[A-Za-z0-9_-]+$/.test(name)) {
    throw new Error(
      `unsafe worker name (must be a single [A-Za-z0-9_-]+ segment): ${JSON.stringify(name)}`
    );
  }
}
function shimPath(dir, name) {
  assertSafeSegment(name);
  return `${dir}/bin/${name}`;
}
function workerHomePath(dir, name) {
  assertSafeSegment(name);
  return `${dir}/homes/${name}`;
}
function harnessMarkerPath(dir, name) {
  assertSafeSegment(name);
  return `${dir}/${name}.harness`;
}
function worktreeMarkerPath(dir, name) {
  assertSafeSegment(name);
  return `${dir}/${name}.worktree`;
}
function claudeTranscriptPath(home, cwd, sid) {
  return `${home}/.claude/projects/${cwd.replace(/[/._:]/g, "-")}/${sid}.jsonl`;
}

// packages/crew/src/core/time.ts
function isoSecondsUtc(date = /* @__PURE__ */ new Date()) {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

// packages/crew/src/core/worker-store.ts
var import_node_fs2 = require("fs");
var import_node_path3 = require("path");
function ensureOwnedDir(dir) {
  let st;
  try {
    st = (0, import_node_fs2.lstatSync)(dir);
  } catch {
    (0, import_node_fs2.mkdirSync)(dir, { recursive: true, mode: 448 });
    return;
  }
  if (!st.isDirectory()) {
    throw new Error(`refusing to use ${dir}: not a real directory (possibly a planted symlink)`);
  }
  const uid = process.getuid?.();
  if (uid !== void 0 && st.uid !== uid) {
    throw new Error(`refusing to use ${dir}: not owned by the current user`);
  }
}
function stageCredentialFile(src, dest) {
  if (!(0, import_node_fs2.existsSync)(src)) return;
  const data = (0, import_node_fs2.readFileSync)(src);
  try {
    (0, import_node_fs2.unlinkSync)(dest);
  } catch {
  }
  const fd = (0, import_node_fs2.openSync)(
    dest,
    import_node_fs2.constants.O_WRONLY | import_node_fs2.constants.O_CREAT | import_node_fs2.constants.O_EXCL | import_node_fs2.constants.O_NOFOLLOW,
    384
  );
  try {
    (0, import_node_fs2.writeSync)(fd, data);
  } finally {
    (0, import_node_fs2.closeSync)(fd);
  }
}
function writeMeta(dir, meta) {
  (0, import_node_fs2.mkdirSync)(dir, { recursive: true });
  (0, import_node_fs2.writeFileSync)(metaPath(dir, meta.session_id), JSON.stringify(meta));
}
function readMeta(dir, sid) {
  const p = metaPath(dir, sid);
  if (!(0, import_node_fs2.existsSync)(p)) return null;
  try {
    return JSON.parse((0, import_node_fs2.readFileSync)(p, "utf8"));
  } catch {
    return null;
  }
}
function listWorkers(dir) {
  if (!(0, import_node_fs2.existsSync)(dir)) return [];
  return (0, import_node_fs2.readdirSync)(dir).filter((f) => f.endsWith(".meta")).flatMap((f) => {
    const sid = f.slice(0, -".meta".length);
    const meta = readMeta(dir, sid);
    return meta !== null ? [meta] : [];
  });
}
function resolveSession(dir, arg) {
  if ((0, import_node_fs2.existsSync)(metaPath(dir, arg)) || (0, import_node_fs2.existsSync)(eventsPath(dir, arg))) {
    return arg;
  }
  const match = listWorkers(dir).find((m) => m.tmux_name === arg);
  return match?.session_id ?? null;
}
function writeShim(dir, name, moeCrewEntry) {
  const p = shimPath(dir, name);
  (0, import_node_fs2.mkdirSync)((0, import_node_path3.dirname)(p), { recursive: true });
  const content = `#!/usr/bin/env bash
exec node "${moeCrewEntry}" --worker "${name}" "$@"
`;
  (0, import_node_fs2.writeFileSync)(p, content);
  (0, import_node_fs2.chmodSync)(p, 493);
  return p;
}
function writeHarnessMarker(dir, name, harness) {
  (0, import_node_fs2.mkdirSync)(dir, { recursive: true });
  (0, import_node_fs2.writeFileSync)(harnessMarkerPath(dir, name), harness);
}
function readHarnessMarker(dir, name) {
  const p = harnessMarkerPath(dir, name);
  if (!(0, import_node_fs2.existsSync)(p)) return null;
  try {
    return (0, import_node_fs2.readFileSync)(p, "utf8").trim() || null;
  } catch {
    return null;
  }
}
function writeWorktreeMarker(dir, name, wtPath) {
  (0, import_node_fs2.mkdirSync)(dir, { recursive: true });
  (0, import_node_fs2.writeFileSync)(worktreeMarkerPath(dir, name), wtPath);
}
function readWorktreeMarker(dir, name) {
  const p = worktreeMarkerPath(dir, name);
  if (!(0, import_node_fs2.existsSync)(p)) return null;
  try {
    return (0, import_node_fs2.readFileSync)(p, "utf8").trim() || null;
  } catch {
    return null;
  }
}
function removeWorker(dir, sid, name) {
  (0, import_node_fs2.rmSync)(metaPath(dir, sid), { force: true });
  (0, import_node_fs2.rmSync)(eventsPath(dir, sid), { force: true });
  (0, import_node_fs2.rmSync)(shimPath(dir, name), { force: true });
  (0, import_node_fs2.rmSync)(harnessMarkerPath(dir, name), { force: true });
  (0, import_node_fs2.rmSync)(worktreeMarkerPath(dir, name), { force: true });
  (0, import_node_fs2.rmSync)(workerHomePath(dir, name), { recursive: true, force: true });
}
function listOrphanNames(dir) {
  const registered = new Set(listWorkers(dir).map((m) => m.tmux_name));
  const names = /* @__PURE__ */ new Set();
  if ((0, import_node_fs2.existsSync)(dir)) {
    for (const f of (0, import_node_fs2.readdirSync)(dir)) {
      if (f.endsWith(".harness")) names.add(f.slice(0, -".harness".length));
      if (f.endsWith(".worktree")) names.add(f.slice(0, -".worktree".length));
    }
  }
  const bin = (0, import_node_path3.join)(dir, "bin");
  if ((0, import_node_fs2.existsSync)(bin)) {
    for (const f of (0, import_node_fs2.readdirSync)(bin)) names.add(f);
  }
  return [...names].filter((n) => !registered.has(n));
}
function removeOrphan(dir, name) {
  (0, import_node_fs2.rmSync)(shimPath(dir, name), { force: true });
  (0, import_node_fs2.rmSync)(harnessMarkerPath(dir, name), { force: true });
  (0, import_node_fs2.rmSync)(worktreeMarkerPath(dir, name), { force: true });
  (0, import_node_fs2.rmSync)(workerHomePath(dir, name), { recursive: true, force: true });
}

// packages/crew/src/core/tool-name.ts
function canonicalToolName(name) {
  if (typeof name !== "string" || name.length === 0) return "";
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// packages/crew/src/core/transcript.ts
var COMMAND_PREFIX = /^<(local-command|command-name)/;
var NO_OUTPUT = "(no output)";
function parseLines(jsonl) {
  const out = [];
  for (const line of jsonl.split("\n")) {
    if (line.length === 0) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
    }
  }
  return out;
}
function isPromptBoundary(line) {
  if (line.type !== "user") return false;
  const content = line.message?.content;
  return typeof content === "string" && !COMMAND_PREFIX.test(content);
}
function findBoundary(lines) {
  for (let i = lines.length - 1; i >= 0; i--) {
    if (isPromptBoundary(lines[i])) return i;
  }
  return -1;
}
function resultContent(content) {
  if (content === null || content === void 0) return NO_OUTPUT;
  return String(content);
}
function asBlock(x) {
  return typeof x === "object" && x !== null ? x : null;
}
function collectUser(line, out) {
  const content = line.message?.content;
  if (typeof content === "string") {
    if (!COMMAND_PREFIX.test(content)) out.push({ kind: "prompt", text: content });
    return;
  }
  if (!Array.isArray(content)) return;
  for (const raw of content) {
    const block = asBlock(raw);
    if (!block) continue;
    if (block.type !== "tool_result") continue;
    out.push({
      kind: "tool_result",
      content: resultContent(block.content),
      isError: Boolean(block.is_error)
    });
  }
}
function collectAssistant(line, out) {
  const content = line.message?.content;
  if (!Array.isArray(content)) return;
  for (const raw of content) {
    const block = asBlock(raw);
    if (!block) continue;
    if (block.type === "thinking") {
      const text = typeof block.thinking === "string" ? block.thinking : "";
      out.push({ kind: "thinking", text });
    } else if (block.type === "text") {
      const text = typeof block.text === "string" ? block.text : "";
      out.push({ kind: "text", text });
    } else if (block.type === "tool_use") {
      const name = typeof block.name === "string" ? block.name : "";
      out.push({
        kind: "tool_use",
        name,
        input: block.input
      });
    }
  }
}
function parseClaudeTurn(jsonl) {
  const lines = parseLines(jsonl);
  const boundary = findBoundary(lines);
  if (boundary < 0) return [];
  const turn = [];
  for (const line of lines.slice(boundary)) {
    if (line.type === "user") collectUser(line, turn);
    else if (line.type === "assistant") collectAssistant(line, turn);
  }
  return turn;
}
function parseRolloutLines(jsonl) {
  const out = [];
  for (const line of jsonl.split("\n")) {
    if (line.length === 0) continue;
    try {
      const parsed = JSON.parse(line);
      if (typeof parsed === "object" && parsed !== null) {
        out.push(parsed);
      }
    } catch {
    }
  }
  return out;
}
function asPayload(line) {
  if (line.type !== "response_item") return null;
  const p = line.payload;
  return typeof p === "object" && p !== null ? p : null;
}
function messageText(content) {
  if (!Array.isArray(content)) return "";
  return content.map((raw) => {
    const block = asBlock(raw);
    if (!block) return "";
    if (typeof block.text === "string") return block.text;
    const out = block.output_text;
    return typeof out === "string" ? out : "";
  }).join("");
}
function reasoningText(summary) {
  if (!Array.isArray(summary)) return "";
  return summary.map((raw) => {
    if (typeof raw === "string") return raw;
    const block = asBlock(raw);
    return block && typeof block.text === "string" ? block.text : "";
  }).join(" ");
}
function findCodexBoundary(lines) {
  for (let i = lines.length - 1; i >= 0; i--) {
    const p = asPayload(lines[i]);
    if (p && p.type === "message" && p.role === "user") return i;
  }
  return 0;
}
var CODEX_TOOL_NAMES = {
  exec_command: "Bash"
};
function canonicalCodexTool(name) {
  return CODEX_TOOL_NAMES[name] ?? name;
}
function collapseCodexResult(text) {
  const marker = "\nOutput:\n";
  const idx = text.indexOf(marker);
  if (idx === -1) return text;
  const header = text.slice(0, idx);
  const exit = header.match(/(?:Process exited with code|Exit code:) (\S+)/);
  if (!exit) return text;
  const wall = header.match(/Wall time:\s*(\S+)\s*seconds/);
  const status = wall ? `exited ${exit[1]} \xB7 ${wall[1]}s` : `exited ${exit[1]}`;
  return `${status}
${text.slice(idx + marker.length)}`;
}
function parseCodexTurn(jsonl) {
  const lines = parseRolloutLines(jsonl);
  if (lines.length === 0) return [];
  const boundary = findCodexBoundary(lines);
  const turn = [];
  for (const line of lines.slice(boundary)) {
    const p = asPayload(line);
    if (!p) continue;
    if (p.type === "message") {
      const text = messageText(p.content);
      if (p.role === "user") turn.push({ kind: "prompt", text });
      else turn.push({ kind: "text", text });
    } else if (p.type === "reasoning") {
      turn.push({ kind: "thinking", text: reasoningText(p.summary) });
    } else if (p.type === "function_call" || p.type === "custom_tool_call") {
      const name = canonicalCodexTool(typeof p.name === "string" ? p.name : "");
      const input = p.type === "custom_tool_call" ? p.input : p.arguments;
      turn.push({ kind: "tool_use", name, input });
    } else if (p.type === "function_call_output" || p.type === "custom_tool_call_output") {
      turn.push({
        kind: "tool_result",
        content: collapseCodexResult(resultContent(p.output)),
        isError: false
      });
    }
  }
  return turn;
}
function parsePiEntries(jsonl) {
  const out = [];
  for (const line of jsonl.split("\n")) {
    if (line.length === 0) continue;
    try {
      const parsed = JSON.parse(line);
      if (typeof parsed === "object" && parsed !== null) {
        out.push(parsed);
      }
    } catch {
    }
  }
  return out;
}
function asPiMessage(entry) {
  if (entry.type !== "message") return null;
  const m = entry.message;
  return typeof m === "object" && m !== null ? m : null;
}
function piContentText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((raw) => {
    const block = asBlock(raw);
    if (block?.type !== "text") return "";
    return typeof block.text === "string" ? block.text : "";
  }).join("");
}
function findPiBoundary(entries) {
  for (let i = entries.length - 1; i >= 0; i--) {
    const m = asPiMessage(entries[i]);
    if (m && m.role === "user") return i;
  }
  return 0;
}
function collectPiAssistant(content, out) {
  if (!Array.isArray(content)) return;
  for (const raw of content) {
    const block = asBlock(raw);
    if (!block) continue;
    if (block.type === "thinking") {
      const text = typeof block.thinking === "string" ? block.thinking : "";
      out.push({ kind: "thinking", text });
    } else if (block.type === "text") {
      const text = typeof block.text === "string" ? block.text : "";
      out.push({ kind: "text", text });
    } else if (block.type === "toolCall") {
      const piBlock = block;
      out.push({
        kind: "tool_use",
        name: canonicalToolName(piBlock.name),
        input: piBlock.arguments
      });
    }
  }
}
function parsePiTurn(jsonl) {
  const entries = parsePiEntries(jsonl);
  if (entries.length === 0) return [];
  const boundary = findPiBoundary(entries);
  const turn = [];
  for (const entry of entries.slice(boundary)) {
    const m = asPiMessage(entry);
    if (!m) continue;
    if (m.role === "user") {
      turn.push({ kind: "prompt", text: piContentText(m.content) });
    } else if (m.role === "assistant") {
      collectPiAssistant(m.content, turn);
    } else if (m.role === "toolResult") {
      turn.push({
        kind: "tool_result",
        content: piContentText(m.content),
        isError: Boolean(m.isError)
      });
    }
  }
  return turn;
}
function compactJson(input) {
  if (typeof input === "string") return input;
  return JSON.stringify(input);
}
function truncate(content) {
  const ls = content.split("\n");
  if (ls.length > 5) {
    return `${ls.slice(0, 5).join("\n")}
... (${ls.length} lines total)`;
  }
  return ls.join("\n");
}
function renderItem(item, full) {
  switch (item.kind) {
    case "prompt":
      return `---

**Prompt:** ${item.text}
`;
    case "thinking":
      if (item.text.trim() === "") return "";
      return `> **Thinking:** ${item.text.split("\n").join("\n> ")}
`;
    case "text":
      return `${item.text}
`;
    case "tool_use":
      return `**Tool: ${item.name}**
\`\`\`json
${compactJson(item.input)}
\`\`\`
`;
    case "tool_result": {
      if (item.isError) {
        return `**Tool Error:**
\`\`\`
${item.content}
\`\`\`
`;
      }
      const body = full ? item.content : truncate(item.content);
      return `**Result:**
\`\`\`
${body}
\`\`\`
`;
    }
  }
}
function renderTurn(turn, opts) {
  return turn.map((item) => `${renderItem(item, opts.full)}
`).join("");
}
function renderTurnForCommand(turn, opts) {
  return renderTurn(turn, opts).replace(/\n$/, "");
}
function assistantText(turn) {
  return turn.filter((item) => item.kind === "text").map((item) => item.text).join("\n");
}

// packages/crew/src/harness/claude.ts
var CLAUDE_PROVIDER_ENV_VARS = [
  "CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST",
  "CLAUDE_CODE_USE_BEDROCK",
  "CLAUDE_CODE_USE_VERTEX",
  "CLAUDE_CODE_USE_FOUNDRY",
  "CLAUDE_CODE_USE_ANTHROPIC_AWS",
  "CLAUDE_CODE_USE_MANTLE"
];
function claudeWorkerEnv(controllerEnv = process.env) {
  const env = {
    CLAUDE_CODE_SSE_PORT: "",
    CLAUDE_CODE_SESSION_ID: "",
    CLAUDE_CODE_CHILD_SESSION: ""
  };
  for (const name of CLAUDE_PROVIDER_ENV_VARS) {
    if (!controllerEnv[name]) env[name] = "";
  }
  return env;
}
var claude = {
  id: "claude",
  controlPlane: "hooks",
  idStrategy: "assign",
  registersIdAtLaunch: true,
  quitKeys: "/exit",
  stopGraceSeconds: 10,
  bin() {
    return process.env.MOE_CREW_CLAUDE_BIN ?? "claude";
  },
  // Claude's worker HOME is the controller HOME, so `workerHome` is ignored;
  // the param exists because codex's env depends on its per-worker CODEX_HOME.
  // `tmuxName` is ignored: claude carries its name in the pre-written meta.
  workerEnv(_workerHome, _tmuxName, controllerEnv = process.env) {
    return claudeWorkerEnv(controllerEnv);
  },
  launchArgv(mode, sessionId, _cwd, pluginDir, _workerHome) {
    const idFlag = mode === "adopt" ? "--resume" : "--session-id";
    return [
      this.bin(),
      idFlag,
      sessionId,
      "--plugin-dir",
      pluginDir,
      "--settings",
      '{"skipDangerousModePermissionPrompt":true}',
      "--dangerously-skip-permissions",
      "--disallowed-tools",
      "AskUserQuestion"
    ];
  },
  // Claude needs no per-worker prep and no post-launch gate dismissal; its
  // trust-dialog and await-session-start orchestration live in the launch
  // command. These slots exist for harnesses (codex/pi) that do need them.
  async prepare(_tmuxName, _cwd, _workerHome) {
  },
  async postLaunch(_tmuxName) {
  },
  async awaitReady(_tmuxName, _sessionId) {
  },
  transcriptPath(sessionId, cwd, workerHome) {
    return claudeTranscriptPath(workerHome, cwd, sessionId);
  },
  parseTurn(transcript) {
    return parseClaudeTurn(transcript);
  }
};

// packages/crew/src/harness/codex.ts
var import_node_fs3 = require("fs");
var import_node_os2 = require("os");
var import_node_path4 = require("path");

// packages/crew/src/core/shell.ts
function shellQuote(token) {
  if (token === "") return "''";
  if (/^[A-Za-z0-9_./:=@-]+$/.test(token)) return token;
  return `'${token.replaceAll("'", "'\\''")}'`;
}
function shellQuoteAlways(token) {
  return `'${token.replaceAll("'", "'\\''")}'`;
}

// packages/crew/src/harness/codex.ts
var CODEX_HOOK_EVENTS = [
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "Stop",
  "SessionEnd"
];
var DEFAULT_MODEL = "gpt-5.5";
function tomlBasicString(value) {
  let out = '"';
  for (const ch of value) {
    switch (ch) {
      case "\\":
        out += "\\\\";
        break;
      case '"':
        out += '\\"';
        break;
      case "\b":
        out += "\\b";
        break;
      case "	":
        out += "\\t";
        break;
      case "\n":
        out += "\\n";
        break;
      case "\f":
        out += "\\f";
        break;
      case "\r":
        out += "\\r";
        break;
      default: {
        const code = ch.codePointAt(0) ?? 0;
        if (code < 32 || code === 127) {
          out += `\\u${code.toString(16).padStart(4, "0")}`;
        } else {
          out += ch;
        }
      }
    }
  }
  return `${out}"`;
}
function emitEventPath() {
  const override = process.env.MOE_CREW_EMIT_EVENT_PATH;
  if (override) return override;
  return (0, import_node_path4.join)(__dirname, "emit-event.cjs");
}
function codexWorkerEnv(workerHome) {
  return { CODEX_HOME: workerHome };
}
function buildCodexConfig(opts) {
  const { cwd, model, hookCommand } = opts;
  const lines = [
    `model = ${tomlBasicString(model)}`,
    // Hardcoded safe literal — no user input, no escaping needed (unlike `model`
    // and `cwd` which go through tomlBasicString because they come from the user).
    'model_reasoning_effort = "low"',
    `[projects.${tomlBasicString(cwd)}]`,
    'trust_level = "trusted"'
  ];
  for (const ev of CODEX_HOOK_EVENTS) {
    lines.push(`[[hooks.${ev}]]`);
    if (ev === "PreToolUse" || ev === "PostToolUse") {
      lines.push('matcher = ".*"');
    }
    lines.push(`[[hooks.${ev}.hooks]]`);
    lines.push('type = "command"');
    lines.push(`command = ${tomlBasicString(hookCommand)}`);
  }
  return `${lines.join("\n")}
`;
}
var codex = {
  id: "codex",
  controlPlane: "hooks",
  idStrategy: "derive",
  registersIdAtLaunch: false,
  quitKeys: "/quit",
  // Codex neither emits session_end nor exits on its quit keys, so the wait is
  // always wasted — kill quickly instead of burning the full backstop.
  stopGraceSeconds: 2,
  bin() {
    return process.env.MOE_CREW_CODEX_BIN ?? "codex";
  },
  // CODEX_HOME is per-worker, so the env genuinely depends on workerHome (unlike
  // claude). `tmuxName` is ignored: codex bakes its name into the hook command
  // args (see prepare), not the env. controllerEnv is unused: codex pins only
  // CODEX_HOME.
  workerEnv(workerHome, _tmuxName, _controllerEnv = process.env) {
    return codexWorkerEnv(workerHome);
  },
  // Codex ignores mode/sid (derive), pluginDir (hooks come via CODEX_HOME), and
  // workerHome (CODEX_HOME is set via env); `-C` sets the workdir.
  launchArgv(_mode, _sessionId, cwd, _pluginDir, _workerHome) {
    return [
      this.bin(),
      "--dangerously-bypass-approvals-and-sandbox",
      "--dangerously-bypass-hook-trust",
      "-C",
      cwd
    ];
  },
  async prepare(tmuxName, cwd, workerHome) {
    ensureOwnedDir(workerHome);
    const auth = (0, import_node_path4.join)((0, import_node_os2.homedir)(), ".codex", "auth.json");
    stageCredentialFile(auth, (0, import_node_path4.join)(workerHome, "auth.json"));
    const hookCommand = [
      "node",
      shellQuoteAlways(emitEventPath()),
      shellQuoteAlways(tmuxName),
      shellQuoteAlways(cwd),
      shellQuoteAlways(workerDir())
    ].join(" ");
    const config = buildCodexConfig({
      cwd,
      model: process.env.MOE_CREW_CODEX_MODEL ?? DEFAULT_MODEL,
      hookCommand
    });
    (0, import_node_fs3.writeFileSync)((0, import_node_path4.join)(workerHome, "config.toml"), config);
  },
  // The trust-gate dismissal needs the tmux pane, which this interface does not
  // pass the driver. Codex's "Hooks need review" gate is dismissed by the launch
  // command's post-launch step (B2/B4); this stays a no-op at the driver level.
  async postLaunch(_tmuxName) {
  },
  // Readiness (poll the pane for the composer glyph) also needs tmux; codex's
  // session_start fires at the first prompt, not boot, so the real wait lives in
  // the launch command (B2/B4). No-op here.
  async awaitReady(_tmuxName, _sessionId) {
  },
  // Codex mints its own session id, so the transcript path is not derivable from
  // (cwd, home): the self-registering hook records it in `<sid>.meta`. We read it
  // back from the worker dir's meta. Returns '' when the meta or field is absent.
  transcriptPath(sessionId, _cwd, _workerHome) {
    const meta = readMeta(workerDir(), sessionId);
    const path = meta?.transcript_path;
    return typeof path === "string" ? path : "";
  },
  parseTurn(transcript) {
    return parseCodexTurn(transcript);
  }
};

// packages/crew/src/harness/pi.ts
var import_node_os3 = require("os");
var import_node_path5 = require("path");
var PI_AUTH_FILES = ["auth.json", "models.json", "settings.json"];
function operatorAgentDir() {
  return process.env.PI_CODING_AGENT_DIR ?? (0, import_node_path5.join)((0, import_node_os3.homedir)(), ".pi", "agent");
}
function piExtensionPath() {
  const override = process.env.MOE_CREW_PI_EXTENSION_PATH;
  if (override) return override;
  return (0, import_node_path5.join)(__dirname, "pi-extension.mjs");
}
function piWorkerEnv(workerHome, tmuxName) {
  return {
    PI_CODING_AGENT_DIR: workerHome,
    MOE_CREW_WORKER_DIR: workerDir(),
    MOE_CREW_TMUX_NAME: tmuxName
  };
}
var pi = {
  id: "pi",
  controlPlane: "extension",
  idStrategy: "derive",
  registersIdAtLaunch: true,
  quitKeys: "/quit",
  stopGraceSeconds: 10,
  bin() {
    return process.env.MOE_CREW_PI_BIN ?? "pi";
  },
  // Pi's env genuinely depends on BOTH workerHome (PI_CODING_AGENT_DIR) and
  // tmuxName (MOE_CREW_TMUX_NAME the extension self-registers the meta with).
  workerEnv(workerHome, tmuxName, _controllerEnv = process.env) {
    return piWorkerEnv(workerHome, tmuxName);
  },
  // Pi ignores mode/sid (derive — it mints its own id, no --session-id flag) and
  // cwd (its tmux session is created in the right cwd by the launch command).
  // The session dir is per-worker (isolated under the worker home); the
  // extension is registered with the `-e` flag. `--model`/`--provider` are
  // OMITTED unless MOE_CREW_PI_MODEL is set, so pi falls back to its configured
  // default model; --provider only rides along when a model is also chosen.
  launchArgv(_mode, _sessionId, _cwd, _pluginDir, workerHome) {
    const argv = [this.bin(), "--session-dir", (0, import_node_path5.join)(workerHome, "sessions")];
    const model = process.env.MOE_CREW_PI_MODEL;
    if (model) {
      argv.push("--model", model);
      const provider = process.env.MOE_CREW_PI_PROVIDER;
      if (provider) argv.push("--provider", provider);
    }
    argv.push("-e", piExtensionPath());
    return argv;
  },
  // Lighter than codex: no per-worker config file (the extension is registered
  // by the `-e` flag, the rest rides in the env). Just ensure the worker home
  // exists and stage the operator's pi credentials so the worker authenticates
  // as them. Best-effort: a missing operator file is skipped, never fatal.
  async prepare(_tmuxName, _cwd, workerHome) {
    ensureOwnedDir(workerHome);
    const agentDir = operatorAgentDir();
    for (const name of PI_AUTH_FILES) {
      stageCredentialFile((0, import_node_path5.join)(agentDir, name), (0, import_node_path5.join)(workerHome, name));
    }
  },
  // Any post-launch fixup needs the tmux pane, which this interface does not
  // pass the driver; pi's launch-time orchestration lives in the launch command
  // (C4). No-op here (mirrors codex).
  async postLaunch(_tmuxName) {
  },
  // Pi's composer/prompt ready signal also needs tmux; the real wait lives in
  // the launch command (C4). No-op here (mirrors codex).
  async awaitReady(_tmuxName, _sessionId) {
  },
  // Pi mints its own session id, so the transcript path is not derivable from
  // (cwd, home): the self-registering extension records it in `<sid>.meta`
  // (`transcript_path` = `getSessionFile()`). We read it back from the worker
  // dir's meta. Returns '' when the meta or field is absent (mirrors codex).
  transcriptPath(sessionId, _cwd, _workerHome) {
    const meta = readMeta(workerDir(), sessionId);
    const path = meta?.transcript_path;
    return typeof path === "string" ? path : "";
  },
  parseTurn(transcript) {
    return parsePiTurn(transcript);
  }
};

// packages/crew/src/harness/registry.ts
var DRIVERS = {
  claude,
  codex,
  pi
};
function getDriver(id) {
  const driver = DRIVERS[id];
  if (!driver) {
    throw new Error(`Unknown harness '${id}'. Available: ${Object.keys(DRIVERS).join(", ")}`);
  }
  return driver;
}

// packages/crew/src/core/event-log.ts
var import_node_fs4 = require("fs");

// packages/crew/src/events.ts
var EVENT_NAMES = [
  "session_start",
  "user_prompt_submit",
  "pre_tool_use",
  "post_tool_use",
  "stop",
  "session_end",
  "run_start",
  "run_end"
];
function parseEvent(line) {
  let v;
  try {
    v = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof v !== "object" || v === null) return null;
  const event = v.event;
  if (typeof event !== "string" || !EVENT_NAMES.includes(event)) return null;
  return v;
}

// packages/crew/src/core/event-log.ts
function readRawLines(file) {
  if (!(0, import_node_fs4.existsSync)(file)) return [];
  return (0, import_node_fs4.readFileSync)(file, "utf8").split("\n").filter((line) => line.length > 0);
}
function lastEvent(file) {
  const lines = readRawLines(file);
  const last = lines.at(-1);
  return last === void 0 ? null : parseEvent(last);
}
function classifyStatus(last) {
  switch (last.event) {
    case "session_end":
      return "terminated";
    case "user_prompt_submit":
    case "pre_tool_use":
    case "post_tool_use":
      return "working";
    case "stop":
    case "session_start":
      return "idle";
    // Run-level envelope events do not change worker status. They should not
    // normally appear as the last event in a per-worker JSONL, but handling
    // them here satisfies the exhaustive switch.
    case "run_start":
    case "run_end":
      return "unknown";
    default: {
      const _exhaustive = last;
      return _exhaustive;
    }
  }
}

// packages/crew/src/commands/await-start.ts
var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
var DEFAULT_TRUST_TIMEOUT_MS = 5e3;
var DEFAULT_START_TIMEOUT_MS = 3e4;
var DEFAULT_POLL_MS = 250;
function sawSessionStart(eventFile) {
  return readRawLines(eventFile).some((line) => parseEvent(line)?.event === "session_start");
}
function paneTail(pane, n) {
  return pane.split("\n").map((line) => line.replace(/\s+$/, "")).filter((line) => line.length > 0).slice(-n).join("\n");
}
async function awaitSessionStart(ctx, tmuxName, sessionId, opts = {}) {
  const trustTimeoutMs = opts.trustTimeoutMs ?? DEFAULT_TRUST_TIMEOUT_MS;
  const startTimeoutMs = opts.startTimeoutMs ?? DEFAULT_START_TIMEOUT_MS;
  const pollMs = opts.pollMs ?? DEFAULT_POLL_MS;
  const eventFile = eventsPath(ctx.workerDir, sessionId);
  const trustDeadline = Date.now() + trustTimeoutMs;
  while (Date.now() < trustDeadline) {
    if (sawSessionStart(eventFile)) break;
    const pane = await ctx.tmux.capturePane(tmuxName);
    if (pane.includes("trust this folder")) {
      await ctx.tmux.sendEnter(tmuxName);
      break;
    }
    await sleep(pollMs);
  }
  const startDeadline = Date.now() + startTimeoutMs;
  while (Date.now() < startDeadline) {
    if (sawSessionStart(eventFile)) {
      return { started: true };
    }
    await sleep(pollMs);
  }
  let tail = "";
  try {
    tail = paneTail(await ctx.tmux.capturePane(tmuxName), 20);
  } catch {
  }
  const lines = ["Error: Worker session failed to start within 30 seconds"];
  if (tail.length > 0) {
    lines.push("", "Last visible content in the worker pane:", "----------", tail, "----------");
  }
  await ctx.tmux.killSession(tmuxName);
  removeWorker(ctx.workerDir, sessionId, tmuxName);
  return { started: false, failureMessage: lines.join("\n") };
}

// packages/crew/src/commands/launch.ts
var import_node_crypto = require("crypto");
var import_node_fs5 = require("fs");
var import_node_path7 = require("path");

// packages/crew/src/core/worktree.ts
var import_node_path6 = require("path");

// packages/crew/src/core/proc.ts
var import_node_child_process = require("child_process");
var run = (cmd, args) => new Promise((resolve2) => {
  (0, import_node_child_process.execFile)(
    cmd,
    args,
    { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
    (err2, stdout, stderr) => {
      if (!err2) {
        resolve2({ stdout, stderr, code: 0 });
        return;
      }
      const errCode = err2.code;
      const code = typeof errCode === "number" ? errCode : 1;
      resolve2({ stdout: stdout ?? "", stderr: stderr || String(err2), code });
    }
  );
});

// packages/crew/src/core/worktree.ts
var WORKTREE_DIR = ".moe-worktrees";
function worktreePath(repoRoot, name) {
  return (0, import_node_path6.join)(repoRoot, WORKTREE_DIR, name);
}
async function createWorktree(runner = run, repoRoot, name, ref = "HEAD") {
  const wt = worktreePath(repoRoot, name);
  const result = await runner("git", ["-C", repoRoot, "worktree", "add", "--detach", wt, ref]);
  if (result.code !== 0) {
    throw new Error(`git worktree add failed (code ${result.code}): ${result.stderr.trim()}`);
  }
  return wt;
}
async function removeWorktree(runner = run, repoRoot, wtPath) {
  const result = await runner("git", ["-C", repoRoot, "worktree", "remove", "--force", wtPath]);
  if (result.code !== 0) {
    const msg = result.stderr.toLowerCase();
    if (msg.includes("not a working tree") || msg.includes("is not a valid")) {
      return;
    }
    if (msg.includes("no such file") || msg.includes("does not exist")) {
      return;
    }
    await runner("git", ["-C", repoRoot, "worktree", "prune"]);
  }
}

// packages/crew/src/commands/codex-launch.ts
var sleep2 = (ms) => new Promise((r) => setTimeout(r, ms));
var DEFAULT_TRUST_TIMEOUT_MS2 = 8e3;
var DEFAULT_TRUST_POLL_MS = 250;
var DEFAULT_TRUST_SETTLE_MS = 300;
var DEFAULT_READY_TIMEOUT_MS = 2e4;
var DEFAULT_READY_POLL_MS = 500;
var COMPOSER_GLYPH = "\u203A";
var TRUST_GATE = /hooks need review|trust all and continue|trust all/i;
async function dismissCodexTrustGate(ctx, tmuxName, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TRUST_TIMEOUT_MS2;
  const pollMs = opts.pollMs ?? DEFAULT_TRUST_POLL_MS;
  const settleMs = opts.settleMs ?? DEFAULT_TRUST_SETTLE_MS;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const pane = await capture(ctx, tmuxName);
    if (TRUST_GATE.test(pane)) {
      await ctx.tmux.sendText(tmuxName, "2");
      await sleep2(settleMs);
      await ctx.tmux.sendEnter(tmuxName);
      return;
    }
    await sleep2(pollMs);
  }
}
async function awaitComposerReady(ctx, tmuxName, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_READY_TIMEOUT_MS;
  const pollMs = opts.pollMs ?? DEFAULT_READY_POLL_MS;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const pane = await capture(ctx, tmuxName);
    if (pane.includes(COMPOSER_GLYPH)) return;
    await sleep2(pollMs);
  }
}
async function capture(ctx, tmuxName) {
  try {
    return await ctx.tmux.capturePane(tmuxName);
  } catch {
    return "";
  }
}

// packages/crew/src/commands/pi-launch.ts
var sleep3 = (ms) => new Promise((r) => setTimeout(r, ms));
var DEFAULT_READY_TIMEOUT_MS2 = 1e4;
var DEFAULT_READY_POLL_MS2 = 250;
var PI_READY = /\d+(?:\.\d+)?%\/\d+k|^\s*[>›]/m;
async function awaitPiReady(ctx, tmuxName, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_READY_TIMEOUT_MS2;
  const pollMs = opts.pollMs ?? DEFAULT_READY_POLL_MS2;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const pane = await capture2(ctx, tmuxName);
    if (PI_READY.test(pane)) return;
    await sleep3(pollMs);
  }
}
async function capture2(ctx, tmuxName) {
  try {
    return await ctx.tmux.capturePane(tmuxName);
  } catch {
    return "";
  }
}

// packages/crew/src/commands/launch.ts
function consentError(moeCrewPath) {
  return {
    stderr: `Error: moe-crew requires one-time consent before launching workers.
Run: ${moeCrewPath} grant-consent`,
    code: 1
  };
}
function resolveCwd(cwd) {
  if (!(0, import_node_fs5.existsSync)(cwd) || !(0, import_node_fs5.statSync)(cwd).isDirectory()) {
    return { stderr: `Error: cwd '${cwd}' does not exist`, code: 1 };
  }
  return (0, import_node_fs5.realpathSync)(cwd);
}
function renderPanel(opts) {
  const reproduceArgs = opts.invocation.map(shellQuote).join(" ");
  const runnableMoeCrew = /\.[cm]?js$/.test(opts.moeCrewPath) ? `node ${shellQuote(opts.moeCrewPath)}` : shellQuote(opts.moeCrewPath);
  return [
    opts.header,
    `  tmux:       ${opts.tmuxName}`,
    `  session_id: ${opts.sessionId}`,
    `  cwd:        ${opts.cwd}`,
    `  events:     ${opts.eventsFile}`,
    `  reproduce: ${runnableMoeCrew} ${opts.verb} ${reproduceArgs}`
  ].join("\n");
}
function deriveWorkerHome(workerDir2, tmuxName) {
  return workerHomePath(workerDir2, tmuxName);
}
async function cmdLaunch(ctx, args, opts) {
  const { tmuxName, extraArgs } = args;
  const driver = getDriver(args.harness);
  const resolved = resolveCwd(args.cwd);
  if (typeof resolved !== "string") return resolved;
  const cwd = resolved;
  if (!hasConsent(ctx.home)) return consentError(opts.moeCrewPath);
  if (await ctx.tmux.hasSession(tmuxName)) {
    return {
      stderr: `Error: tmux session '${tmuxName}' already exists`,
      code: 1
    };
  }
  ensureOwnedDir(ctx.workerDir);
  (0, import_node_fs5.mkdirSync)((0, import_node_path7.join)(ctx.workerDir, "bin"), { recursive: true, mode: 448 });
  let effectiveCwd = cwd;
  let worktreeDir;
  if (args.worktree) {
    worktreeDir = await createWorktree(void 0, cwd, tmuxName);
    effectiveCwd = worktreeDir;
    writeWorktreeMarker(ctx.workerDir, tmuxName, worktreeDir);
  }
  const invocation = extraArgs.length > 0 ? [tmuxName, cwd, "--", ...extraArgs] : [tmuxName, cwd];
  return driver.idStrategy === "derive" ? launchDerive(
    ctx,
    { driver, tmuxName, cwd: effectiveCwd, extraArgs, invocation, worktreeDir },
    opts
  ) : launchAssign(
    ctx,
    { driver, tmuxName, cwd: effectiveCwd, extraArgs, invocation, worktreeDir },
    opts
  );
}
async function launchAssign(ctx, { driver, tmuxName, cwd, extraArgs, invocation, worktreeDir }, opts) {
  const sessionId = (0, import_node_crypto.randomUUID)();
  writeMeta(ctx.workerDir, {
    tmux_name: tmuxName,
    session_id: sessionId,
    cwd,
    harness: driver.id,
    started_at: isoSecondsUtc(),
    invocation,
    ...worktreeDir !== void 0 ? { worktree: worktreeDir } : {}
  });
  const env = driver.workerEnv(ctx.home, tmuxName, process.env);
  await driver.prepare(tmuxName, cwd, ctx.home);
  const argv = [
    ...driver.launchArgv("launch", sessionId, cwd, opts.pluginDir, ctx.home),
    ...extraArgs
  ];
  await ctx.tmux.newSession(tmuxName, cwd, env, argv);
  await driver.postLaunch(tmuxName);
  const proof = await awaitSessionStart(ctx, tmuxName, sessionId, opts);
  if (!proof.started) {
    return { stderr: proof.failureMessage, code: 1 };
  }
  const shim = writeShim(ctx.workerDir, tmuxName, opts.moeCrewEntry);
  const panel = renderPanel({
    header: "Worker launched.",
    verb: "launch",
    tmuxName,
    sessionId,
    cwd,
    eventsFile: eventsPath(ctx.workerDir, sessionId),
    moeCrewPath: opts.moeCrewPath,
    invocation
  });
  return { stdout: shim, stderr: panel, code: 0 };
}
async function launchDerive(ctx, { driver, tmuxName, cwd, extraArgs, invocation, worktreeDir }, opts) {
  writeHarnessMarker(ctx.workerDir, tmuxName, driver.id);
  const workerHome = deriveWorkerHome(ctx.workerDir, tmuxName);
  const env = driver.workerEnv(workerHome, tmuxName, process.env);
  await driver.prepare(tmuxName, cwd, workerHome);
  const argv = [...driver.launchArgv("launch", "", cwd, opts.pluginDir, workerHome), ...extraArgs];
  await ctx.tmux.newSession(tmuxName, cwd, env, argv);
  if (driver.id === "codex") {
    await dismissCodexTrustGate(ctx, tmuxName, {
      timeoutMs: opts.codexTrustTimeoutMs,
      settleMs: opts.codexTrustSettleMs,
      pollMs: opts.pollMs
    });
    await awaitComposerReady(ctx, tmuxName, {
      timeoutMs: opts.codexReadyTimeoutMs,
      pollMs: opts.pollMs
    });
  } else if (driver.id === "pi") {
    await awaitPiReady(ctx, tmuxName, {
      timeoutMs: opts.piReadyTimeoutMs,
      pollMs: opts.pollMs
    });
  }
  if (!await ctx.tmux.hasSession(tmuxName)) {
    removeWorker(ctx.workerDir, "", tmuxName);
    return {
      stderr: `Error: tmux session '${tmuxName}' was not started (tmux missing, unreachable, or it rejected the session)`,
      code: 1
    };
  }
  const shim = writeShim(ctx.workerDir, tmuxName, opts.moeCrewEntry);
  const registeredSid = driver.registersIdAtLaunch ? resolveSession(ctx.workerDir, tmuxName) : null;
  const panel = renderPanel({
    header: "Worker launched.",
    verb: "launch",
    tmuxName,
    sessionId: registeredSid ?? "(derive \u2014 minted by the harness on registration)",
    cwd,
    eventsFile: registeredSid ? eventsPath(ctx.workerDir, registeredSid) : "(available after the worker registers)",
    moeCrewPath: opts.moeCrewPath,
    invocation
  });
  return { stdout: shim, stderr: panel, code: 0 };
}

// packages/crew/src/commands/adopt.ts
var CLAUDE_SESSION_ID = /^[0-9a-fA-F][0-9a-fA-F-]{7,}$/;
async function cmdAdopt(ctx, args, opts) {
  const { tmuxName, sessionId, extraArgs } = args;
  const driver = getDriver("claude");
  const resolved = resolveCwd(args.cwd);
  if (typeof resolved !== "string") return resolved;
  const cwd = resolved;
  if (!CLAUDE_SESSION_ID.test(sessionId)) {
    return {
      stderr: `Error: '${sessionId}' does not look like a Claude session id`,
      code: 1
    };
  }
  if (!hasConsent(ctx.home)) return consentError(opts.moeCrewPath);
  const existingHarness = readHarnessMarker(ctx.workerDir, tmuxName);
  if (existingHarness !== null && existingHarness !== "claude") {
    return {
      stderr: `Error: '${tmuxName}' is a ${existingHarness} worker; adopt is claude-only (codex/pi mint their own ids and offer no resume-by-id). Stop it first, then relaunch.`,
      code: 1
    };
  }
  const transcript = driver.transcriptPath(sessionId, cwd, ctx.home);
  if (!(0, import_node_fs6.existsSync)(transcript)) {
    return {
      stderr: `Error: no transcript found for session '${sessionId}' under ${cwd} (expected ${transcript}); it cannot be adopted \u2014 check the session id and cwd.`,
      code: 1
    };
  }
  ensureOwnedDir(ctx.workerDir);
  (0, import_node_fs6.mkdirSync)((0, import_node_path8.join)(ctx.workerDir, "bin"), { recursive: true, mode: 448 });
  const invocation = extraArgs.length > 0 ? [tmuxName, cwd, sessionId, "--", ...extraArgs] : [tmuxName, cwd, sessionId];
  writeMeta(ctx.workerDir, {
    tmux_name: tmuxName,
    session_id: sessionId,
    cwd,
    harness: driver.id,
    started_at: isoSecondsUtc(),
    invocation
  });
  const env = driver.workerEnv(ctx.home, tmuxName, process.env);
  await driver.prepare(tmuxName, cwd, ctx.home);
  const argv = [
    ...driver.launchArgv("adopt", sessionId, cwd, opts.pluginDir, ctx.home),
    ...extraArgs
  ];
  let mode;
  if (await ctx.tmux.hasSession(tmuxName)) {
    mode = "respawned existing pane";
    await ctx.tmux.respawnPane(tmuxName, cwd, env, argv);
  } else {
    mode = "opened new pane";
    await ctx.tmux.newSession(tmuxName, cwd, env, argv);
  }
  await driver.postLaunch(tmuxName);
  const proof = await awaitSessionStart(ctx, tmuxName, sessionId, opts);
  if (!proof.started) {
    return { stderr: proof.failureMessage, code: 1 };
  }
  const shim = writeShim(ctx.workerDir, tmuxName, opts.moeCrewEntry);
  const panel = renderPanel({
    header: `Worker adopted (${mode}).`,
    verb: "adopt",
    tmuxName,
    sessionId,
    cwd,
    eventsFile: eventsPath(ctx.workerDir, sessionId),
    moeCrewPath: opts.moeCrewPath,
    invocation
  });
  return { stdout: shim, stderr: panel, code: 0 };
}

// packages/crew/src/commands/converse.ts
var import_node_fs9 = require("fs");

// packages/crew/src/core/diagnostics.ts
var import_node_fs7 = require("fs");
var import_node_path9 = require("path");
function tailLines(text, n) {
  const trimmed = text.endsWith("\n") ? text.slice(0, -1) : text;
  if (trimmed.length === 0) return "";
  return trimmed.split("\n").slice(-n).join("\n");
}
function errText(e) {
  return e instanceof Error ? e.message : String(e);
}
async function psTree(run3) {
  try {
    const r = await run3("ps", ["-eo", "pid,ppid,stat,etime,comm"]);
    if (r.code !== 0) {
      const reason = r.stderr.trim() || `exit ${r.code}`;
      return `(ps failed: ${reason})`;
    }
    return tailLines(r.stdout, 100);
  } catch (e) {
    return `(ps failed: ${errText(e)})`;
  }
}
async function paneCapture(tmux2, tmuxName) {
  if (!await tmux2.hasSession(tmuxName)) {
    return `(tmux session '${tmuxName}' not present)`;
  }
  try {
    return tailLines(await tmux2.capturePaneFull(tmuxName), 200);
  } catch (e) {
    return `(pane capture failed: ${errText(e)})`;
  }
}
function fileTail(file, n, missingNote) {
  if (!(0, import_node_fs7.existsSync)(file)) return missingNote;
  try {
    return tailLines((0, import_node_fs7.readFileSync)(file, "utf8"), n);
  } catch (e) {
    return `(read failed: ${errText(e)})`;
  }
}
async function dumpConverseDiag(opts) {
  const run3 = opts.run ?? run;
  try {
    (0, import_node_fs7.mkdirSync)((0, import_node_path9.dirname)(opts.dest), { recursive: true });
  } catch {
    return false;
  }
  const sections = [
    `=== moe-crew converse diagnostic (${opts.now()}) ===`,
    `reason=${opts.reason}`,
    `session_id=${opts.sid} worker=${opts.worker} tmux_name=${opts.tmuxName} timeout=${opts.timeout}s`,
    `log_file=${opts.logFile}`,
    `event_file=${opts.eventFile}`,
    "",
    "--- ps -eo pid,ppid,stat,etime,comm (last 100 lines) ---",
    await psTree(run3),
    "",
    `--- tmux capture-pane -t ${opts.tmuxName} (full scrollback, tail 200) ---`,
    await paneCapture(opts.tmux, opts.tmuxName),
    "",
    `--- claude session JSONL tail (last 30 lines from ${opts.logFile}) ---`,
    fileTail(opts.logFile, 30, "(log file not present)"),
    "",
    `--- moe-crew events JSONL tail (last 20 lines from ${opts.eventFile}) ---`,
    fileTail(opts.eventFile, 20, "(event file not present)"),
    "",
    "=== end moe-crew diagnostic ==="
  ];
  try {
    (0, import_node_fs7.writeFileSync)(opts.dest, `${sections.join("\n")}
`);
  } catch {
    return false;
  }
  return true;
}

// packages/crew/src/commands/context.ts
function resolveWorker(ctx, worker) {
  const sid = resolveSession(ctx.workerDir, worker);
  if (sid === null) {
    return { stderr: `Error: no worker known as '${worker}'`, code: 1 };
  }
  const meta = readMeta(ctx.workerDir, sid);
  if (meta === null) {
    return {
      stderr: `Error: no meta found for worker '${worker}' (sid: ${sid})`,
      code: 1
    };
  }
  return { sid, meta };
}

// packages/crew/src/commands/send.ts
var ESC = "\x1B";
var PASTE_START = `${ESC}[200~`;
var PASTE_END = `${ESC}[201~`;
var sleep4 = (ms) => new Promise((r) => setTimeout(r, ms));
function envNumber(name, dflt) {
  const raw = process.env[name];
  if (raw === void 0) return dflt;
  const n = Number(raw);
  return Number.isFinite(n) ? n : dflt;
}
function promptSubmittedSince(eventFile, beforeLine) {
  const lines = readRawLines(eventFile);
  if (lines.length <= beforeLine) return false;
  return lines.slice(beforeLine).some((line) => parseEvent(line)?.event === "user_prompt_submit");
}
function isDeriveFirst(ctx, worker) {
  return ctx.driver.idStrategy === "derive" && resolveSession(ctx.workerDir, worker) === null;
}
async function cmdSend(ctx, worker, prompt, opts = {}) {
  if (isDeriveFirst(ctx, worker)) {
    return sendDeriveFirst(ctx, worker, prompt, opts);
  }
  const resolved = resolveWorker(ctx, worker);
  if ("code" in resolved) return resolved;
  const { sid, meta } = resolved;
  const tmuxName = meta.tmux_name;
  if (!await ctx.tmux.hasSession(tmuxName)) {
    return {
      stderr: `Error: tmux session '${tmuxName}' does not exist`,
      code: 1
    };
  }
  const eventFile = eventsPath(ctx.workerDir, sid);
  const beforeLine = readRawLines(eventFile).length;
  await pasteText(ctx, tmuxName, prompt);
  return confirmSubmission(ctx, tmuxName, eventFile, beforeLine, opts);
}
async function sendDeriveFirst(ctx, worker, prompt, opts) {
  if (!await ctx.tmux.hasSession(worker)) {
    return {
      stderr: `Error: tmux session '${worker}' does not exist`,
      code: 1
    };
  }
  const registerTimeout = opts.registerTimeout ?? envNumber("MOE_CREW_REGISTER_TIMEOUT", 15);
  const registerPollMs = opts.registerPollMs ?? 250;
  const retryInterval = opts.retryInterval ?? envNumber("MOE_CREW_SUBMIT_RETRY_INTERVAL", 2);
  await pasteText(ctx, worker, prompt);
  await ctx.tmux.sendEnter(worker);
  const deadline = Date.now() + registerTimeout * 1e3;
  let sinceEnter = Date.now();
  let sid = resolveSession(ctx.workerDir, worker);
  while (sid === null) {
    if (Date.now() >= deadline) {
      return {
        stderr: `Error: worker '${worker}' did not register within ${registerTimeout}s (codex did not emit SessionStart)`,
        code: 1
      };
    }
    await sleep4(registerPollMs);
    if (Date.now() - sinceEnter >= retryInterval * 1e3) {
      await ctx.tmux.sendEnter(worker);
      sinceEnter = Date.now();
    }
    sid = resolveSession(ctx.workerDir, worker);
  }
  return confirmSubmission(ctx, worker, eventsPath(ctx.workerDir, sid), 0, opts);
}
async function pasteText(ctx, tmuxName, prompt) {
  const safe = prompt.replaceAll(ESC, "");
  await ctx.tmux.sendText(tmuxName, PASTE_START + safe + PASTE_END);
}
async function confirmSubmission(ctx, tmuxName, eventFile, beforeLine, opts) {
  const submitTimeout = opts.submitTimeout ?? envNumber("MOE_CREW_SUBMIT_TIMEOUT", 10);
  const retryInterval = opts.retryInterval ?? envNumber("MOE_CREW_SUBMIT_RETRY_INTERVAL", 2);
  const pollMs = opts.pollMs ?? 250;
  await ctx.tmux.sendEnter(tmuxName);
  const deadline = Date.now() + submitTimeout * 1e3;
  let sinceEnter = Date.now();
  while (!promptSubmittedSince(eventFile, beforeLine)) {
    if (Date.now() >= deadline) {
      return {
        stderr: `Error: prompt pasted but worker did not confirm submission within ${submitTimeout}s (issue #20). The tmux session may be slow to accept the paste; raise MOE_CREW_SUBMIT_TIMEOUT to allow more time.`,
        code: 1
      };
    }
    await sleep4(pollMs);
    if (Date.now() - sinceEnter >= retryInterval * 1e3) {
      await ctx.tmux.sendEnter(tmuxName);
      sinceEnter = Date.now();
    }
  }
  return { code: 0 };
}

// packages/crew/src/commands/wait-for-turn.ts
var import_node_fs8 = require("fs");
var sleep5 = (ms) => new Promise((r) => setTimeout(r, ms));
var isTurnEnd = (line) => {
  const e = parseEvent(line)?.event;
  return e === "stop" || e === "session_end";
};
async function cmdWaitForTurn(ctx, worker, opts) {
  const timeout = opts.timeout ?? 60;
  const pollMs = opts.pollMs ?? 500;
  const sid = resolveSession(ctx.workerDir, worker);
  if (sid === null) {
    return { stderr: `Error: no worker known as '${worker}'`, code: 1 };
  }
  const eventFile = eventsPath(ctx.workerDir, sid);
  const deadline = Date.now() + timeout * 1e3;
  while (!(0, import_node_fs8.existsSync)(eventFile)) {
    if (Date.now() >= deadline) {
      return {
        stderr: `Timeout waiting for event file: ${eventFile}`,
        code: 1
      };
    }
    await sleep5(pollMs);
  }
  let linesChecked = opts.afterLine ?? readRawLines(eventFile).length;
  while (Date.now() < deadline) {
    const lines = readRawLines(eventFile);
    if (lines.length > linesChecked) {
      const match = lines.slice(linesChecked).find(isTurnEnd);
      if (match !== void 0) {
        return { stdout: match, code: 0 };
      }
      linesChecked = lines.length;
    }
    await sleep5(pollMs);
  }
  return {
    stderr: `Timeout waiting for turn (stop or session_end) after ${timeout}s`,
    code: 1
  };
}

// packages/crew/src/commands/converse.ts
var sleep6 = (ms) => new Promise((r) => setTimeout(r, ms));
function readTranscript(file) {
  return (0, import_node_fs9.existsSync)(file) ? (0, import_node_fs9.readFileSync)(file, "utf8") : "";
}
async function cmdConverse(ctx, worker, prompt, opts) {
  const timeout = opts.timeout ?? 120;
  const postPollCount = opts.postPollCount ?? 20;
  const postPollMs = opts.postPollMs ?? 100;
  const now = opts.now ?? (() => (/* @__PURE__ */ new Date()).toISOString());
  const deriveFirst = isDeriveFirst(ctx, worker);
  let afterLine = 0;
  if (!deriveFirst) {
    const pre = resolveWorker(ctx, worker);
    if ("code" in pre) return pre;
    if (!pre.meta.cwd) {
      return {
        stderr: "Error: Could not determine working directory from meta file",
        code: 1
      };
    }
    afterLine = readRawLines(eventsPath(ctx.workerDir, pre.sid)).length;
  }
  const sendResult = await cmdSend(ctx, worker, prompt, opts.sendOpts ?? {});
  if (sendResult.code !== 0) return sendResult;
  const resolved = resolveWorker(ctx, worker);
  if ("code" in resolved) return resolved;
  const { sid, meta } = resolved;
  if (!meta.cwd) {
    return {
      stderr: "Error: Could not determine working directory from meta file",
      code: 1
    };
  }
  const logFile = ctx.driver.transcriptPath(sid, meta.cwd, ctx.home);
  const eventFile = eventsPath(ctx.workerDir, sid);
  const diagDest = process.env.MOE_CREW_CONVERSE_DIAG_FILE;
  const dumpDiag = async (reason) => {
    if (!diagDest) return "";
    const ok = await dumpConverseDiag({
      sid,
      worker,
      tmuxName: meta.tmux_name,
      logFile,
      eventFile,
      timeout,
      dest: diagDest,
      reason,
      tmux: ctx.tmux,
      now,
      run: opts.diagRun
    });
    return ok ? `
moe-crew-diagnostic: ${diagDest}` : "";
  };
  const waitResult = await cmdWaitForTurn(ctx, worker, {
    timeout,
    afterLine,
    pollMs: opts.waitPollMs
  });
  if (waitResult.code !== 0) {
    const diag2 = await dumpDiag("wait_for_turn_timeout");
    return {
      stderr: `Error: Worker did not finish within ${timeout}s${diag2}`,
      code: 1
    };
  }
  for (let i = 0; i < postPollCount; i++) {
    const transcript = readTranscript(logFile);
    if (transcript.length > 0) {
      const turn = ctx.driver.parseTurn(transcript);
      if (turn.length > 0) {
        if (opts.withTurn) {
          return {
            stdout: renderTurnForCommand(turn, { full: false }),
            code: 0
          };
        }
        const response = assistantText(turn);
        if (response.length > 0) {
          return { stdout: response, code: 0 };
        }
      }
    }
    await sleep6(postPollMs);
  }
  const diag = await dumpDiag("no_assistant_response");
  return {
    stderr: `Error: Timed out waiting for assistant response in session log${diag}`,
    code: 1
  };
}

// packages/crew/src/commands/events-file.ts
async function cmdEventsFile(ctx, worker) {
  const sid = resolveSession(ctx.workerDir, worker);
  if (sid === null) {
    return {
      stderr: `Error: no worker known as '${worker}'`,
      code: 1
    };
  }
  return { stdout: eventsPath(ctx.workerDir, sid), code: 0 };
}

// packages/crew/src/commands/grant-consent.ts
var PREAMBLE = `moe-crew runs workers with --dangerously-skip-permissions.
Workers execute tool calls without prompting. By granting consent, you
acknowledge this risk and accept responsibility for any actions the
worker takes.`;
async function cmdGrantConsent(ctx, opts) {
  const path = consentPath(ctx.home);
  if (hasConsent(ctx.home)) {
    return { stdout: `Consent already granted at ${path}`, code: 0 };
  }
  opts.warn?.(PREAMBLE);
  const confirmed = await opts.confirm();
  if (!confirmed) {
    return {
      stderr: "Consent not granted.",
      code: 1
    };
  }
  grantConsent(ctx.home);
  return {
    stdout: `Consent granted. Written: ${path}`,
    code: 0
  };
}

// packages/crew/src/commands/handoff.ts
async function cmdHandoff(ctx, worker) {
  const resolved = resolveWorker(ctx, worker);
  if ("code" in resolved) return resolved;
  const { tmux_name } = resolved.meta;
  const stdout = `The worker is running in tmux session '${tmux_name}'. To take over:

    tmux attach -t ${tmux_name}

Once attached, you can type to the worker directly. Detach with Ctrl-B d to
return without ending the session.

Leave the worker running. The controller can resume by sending another
prompt \u2014 do not run $WORKER stop unless you actually want to terminate
the session.
`;
  return { stdout, code: 0 };
}

// packages/crew/src/commands/status.ts
var import_node_fs10 = require("fs");
async function computeStatus(ctx, meta) {
  if (!await ctx.tmux.hasSession(meta.tmux_name)) {
    return "gone";
  }
  const ef = eventsPath(ctx.workerDir, meta.session_id);
  if (!(0, import_node_fs10.existsSync)(ef)) {
    return "unknown";
  }
  const last = lastEvent(ef);
  if (last === null) {
    return "unknown";
  }
  return classifyStatus(last);
}
async function cmdStatus(ctx, worker) {
  const sid = resolveSession(ctx.workerDir, worker);
  if (sid === null) {
    return {
      stderr: `Error: no worker known as '${worker}'`,
      code: 1
    };
  }
  const meta = readMeta(ctx.workerDir, sid);
  if (meta === null) {
    return {
      stderr: `Error: no meta found for worker '${worker}' (sid: ${sid})`,
      code: 1
    };
  }
  const status = await computeStatus(ctx, meta);
  return { stdout: status, code: 0 };
}

// packages/crew/src/commands/list.ts
var HEADER = ["STATUS", "HARNESS", "TMUX", "SESSION_ID", "SHIM", "CWD"].join("	");
async function cmdList(ctx, opts) {
  const rows = [];
  for (const meta of listWorkers(ctx.workerDir)) {
    if (opts.pattern && !meta.tmux_name.includes(opts.pattern)) continue;
    const status = await computeStatus(ctx, meta);
    if (status === "gone" && !opts.all) continue;
    rows.push(
      [
        status,
        meta.harness,
        meta.tmux_name,
        meta.session_id,
        shimPath(ctx.workerDir, meta.tmux_name),
        meta.cwd
      ].join("	")
    );
  }
  for (const name of listOrphanNames(ctx.workerDir)) {
    if (opts.pattern && !name.includes(opts.pattern)) continue;
    if (!await ctx.tmux.hasSession(name)) continue;
    rows.push(
      [
        "unregistered",
        readHarnessMarker(ctx.workerDir, name) ?? "?",
        name,
        "-",
        shimPath(ctx.workerDir, name),
        "-"
      ].join("	")
    );
  }
  if (rows.length === 0) {
    return { stderr: "No workers found", code: 0 };
  }
  return { stdout: [HEADER, ...rows].join("\n"), code: 0 };
}

// packages/crew/src/core/packs.ts
var import_node_fs11 = require("fs");
function parsePackYaml(text) {
  const lines = text.split("\n");
  const root = {};
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*$/.test(line) || /^\s*#/.test(line)) {
      i++;
      continue;
    }
    const topMatch = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)/);
    if (!topMatch) {
      i++;
      continue;
    }
    const key = topMatch[1];
    const inlineValue = topMatch[2]?.trim() ?? "";
    if (/^\|[+-]?\s*$/.test(inlineValue)) {
      const { value, nextLine } = readBlockScalar(lines, i + 1, 2);
      root[key] = value;
      i = nextLine;
      continue;
    }
    if (inlineValue.length > 0) {
      root[key] = parseScalar(inlineValue);
      i++;
      continue;
    }
    const nextNonBlank = peekNonBlank(lines, i + 1);
    if (nextNonBlank !== null && lines[nextNonBlank]?.match(/^\s+-\s/)) {
      const { items, nextLine } = readSequence(lines, i + 1);
      root[key] = items;
      i = nextLine;
    } else {
      root[key] = "";
      i++;
    }
  }
  return root;
}
function readBlockScalar(lines, start, minIndent) {
  const collected = [];
  let i = start;
  let bodyIndent = minIndent;
  while (i < lines.length && /^\s*$/.test(lines[i])) {
    collected.push("");
    i++;
  }
  if (i < lines.length) {
    const m = lines[i]?.match(/^(\s*)/);
    bodyIndent = m ? m[1]?.length ?? 0 : minIndent;
    if (bodyIndent < minIndent) bodyIndent = minIndent;
  }
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*$/.test(line)) {
      collected.push("");
      i++;
      continue;
    }
    const indent = line.match(/^(\s*)/)?.[1]?.length ?? 0;
    if (indent < bodyIndent) break;
    collected.push(line.slice(bodyIndent));
    i++;
  }
  while (collected.length > 0 && collected[collected.length - 1] === "") {
    collected.pop();
  }
  return { value: collected.join("\n") + (collected.length > 0 ? "\n" : ""), nextLine: i };
}
function readSequence(lines, start) {
  const items = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*$/.test(line) || /^\s*#/.test(line)) {
      i++;
      continue;
    }
    const dashMatch = line.match(/^(\s*)-\s+(.*)/);
    if (!dashMatch) break;
    const dashIndent = dashMatch[1]?.length ?? 0;
    const firstContent = dashMatch[2] ?? "";
    const item = {};
    const kvMatch = firstContent.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)/);
    if (kvMatch) {
      const k = kvMatch[1] ?? "";
      const v = kvMatch[2]?.trim() ?? "";
      if (/^\|[+-]?\s*$/.test(v)) {
        const { value, nextLine } = readBlockScalar(lines, i + 1, dashIndent + 4);
        item[k] = value;
        i = nextLine;
      } else if (v.length > 0) {
        item[k] = parseScalar(v);
        i++;
      } else {
        const peek = peekNonBlank(lines, i + 1);
        if (peek !== null && lines[peek]?.match(/^\s+-\s/)) {
          const { scalarItems, nextLine } = readScalarSequence(lines, i + 1, dashIndent + 4);
          item[k] = scalarItems;
          i = nextLine;
        } else {
          item[k] = "";
          i++;
        }
      }
    } else {
      i++;
      continue;
    }
    while (i < lines.length) {
      const cLine = lines[i];
      if (/^\s*$/.test(cLine) || /^\s*#/.test(cLine)) {
        i++;
        continue;
      }
      const cIndent = cLine.match(/^(\s*)/)?.[1]?.length ?? 0;
      if (cIndent <= dashIndent) break;
      if (cIndent <= dashIndent + 1) break;
      const ckMatch = cLine.match(/^\s+([A-Za-z_][A-Za-z0-9_]*):\s*(.*)/);
      if (!ckMatch) break;
      const ck = ckMatch[1] ?? "";
      const cv = ckMatch[2]?.trim() ?? "";
      if (/^\|[+-]?\s*$/.test(cv)) {
        const { value, nextLine } = readBlockScalar(lines, i + 1, cIndent + 2);
        item[ck] = value;
        i = nextLine;
      } else if (cv.length > 0) {
        item[ck] = parseScalar(cv);
        i++;
      } else {
        const peek = peekNonBlank(lines, i + 1);
        if (peek !== null && lines[peek]?.match(/^\s+-\s/)) {
          const { scalarItems, nextLine } = readScalarSequence(lines, i + 1, cIndent + 2);
          item[ck] = scalarItems;
          i = nextLine;
        } else {
          item[ck] = "";
          i++;
        }
      }
    }
    items.push(item);
  }
  return { items, nextLine: i };
}
function readScalarSequence(lines, start, minIndent) {
  const scalarItems = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*$/.test(line) || /^\s*#/.test(line)) {
      i++;
      continue;
    }
    const dm = line.match(/^(\s*)-\s+(.*)/);
    if (!dm || (dm[1]?.length ?? 0) < minIndent) break;
    scalarItems.push(parseScalar(dm[2]?.trim() ?? ""));
    i++;
  }
  return { scalarItems, nextLine: i };
}
function peekNonBlank(lines, start) {
  for (let i = start; i < lines.length; i++) {
    if (!/^\s*$/.test(lines[i]) && !/^\s*#/.test(lines[i])) return i;
  }
  return null;
}
function parseScalar(raw) {
  const stripped = raw.replace(/\s+#.*$/, "").trim();
  if (stripped === "true" || stripped === "True" || stripped === "TRUE") return true;
  if (stripped === "false" || stripped === "False" || stripped === "FALSE") return false;
  if (stripped === "null" || stripped === "Null" || stripped === "NULL" || stripped === "~")
    return null;
  if (stripped.startsWith('"') && stripped.endsWith('"') || stripped.startsWith("'") && stripped.endsWith("'")) {
    return stripped.slice(1, -1);
  }
  const n = Number(stripped);
  if (stripped.length > 0 && !Number.isNaN(n) && /^-?[0-9]/.test(stripped)) return n;
  return stripped;
}
function validatePack(raw) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("Invalid pack file: expected a YAML mapping at the top level");
  }
  const obj = raw;
  const name = obj.name;
  if (typeof name !== "string" || name.trim().length === 0) {
    throw new Error("Invalid pack file: 'name' is required and must be a non-empty string");
  }
  const description = obj.description;
  if (description !== void 0 && typeof description !== "string") {
    throw new Error("Invalid pack file: 'description' must be a string");
  }
  const workers = obj.workers;
  if (!Array.isArray(workers) || workers.length === 0) {
    throw new Error("Invalid pack file: 'workers' is required and must be a non-empty array");
  }
  const validated = [];
  for (let i = 0; i < workers.length; i++) {
    const w = workers[i];
    if (typeof w !== "object" || w === null) {
      throw new Error(`Invalid pack file: workers[${i}] must be a mapping`);
    }
    if (typeof w.namePrefix !== "string" || w.namePrefix.trim().length === 0) {
      throw new Error(
        `Invalid pack file: workers[${i}].namePrefix is required and must be a non-empty string`
      );
    }
    if (typeof w.rolePrompt !== "string" || w.rolePrompt.trim().length === 0) {
      throw new Error(
        `Invalid pack file: workers[${i}].rolePrompt is required and must be a non-empty string`
      );
    }
    const pw = {
      namePrefix: w.namePrefix,
      rolePrompt: w.rolePrompt
    };
    if (w.harness !== void 0) {
      if (typeof w.harness !== "string") {
        throw new Error(`Invalid pack file: workers[${i}].harness must be a string`);
      }
      pw.harness = w.harness;
    }
    if (w.harnessArgs !== void 0) {
      if (!Array.isArray(w.harnessArgs)) {
        throw new Error(`Invalid pack file: workers[${i}].harnessArgs must be an array`);
      }
      pw.harnessArgs = w.harnessArgs.map(String);
    }
    validated.push(pw);
  }
  return {
    name: name.trim(),
    description: description !== void 0 ? description : void 0,
    workers: validated
  };
}
function loadPack(path) {
  if (!(0, import_node_fs11.existsSync)(path)) {
    throw new Error(`Pack file not found: ${path}`);
  }
  const text = (0, import_node_fs11.readFileSync)(path, "utf8");
  let parsed;
  if (path.endsWith(".json")) {
    parsed = JSON.parse(text);
  } else {
    parsed = parsePackYaml(text);
  }
  return validatePack(parsed);
}

// packages/crew/src/commands/stop.ts
var import_node_path10 = require("path");
var sleep7 = (ms) => new Promise((r) => setTimeout(r, ms));
function sawSessionEnd(eventFile) {
  return readRawLines(eventFile).some((line) => parseEvent(line)?.event === "session_end");
}
async function cmdStop(ctx, worker, opts = {}) {
  const resolved = resolveWorker(ctx, worker);
  if ("code" in resolved) {
    const harness = readHarnessMarker(ctx.workerDir, worker);
    if (harness !== null && await ctx.tmux.hasSession(worker)) {
      const orphanWt = readWorktreeMarker(ctx.workerDir, worker);
      await ctx.tmux.killSession(worker);
      removeOrphan(ctx.workerDir, worker);
      if (orphanWt) {
        const repoRoot = (0, import_node_path10.dirname)((0, import_node_path10.dirname)(orphanWt));
        await removeWorktree(void 0, repoRoot, orphanWt);
      }
      return {
        stdout: `Worker ${worker} (unregistered \u2014 no session id yet) stopped. Shim removed.`,
        code: 0
      };
    }
    return resolved;
  }
  const { sid, meta } = resolved;
  const tmuxName = meta.tmux_name;
  const stopTimeout = opts.stopTimeout ?? ctx.driver.stopGraceSeconds;
  const pollMs = opts.pollMs ?? 500;
  const settleMs = opts.settleMs ?? 1e3;
  const eventFile = eventsPath(ctx.workerDir, sid);
  const wtPath = readWorktreeMarker(ctx.workerDir, tmuxName);
  if (await ctx.tmux.hasSession(tmuxName)) {
    await ctx.tmux.sendText(tmuxName, ctx.driver.quitKeys);
    await ctx.tmux.sendEnter(tmuxName);
    const deadline = Date.now() + stopTimeout * 1e3;
    while (Date.now() < deadline) {
      if (sawSessionEnd(eventFile)) {
        await sleep7(settleMs);
        break;
      }
      if (!await ctx.tmux.hasSession(tmuxName)) break;
      await sleep7(pollMs);
    }
    if (await ctx.tmux.hasSession(tmuxName)) {
      await ctx.tmux.killSession(tmuxName);
    }
  }
  removeWorker(ctx.workerDir, sid, tmuxName);
  const effectiveWt = wtPath ?? meta.worktree;
  if (effectiveWt) {
    const repoRoot = (0, import_node_path10.dirname)((0, import_node_path10.dirname)(effectiveWt));
    await removeWorktree(void 0, repoRoot, effectiveWt);
  }
  return {
    stdout: `Worker ${tmuxName} (${sid}) stopped. Shim removed.`,
    code: 0
  };
}

// packages/crew/src/commands/pack.ts
function workerName(packName, prefix, index) {
  return `${packName}-${prefix}-${index}`;
}
async function cmdPack(ctx, args, opts) {
  let pack;
  try {
    pack = loadPack(args.packFile);
  } catch (e) {
    return { stderr: `Error: ${e.message}`, code: 1 };
  }
  const shims = [];
  const errors = [];
  for (let i = 0; i < pack.workers.length; i++) {
    const w = pack.workers[i];
    const name = workerName(pack.name, w.namePrefix, i);
    const harness = w.harness ?? "claude";
    const extraArgs = w.harnessArgs ?? [];
    const launchResult = await cmdLaunch(
      ctx,
      { tmuxName: name, cwd: args.cwd, extraArgs, harness },
      opts
    );
    if (launchResult.code !== 0) {
      errors.push(`Failed to launch ${name}: ${launchResult.stderr ?? "unknown error"}`);
      continue;
    }
    if (launchResult.stdout) {
      shims.push(launchResult.stdout);
    }
    const sendResult = await cmdSend(ctx, name, w.rolePrompt.trim());
    if (sendResult.code !== 0) {
      errors.push(`Failed to send role prompt to ${name}: ${sendResult.stderr ?? "unknown error"}`);
    }
  }
  if (errors.length > 0 && shims.length === 0) {
    return { stderr: errors.join("\n"), code: 1 };
  }
  const summary = [`Pack '${pack.name}' launched: ${shims.length} workers`];
  for (const s of shims) {
    summary.push(`  ${s}`);
  }
  if (errors.length > 0) {
    summary.push(`Errors (${errors.length}):`);
    for (const e of errors) {
      summary.push(`  ${e}`);
    }
  }
  return { stdout: summary.join("\n"), code: errors.length > 0 ? 1 : 0 };
}
async function cmdPackStop(ctx, args) {
  let packName;
  if (/\.(ya?ml|json)$/.test(args.nameOrFile)) {
    try {
      const pack = loadPack(args.nameOrFile);
      packName = pack.name;
    } catch (e) {
      return { stderr: `Error: ${e.message}`, code: 1 };
    }
  } else {
    packName = args.nameOrFile;
  }
  const prefix = `${packName}-`;
  const workers = listWorkers(ctx.workerDir);
  const matching = workers.filter((m) => m.tmux_name.startsWith(prefix));
  if (matching.length === 0) {
    return { stderr: `No workers found for pack '${packName}'`, code: 0 };
  }
  let stopped = 0;
  const errors = [];
  for (const meta of matching) {
    const result = await cmdStop(ctx, meta.tmux_name);
    if (result.code === 0) {
      stopped++;
    } else {
      errors.push(`Failed to stop ${meta.tmux_name}: ${result.stderr ?? "unknown error"}`);
    }
  }
  const summary = [`Pack '${packName}' stopped: ${stopped} workers`];
  if (errors.length > 0) {
    summary.push(`Errors (${errors.length}):`);
    for (const e of errors) {
      summary.push(`  ${e}`);
    }
  }
  return {
    stdout: summary.join("\n"),
    code: errors.length > 0 ? 1 : 0
  };
}

// packages/crew/src/commands/prune.ts
async function cmdPrune(ctx) {
  const removed = [];
  for (const meta of listWorkers(ctx.workerDir)) {
    if (await computeStatus(ctx, meta) !== "gone") continue;
    removeWorker(ctx.workerDir, meta.session_id, meta.tmux_name);
    removed.push(meta.tmux_name);
  }
  for (const name of listOrphanNames(ctx.workerDir)) {
    if (await ctx.tmux.hasSession(name)) continue;
    removeOrphan(ctx.workerDir, name);
    removed.push(name);
  }
  if (removed.length === 0) {
    return { stderr: "Nothing to prune", code: 0 };
  }
  return {
    stdout: `Pruned ${removed.length} dead worker(s)/orphan(s): ${removed.join(", ")}`,
    code: 0
  };
}

// packages/crew/src/commands/read-events.ts
var import_node_fs12 = require("fs");
function filterByType(lines, type) {
  return lines.filter((line) => parseEvent(line)?.event === type);
}
function isKnownEvent(type) {
  return EVENT_NAMES.includes(type);
}
async function cmdReadEvents(ctx, worker, opts) {
  if (opts.type !== void 0 && !isKnownEvent(opts.type)) {
    return {
      stderr: `Error: '${opts.type}' is not a known event type. Valid events: ${EVENT_NAMES.join(" ")}`,
      code: 2
    };
  }
  const sid = resolveSession(ctx.workerDir, worker);
  if (sid === null) {
    return { stderr: `Error: no worker known as '${worker}'`, code: 1 };
  }
  const eventFile = eventsPath(ctx.workerDir, sid);
  if (!(0, import_node_fs12.existsSync)(eventFile)) {
    return { stderr: `Error: No event file for session ${sid}`, code: 1 };
  }
  let lines = readRawLines(eventFile);
  if (opts.type !== void 0) {
    lines = filterByType(lines, opts.type);
  }
  if (opts.last !== void 0) {
    lines = opts.last <= 0 ? [] : lines.slice(-opts.last);
  }
  return { stdout: lines.join("\n"), code: 0 };
}
async function followEvents(ctx, worker, opts, sink, signal) {
  const pollMs = opts.pollMs ?? 250;
  const sid = resolveSession(ctx.workerDir, worker);
  if (sid === null) return;
  const eventFile = eventsPath(ctx.workerDir, sid);
  const matches = (line) => opts.type === void 0 || parseEvent(line)?.event === opts.type;
  let emitted = 0;
  if ((0, import_node_fs12.existsSync)(eventFile)) {
    const lines = readRawLines(eventFile);
    let backlog = lines.filter(matches);
    if (opts.last !== void 0) {
      backlog = opts.last <= 0 ? [] : backlog.slice(-opts.last);
    }
    for (const line of backlog) sink(line);
    emitted = lines.length;
  }
  for (; ; ) {
    if (signal?.aborted) return;
    if ((0, import_node_fs12.existsSync)(eventFile)) {
      const lines = readRawLines(eventFile);
      for (const line of lines.slice(emitted)) {
        if (matches(line)) sink(line);
      }
      emitted = lines.length;
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

// packages/crew/src/commands/read-turn.ts
var import_node_fs13 = require("fs");
async function cmdReadTurn(ctx, worker, opts) {
  const resolved = resolveWorker(ctx, worker);
  if ("code" in resolved) return resolved;
  const { sid, meta } = resolved;
  if (!meta.cwd) {
    return {
      stderr: "Error: Could not determine working directory from meta file",
      code: 1
    };
  }
  const logFile = ctx.driver.transcriptPath(sid, meta.cwd, ctx.home);
  if (!(0, import_node_fs13.existsSync)(logFile)) {
    return { stderr: `Error: Session log not found at ${logFile}`, code: 1 };
  }
  const turn = ctx.driver.parseTurn((0, import_node_fs13.readFileSync)(logFile, "utf8"));
  if (turn.length === 0) {
    return { stderr: "No user prompt found in session log", code: 1 };
  }
  return {
    stdout: renderTurnForCommand(turn, { full: opts.full ?? false }),
    code: 0
  };
}

// packages/crew/src/commands/session-id.ts
async function cmdSessionId(ctx, worker) {
  const sid = resolveSession(ctx.workerDir, worker);
  if (sid === null) {
    return {
      stderr: `Error: no worker known as '${worker}'`,
      code: 1
    };
  }
  return { stdout: sid, code: 0 };
}

// packages/crew/src/core/tmux.ts
function envArgs(env) {
  return Object.entries(env).flatMap(([k, v]) => ["-e", `${k}=${v}`]);
}
function makeTmux(run3 = run) {
  return {
    /** Returns true if the named session exists, false otherwise. Never throws. */
    async hasSession(name) {
      try {
        const result = await run3("tmux", ["has-session", "-t", name]);
        return result.code === 0;
      } catch {
        return false;
      }
    },
    async killSession(name) {
      await run3("tmux", ["kill-session", "-t", name]);
    },
    /** Returns the captured pane text. */
    async capturePane(name) {
      const result = await run3("tmux", ["capture-pane", "-t", name, "-p"]);
      return result.stdout;
    },
    /** Returns the captured pane text including the full scrollback history. */
    async capturePaneFull(name) {
      const result = await run3("tmux", ["capture-pane", "-t", name, "-p", "-S", "-", "-E", "-"]);
      return result.stdout;
    },
    /** Send text literally to the pane (no key-name interpretation). */
    async sendText(name, text) {
      await run3("tmux", ["send-keys", "-t", name, "-l", text]);
    },
    /** Send the Enter key to the pane. */
    async sendEnter(name) {
      await run3("tmux", ["send-keys", "-t", name, "Enter"]);
    },
    /** Send a named key (e.g. 'Down', 'Up') to the pane. */
    async sendKey(name, key) {
      await run3("tmux", ["send-keys", "-t", name, key]);
    },
    /** Create a new detached session running the given argv with the given env. */
    async newSession(name, cwd, env, argv) {
      await run3("tmux", ["new-session", "-d", "-s", name, "-c", cwd, ...envArgs(env), ...argv]);
    },
    /** Respawn the current pane in an existing session (used by adopt). */
    async respawnPane(name, cwd, env, argv) {
      await run3("tmux", ["respawn-pane", "-k", "-t", name, "-c", cwd, ...envArgs(env), ...argv]);
    }
  };
}
var tmux = makeTmux();

// packages/crew/src/cli.ts
var realIo = {
  out: (s) => process.stdout.write(s),
  err: (s) => process.stderr.write(s)
};
var TOP_LEVEL_SUBS = [
  "launch",
  "adopt",
  "list",
  "pack",
  "pack-stop",
  "prune",
  "grant-consent",
  "help"
];
var PER_WORKER_SUBS = [
  "converse",
  "send",
  "wait-for-turn",
  "status",
  "read-events",
  "read-turn",
  "stop",
  "handoff",
  "session-id",
  "events-file"
];
var USAGE = `Usage: moe-crew <subcommand> [args...]
       moe-crew --worker <name> <subcommand> [args...]

A worker is a coding-agent session (Claude Code, Codex, or Pi) in a tmux pane
that emits lifecycle events the controller observes. \`moe-crew launch\` prints a
*shim path* on stdout (deterministic at <worker-dir>/bin/<tmux-name> \u2014 see
MOE_CREW_WORKER_DIR below) \u2014 run that shim for all per-worker subcommands.
\`moe-crew stop\` removes the shim along with the worker's state. The per-worker
surface is identical across harnesses.

Top-level subcommands:
  launch [--harness <claude|codex|pi>] [--worktree] <tmux-name> <cwd> [-- harness-args...]
                       Bootstrap a worker (harness defaults to claude); shim
                       path on stdout, panel on stderr. --worktree creates a
                       disposable git worktree per worker so parallel workers
                       do not race on git state; stop removes it
  adopt <tmux-name> <cwd> <session-id> [-- claude-args...]
                       Re-adopt an existing Claude session as a driveable
                       worker via \`claude --resume <session-id>\` (claude-only;
                       codex/pi mint their own ids and offer no resume-by-id).
                       Restores a worker after a reboot/crash wiped the
                       worker directory while the conversation transcript
                       survived. If a tmux session named <tmux-name> already
                       exists (e.g. restored by tmux-resurrect), respawns its
                       pane in place; else opens a new one. Shim path on stdout,
                       panel on stderr
  list [--all] [<pattern>]
                       Enumerate workers (default: skip workers whose tmux is
                       gone). Optional pattern filters by tmux-name substring
  pack <pack-file> [cwd]
                       Launch a predefined team of workers from a YAML pack
                       file. Each worker is launched and sent its role prompt.
                       cwd defaults to the current directory
  pack-stop <name-or-file>
                       Stop all workers belonging to a pack. Accepts either
                       a pack name or a pack YAML file path (reads the name)
  prune                Remove the runtime state of all \`gone\` workers (tmux
                       session dead); live workers are untouched
  grant-consent        One-time consent for running workers with permissions
                       bypassed (--dangerously-skip-permissions et al.)
  help                 Show this message

Per-worker subcommands (require --worker, supplied by the shim):
  converse [--with-turn] <prompt> [timeout=120]
                       Send prompt, wait for turn, return assistant text.
                       --with-turn returns the full markdown turn instead
  send <prompt>        Send a prompt without waiting for the turn
  wait-for-turn [timeout=60] [--after-line N]
                       Block until the next stop OR session_end. By default the
                       baseline is the events file's current end, so it waits for
                       a NEW turn-end; pass --after-line N to wait for the first
                       turn-end after line N (a baseline you captured earlier)
  status               idle | working | terminated | gone | unknown
  read-events [--last N] [--type T] [--follow]
                       Read the event JSONL stream. With --follow, --last N caps
                       the replayed backlog to the last N events before tailing
                       (--last 0 = only NEW events; omit = replay everything)
  read-turn [--full]   Last turn as markdown. Without --full, tool results
                       are truncated to 5 lines; --full shows them complete
  stop                 /exit, clean up meta + events + shim
  handoff              Print tmux-attach instructions for a human
  session-id           Print the worker's session id
  events-file          Print the absolute path to the events JSONL

Environment variables:
  MOE_CREW_CLAUDE_BIN / MOE_CREW_CODEX_BIN / MOE_CREW_PI_BIN
                       Path to each harness binary (defaults: claude / codex / pi,
                       resolved via PATH). Set when the binary is not on PATH or you
                       want to pin a specific version.
  MOE_CREW_CODEX_MODEL / MOE_CREW_PI_MODEL
                       Optional model override for codex / pi workers. Unset = the
                       harness default (codex: gpt-5.5; pi: its configured default).
  MOE_CREW_CONVERSE_DIAG_FILE
                       When set, \`converse\` writes a post-mortem diagnostic (ps tree +
                       tmux capture-pane + worker session JSONL tail + moe-crew events tail)
                       to this path on timeout, then emits "moe-crew-diagnostic: <path>" to
                       stderr. Overwritten on each timeout. Unset = no diagnostic file.
  MOE_CREW_WORKER_DIR  Directory for worker runtime state (meta/events/shim).
                       Default: $XDG_RUNTIME_DIR/moe-crew-workers if set, else
                       ~/.local/state/moe-crew/workers. Created privately
                       (mode 0700); refuses an existing directory not owned
                       by the current user.
  MOE_CREW_SUBMIT_TIMEOUT / MOE_CREW_SUBMIT_RETRY_INTERVAL
                       \`send\`: seconds to wait for the worker to confirm a pasted
                       prompt (default 10) and seconds between retry-Enter resends
                       (default 2).
  MOE_CREW_REGISTER_TIMEOUT
                       Seconds the FIRST \`send\` to a derive worker (codex/pi) waits
                       for it to self-register its session id (default 15).
  HOME                 Used to locate ~/.claude/projects/<encoded-cwd>/<sid>.jsonl and
                       the one-time consent file (~/.claude/.moe-crew-consent).
`;
function err(message, code = 2) {
  return { message, code };
}
function parseWorker(argv) {
  let worker;
  let i = 0;
  while (i < argv.length) {
    const a = argv[i] ?? "";
    if (a === "--worker") {
      if (i + 1 >= argv.length) {
        return err("Error: --worker requires a value");
      }
      worker = argv[i + 1];
      i += 2;
    } else if (a.startsWith("--worker=")) {
      worker = a.slice("--worker=".length);
      i += 1;
    } else {
      break;
    }
  }
  return { worker: worker ? worker : void 0, rest: argv.slice(i) };
}
function resolveWorkerHarness(dir, worker) {
  const sid = resolveSession(dir, worker);
  if (sid !== null) {
    const meta = readMeta(dir, sid);
    if (meta?.harness) return meta.harness;
  }
  return readHarnessMarker(dir, worker) ?? "claude";
}
function buildContext(worker) {
  const dir = workerDir();
  const harness = worker !== void 0 ? resolveWorkerHarness(dir, worker) : "claude";
  return {
    workerDir: dir,
    home: process.env.HOME ?? (0, import_node_os4.homedir)(),
    tmux,
    driver: getDriver(harness)
  };
}
function bootstrapOpts() {
  const moeCrewEntry = (0, import_node_path11.join)(__dirname, "moe-crew.cjs");
  return {
    pluginDir: process.env.CLAUDE_PLUGIN_ROOT ?? (0, import_node_path11.resolve)(__dirname, ".."),
    moeCrewEntry,
    moeCrewPath: process.env.MOE_CREW_PATH ?? moeCrewEntry
  };
}
function readLine(input = process.stdin) {
  return new Promise((res) => {
    const rl = (0, import_node_readline.createInterface)({ input });
    let captured = null;
    rl.once("line", (line) => {
      captured = line.trim();
      rl.close();
    });
    rl.once("close", () => res(captured ?? ""));
  });
}
function parseLaunchArgs(argv) {
  const usage = "Usage: launch <tmux-name> <cwd> [-- claude-args...]";
  const positionals = [];
  let harness = "claude";
  let worktree = false;
  let extraArgs = [];
  let i = 0;
  while (i < argv.length) {
    const a = argv[i] ?? "";
    if (a === "--") {
      extraArgs = argv.slice(i + 1);
      break;
    }
    if (a === "--harness") {
      const value = argv[i + 1];
      if (value === void 0) {
        return err("Error: --harness expects a value for launch");
      }
      try {
        getDriver(value);
      } catch (e) {
        return err(e.message);
      }
      harness = value;
      i += 2;
      continue;
    }
    if (a === "--worktree") {
      worktree = true;
      i += 1;
      continue;
    }
    positionals.push(a);
    i += 1;
  }
  const [tmuxName, cwd] = positionals;
  if (tmuxName === void 0 || cwd === void 0) return err(usage);
  return { tmuxName, cwd, extraArgs, harness, ...worktree ? { worktree: true } : {} };
}
function parseAdoptArgs(argv) {
  const usage = "Usage: adopt <tmux-name> <cwd> <session-id> [-- claude-args...]";
  let rest = argv;
  let extraArgs = [];
  const sep = rest.indexOf("--");
  if (sep !== -1) {
    extraArgs = rest.slice(sep + 1);
    rest = rest.slice(0, sep);
  }
  const [tmuxName, cwd, sessionId] = rest;
  if (tmuxName === void 0 || cwd === void 0 || sessionId === void 0) {
    return err(usage);
  }
  return { tmuxName, cwd, sessionId, extraArgs };
}
function emit(io, result) {
  if (result.stdout !== void 0 && result.stdout.length > 0) {
    io.out(`${result.stdout}
`);
  }
  if (result.stderr !== void 0 && result.stderr.length > 0) {
    io.err(`${result.stderr}
`);
  }
  return result.code;
}
async function run2(argv, io = realIo) {
  const parsed = parseWorker(argv);
  if ("code" in parsed) {
    io.err(`${parsed.message}
`);
    return parsed.code;
  }
  const { worker, rest } = parsed;
  const sub = rest[0];
  const args = rest.slice(1);
  if (sub === void 0) {
    io.err(USAGE);
    return 2;
  }
  if (TOP_LEVEL_SUBS.includes(sub)) {
    if (worker !== void 0) {
      io.err(`Error: --worker is not valid for '${sub}' (top-level subcommand)
`);
      return 2;
    }
  } else if (PER_WORKER_SUBS.includes(sub)) {
    if (worker === void 0) {
      io.err(`Error: --worker <name> is required for '${sub}'
`);
      return 2;
    }
  } else {
    io.err(`Error: unknown subcommand '${sub}'
`);
    io.err(USAGE);
    return 2;
  }
  if (sub === "help") {
    io.out(USAGE);
    return 0;
  }
  const ctx = buildContext(worker);
  const w = worker;
  switch (sub) {
    case "grant-consent":
      return emit(
        io,
        await cmdGrantConsent(ctx, {
          warn: (text) => io.out(`${text}
`),
          confirm: () => grantConsentConfirm(io)
        })
      );
    case "launch": {
      const parsedArgs = parseLaunchArgs(args);
      if ("code" in parsedArgs) {
        io.err(`${parsedArgs.message}
`);
        return parsedArgs.code;
      }
      return emit(io, await cmdLaunch(ctx, parsedArgs, bootstrapOpts()));
    }
    case "adopt": {
      const parsedArgs = parseAdoptArgs(args);
      if ("code" in parsedArgs) {
        io.err(`${parsedArgs.message}
`);
        return parsedArgs.code;
      }
      return emit(io, await cmdAdopt(ctx, parsedArgs, bootstrapOpts()));
    }
    case "list": {
      const opts = parseListArgs(args);
      if ("code" in opts) {
        io.err(`${opts.message}
`);
        return opts.code;
      }
      return emit(io, await cmdList(ctx, opts));
    }
    case "pack": {
      const packFile = args[0];
      if (packFile === void 0) {
        io.err("Usage: pack <pack-file> [cwd]\n");
        return 2;
      }
      const packCwd = args[1] ?? process.cwd();
      return emit(io, await cmdPack(ctx, { packFile, cwd: packCwd }, bootstrapOpts()));
    }
    case "pack-stop": {
      const nameOrFile = args[0];
      if (nameOrFile === void 0) {
        io.err("Usage: pack-stop <name-or-file>\n");
        return 2;
      }
      return emit(io, await cmdPackStop(ctx, { nameOrFile }));
    }
    case "prune":
      return emit(io, await cmdPrune(ctx));
    case "converse": {
      let withTurn = false;
      let i = 0;
      if (args[i] === "--with-turn") {
        withTurn = true;
        i += 1;
      }
      const prompt = args[i];
      if (prompt === void 0 || prompt.trim() === "") {
        io.err("Usage: converse [--with-turn] <prompt> [timeout=120]\n");
        return 1;
      }
      let timeout = 120;
      if (args[i + 1] !== void 0) {
        timeout = Number(args[i + 1]);
        if (!Number.isFinite(timeout)) {
          io.err("Error: converse timeout must be a number\n");
          return 2;
        }
      }
      return emit(io, await cmdConverse(ctx, w, prompt, { withTurn, timeout }));
    }
    case "send": {
      const prompt = args[0];
      if (prompt === void 0 || prompt.trim() === "") {
        io.err("Usage: send <prompt-text>\n");
        return 1;
      }
      return emit(io, await cmdSend(ctx, w, prompt));
    }
    case "wait-for-turn": {
      const opts = parseWaitForTurnArgs(args);
      if ("code" in opts) {
        io.err(`${opts.message}
`);
        return opts.code;
      }
      return emit(io, await cmdWaitForTurn(ctx, w, opts));
    }
    case "read-events": {
      const opts = parseReadEventsArgs(args);
      if ("code" in opts) {
        io.err(`${opts.message}
`);
        return opts.code;
      }
      if (opts.follow) {
        return followStream(ctx, w, opts, io);
      }
      return emit(io, await cmdReadEvents(ctx, w, { last: opts.last, type: opts.type }));
    }
    case "read-turn": {
      const full = args[0] === "--full";
      return emit(io, await cmdReadTurn(ctx, w, { full }));
    }
    case "status":
      return emit(io, await cmdStatus(ctx, w));
    case "handoff":
      return emit(io, await cmdHandoff(ctx, w));
    case "session-id":
      return emit(io, await cmdSessionId(ctx, w));
    case "events-file":
      return emit(io, await cmdEventsFile(ctx, w));
    case "stop":
      return emit(io, await cmdStop(ctx, w));
    default:
      io.err(`Error: unknown subcommand '${sub}'
`);
      return 2;
  }
}
function parseListArgs(argv) {
  let all = false;
  let pattern;
  for (const a of argv) {
    if (a === "--all") {
      all = true;
    } else if (a.startsWith("--")) {
      return err(`Error: unknown option '${a}' for list`);
    } else if (pattern !== void 0) {
      return err("Error: list takes at most one pattern argument");
    } else {
      pattern = a;
    }
  }
  return { all, pattern };
}
function parseWaitForTurnArgs(argv) {
  let timeout;
  let afterLine;
  let i = 0;
  while (i < argv.length) {
    const a = argv[i] ?? "";
    if (a === "--after-line") {
      const value = argv[i + 1];
      const n = value !== void 0 ? Number(value) : Number.NaN;
      if (!Number.isFinite(n)) {
        return err("Error: --after-line expects a number for wait-for-turn");
      }
      afterLine = n;
      i += 2;
    } else if (/^[0-9]/.test(a)) {
      timeout = Number(a);
      i += 1;
    } else {
      return err(`Error: unknown option '${a}' for wait-for-turn`);
    }
  }
  return { timeout, afterLine };
}
function parseReadEventsArgs(argv) {
  let last;
  let type;
  let follow = false;
  let i = 0;
  while (i < argv.length) {
    const a = argv[i] ?? "";
    if (a === "--last") {
      const value = argv[i + 1];
      const n = value !== void 0 ? Number(value) : Number.NaN;
      if (!Number.isFinite(n)) {
        return err("Error: --last expects a number for read-events");
      }
      last = n;
      i += 2;
    } else if (a === "--type") {
      const value = argv[i + 1];
      if (value === void 0 || value.startsWith("--")) {
        return err("Error: --type expects a value for read-events");
      }
      type = value;
      i += 2;
    } else if (a === "--follow") {
      follow = true;
      i += 1;
    } else {
      return err(`Error: unknown option '${a}' for read-events`);
    }
  }
  return { last, type, follow };
}
function followStream(ctx, worker, opts, io, signal) {
  const followOpts = { type: opts.type, last: opts.last, pollMs: opts.pollMs };
  if (signal !== void 0) {
    return followEvents(ctx, worker, followOpts, (line) => io.out(`${line}
`), signal).then(
      () => 0
    );
  }
  const controller = new AbortController();
  const onSigint = () => controller.abort();
  process.on("SIGINT", onSigint);
  return followEvents(ctx, worker, followOpts, (line) => io.out(`${line}
`), controller.signal).then(() => 0).finally(() => process.off("SIGINT", onSigint));
}
async function grantConsentConfirm(io, input = process.stdin) {
  io.out("Type 'yes' to grant consent:\n");
  const reply = await readLine(input);
  return reply === "yes";
}
if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
  run2(process.argv.slice(2)).then((c) => process.exit(c)).catch((e) => {
    process.stderr.write(`${e instanceof Error ? e.message : String(e)}
`);
    process.exit(1);
  });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  followStream,
  grantConsentConfirm,
  readLine,
  run
});
