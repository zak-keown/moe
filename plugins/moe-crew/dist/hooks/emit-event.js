import { existsSync } from "node:fs";
import { appendEvent } from "../core/event-log.js";
import { eventsPath, metaPath, workerDir } from "../core/paths.js";
import { isoSecondsUtc } from "../core/time.js";
import { writeMeta } from "../core/worker-store.js";
/** Claude/Codex hook event names mapped to our snake_case WorkerEvent names. */
const EVENT_MAP = {
    SessionStart: "session_start",
    Stop: "stop",
    UserPromptSubmit: "user_prompt_submit",
    SessionEnd: "session_end",
    PreToolUse: "pre_tool_use",
    PostToolUse: "post_tool_use",
};
function asRecord(v) {
    return typeof v === "object" && v !== null ? v : null;
}
function asString(v) {
    return typeof v === "string" ? v : "";
}
/**
 * Pure hook logic: parse the payload, append a WorkerEvent if this is a managed
 * worker session with a recognized event, and report what to print on stdout.
 *
 * Never throws on malformed or unexpected input — empty/invalid JSON, missing
 * session_id, missing meta, or an unrecognized event name all return
 * `{ stdout: '' }` with nothing appended. A non-zero exit on the Stop hook can
 * break session shutdown (issue #15), so the entry point must always exit 0.
 * (I/O errors such as disk-full from appendFileSync are not suppressed.)
 */
export function runHook(opts) {
    const empty = { stdout: "" };
    let parsed;
    try {
        parsed = JSON.parse(opts.stdin);
    }
    catch {
        return empty;
    }
    const payload = asRecord(parsed);
    if (payload === null)
        return empty;
    const sessionId = payload.session_id;
    if (typeof sessionId !== "string" || sessionId.length === 0)
        return empty;
    // Codex (derive) path: self-register the worker meta on the first event for
    // this sid, since moe-crew could not pre-write it at launch (it did not know the
    // id codex would mint). The claude path leaves `baked` undefined and so keeps
    // the no-op-without-meta behavior below.
    if (opts.baked !== undefined && !existsSync(metaPath(opts.workerDir, sessionId))) {
        const transcriptPath = asString(payload.transcript_path);
        writeMeta(opts.workerDir, {
            tmux_name: opts.baked.tmuxName,
            session_id: sessionId,
            cwd: opts.baked.cwd,
            harness: "codex",
            ...(transcriptPath.length > 0 ? { transcript_path: transcriptPath } : {}),
        });
    }
    // Only emit for managed worker sessions.
    if (!existsSync(metaPath(opts.workerDir, sessionId)))
        return empty;
    const hookEventName = asString(payload.hook_event_name);
    const event = EVENT_MAP[hookEventName];
    // Unrecognized event name: keep the events file clean and typed.
    if (event === undefined)
        return empty;
    const ts = opts.now();
    const worker = buildEvent(event, ts, payload);
    // When the worker is part of a run, stamp the runId on the event so
    // downstream consumers can correlate events to runs without reading run.json.
    const runId = opts.runId ?? process.env.MOE_CREW_RUN_ID;
    if (runId !== undefined && runId.length > 0) {
        worker.runId = runId;
    }
    appendEvent(eventsPath(opts.workerDir, sessionId), worker);
    // Stop must approve so the hook never blocks the agent.
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
                tool_input: typeof toolInput === "object" && toolInput !== null ? toolInput : {},
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
/**
 * Reads all of stdin, resolving the empty string on a 5s timeout. Without the
 * timeout, a caller that fails to close stdin would hang the hook forever,
 * leaking processes on every event (issue #9).
 */
function readStdin(timeoutMs = 5000) {
    return new Promise((resolve) => {
        let data = "";
        let done = false;
        const finish = (value) => {
            if (done)
                return;
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
    // Codex's config.toml bakes `<tmux_name> <cwd> <worker_dir>` as positional
    // args (claude's hooks.json passes none). When all three are present, take the
    // derive path: self-register the meta and use the baked worker dir (the worker
    // env does not carry MOE_CREW_WORKER_DIR). An empty worker_dir means no-op, mirroring
    // the bash hook's `[ -z "$WD" ] && exit 0`.
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
        baked,
    });
    if (result.stdout.length > 0) {
        process.stdout.write(`${result.stdout}\n`);
    }
    process.exit(0);
}
// Run main() only when executed as the bundled CLI (`node dist/emit-event.cjs`).
// In the tsup CJS bundle `require.main === module` is true only then; under
// vitest's ESM import of this source `module`/`require` are not the CJS entry,
// so main() does not fire and no stdin read happens during tests.
if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
    void main();
}
