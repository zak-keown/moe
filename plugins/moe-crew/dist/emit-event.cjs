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

// packages/crew/src/hooks/emit-event.ts
var emit_event_exports = {};
__export(emit_event_exports, {
  runHook: () => runHook
});
module.exports = __toCommonJS(emit_event_exports);
var import_node_fs3 = require("fs");

// packages/crew/src/core/event-log.ts
var import_node_fs = require("fs");

// packages/crew/src/events.ts
function serializeEvent(e) {
  return JSON.stringify(e);
}

// packages/crew/src/core/event-log.ts
function appendEvent(file, e) {
  (0, import_node_fs.appendFileSync)(file, `${serializeEvent(e)}
`);
}

// packages/crew/src/core/paths.ts
var import_node_os = require("os");
var import_node_path = require("path");
function defaultWorkerDir() {
  const xdgRuntimeDir = process.env.XDG_RUNTIME_DIR;
  if (xdgRuntimeDir) return (0, import_node_path.join)(xdgRuntimeDir, "moe-crew-workers");
  return (0, import_node_path.join)((0, import_node_os.homedir)(), ".local", "state", "moe-crew", "workers");
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
function isSafeSegment(name) {
  return /^[A-Za-z0-9_-]+$/.test(name);
}

// packages/crew/src/core/time.ts
function isoSecondsUtc(date = /* @__PURE__ */ new Date()) {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

// packages/crew/src/core/worker-store.ts
var import_node_fs2 = require("fs");
var import_node_path2 = require("path");
function writeMeta(dir, meta) {
  (0, import_node_fs2.mkdirSync)(dir, { recursive: true });
  (0, import_node_fs2.writeFileSync)(metaPath(dir, meta.session_id), JSON.stringify(meta));
}

// packages/crew/src/hooks/emit-event.ts
var EVENT_MAP = {
  SessionStart: "session_start",
  Stop: "stop",
  UserPromptSubmit: "user_prompt_submit",
  SessionEnd: "session_end",
  PreToolUse: "pre_tool_use",
  PostToolUse: "post_tool_use"
};
function asRecord(v) {
  return typeof v === "object" && v !== null ? v : null;
}
function asString(v) {
  return typeof v === "string" ? v : "";
}
function runHook(opts) {
  const empty = { stdout: "" };
  let parsed;
  try {
    parsed = JSON.parse(opts.stdin);
  } catch {
    return empty;
  }
  const payload = asRecord(parsed);
  if (payload === null) return empty;
  const sessionId = payload.session_id;
  if (typeof sessionId !== "string" || sessionId.length === 0 || !isSafeSegment(sessionId))
    return empty;
  if (opts.baked !== void 0 && !(0, import_node_fs3.existsSync)(metaPath(opts.workerDir, sessionId))) {
    const transcriptPath = asString(payload.transcript_path);
    writeMeta(opts.workerDir, {
      tmux_name: opts.baked.tmuxName,
      session_id: sessionId,
      cwd: opts.baked.cwd,
      harness: "codex",
      ...transcriptPath.length > 0 ? { transcript_path: transcriptPath } : {}
    });
  }
  if (!(0, import_node_fs3.existsSync)(metaPath(opts.workerDir, sessionId))) return empty;
  const hookEventName = asString(payload.hook_event_name);
  const event = EVENT_MAP[hookEventName];
  if (event === void 0) return empty;
  const ts = opts.now();
  const worker = buildEvent(event, ts, payload);
  const runId = opts.runId ?? process.env.MOE_CREW_RUN_ID;
  if (runId !== void 0 && runId.length > 0) {
    worker.runId = runId;
  }
  appendEvent(eventsPath(opts.workerDir, sessionId), worker);
  const stdout = hookEventName === "Stop" ? '{"decision":"approve"}' : "";
  return { stdout, appended: worker };
}
function buildEvent(event, ts, payload) {
  switch (event) {
    case "session_start": {
      const cwd = asString(payload.cwd);
      return cwd.length > 0 ? { event, ts, cwd } : { event, ts };
    }
    case "pre_tool_use": {
      const toolInput = payload.tool_input;
      return {
        event,
        ts,
        tool: asString(payload.tool_name),
        tool_input: typeof toolInput === "object" && toolInput !== null ? toolInput : {}
      };
    }
    case "post_tool_use":
      return { event, ts, tool: asString(payload.tool_name) };
    // run_start/run_end are envelope events created by the runs module, never
    // by the harness hook (they are not in EVENT_MAP). Handle them here only
    // to satisfy the exhaustive type — the runId comes from the payload.
    case "run_start":
      return { event, ts, runId: asString(payload.runId) };
    case "run_end":
      return { event, ts, runId: asString(payload.runId) };
    default:
      return { event, ts };
  }
}
function readStdin(timeoutMs = 5e3) {
  return new Promise((resolve) => {
    let data = "";
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish(data), timeoutMs);
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => finish(data));
    process.stdin.on("error", () => finish(data));
  });
}
async function main() {
  const stdin = await readStdin();
  const args = process.argv.slice(2);
  let baked;
  let dir = workerDir();
  if (args.length >= 3) {
    const [tmuxName = "", cwd = "", bakedWorkerDir = ""] = args;
    if (bakedWorkerDir.length === 0) {
      process.exit(0);
    }
    baked = { tmuxName, cwd };
    dir = bakedWorkerDir;
  }
  const result = runHook({
    stdin,
    workerDir: dir,
    now: () => isoSecondsUtc(),
    baked
  });
  if (result.stdout.length > 0) {
    process.stdout.write(`${result.stdout}
`);
  }
  process.exit(0);
}
if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
  void main();
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  runHook
});
