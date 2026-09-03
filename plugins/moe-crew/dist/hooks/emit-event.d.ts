import type { WorkerEvent } from "../events.js";
/**
 * The session lifecycle hook for Claude Code (and Codex). Claude/Codex invoke
 * the bundled `dist/emit-event.cjs` on each lifecycle event, piping the hook
 * payload JSON on stdin. The hook appends a normalized WorkerEvent to the
 * worker's events JSONL file — but only for managed worker sessions (those
 * with a `<session_id>.meta` file under the worker dir).
 *
 * Ported from the original bash/jq hook (issue #15: bash and jq are not on
 * Claude Code's hook PATH on Windows). Behavior is observation-only: it records
 * what a worker is doing so a controller can watch the event stream.
 */
/** What the entry point should print to stdout, plus the event it appended. */
export interface HookResult {
    stdout: string;
    appended?: WorkerEvent;
}
interface HookOptions {
    /** Raw hook payload string read from stdin. */
    stdin: string;
    /** Worker dir where `<sid>.meta` and `<sid>.events.jsonl` live. */
    workerDir: string;
    /** Injectable clock: returns the ISO-8601 ts to stamp on the event. */
    now: () => string;
    /**
     * Codex's baked hook args (tmux_name, cwd). Present only on the derive path:
     * codex mints its own session id, so no `<sid>.meta` can exist at launch. When
     * given, the hook SELF-REGISTERS `<sid>.meta` (harness `codex`) on the first
     * event for that sid. Absent on the claude path, where the meta is written at
     * launch and a missing meta means "not a managed worker" (no-op).
     */
    baked?: {
        tmuxName: string;
        cwd: string;
    } | undefined;
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
export declare function runHook(opts: HookOptions): HookResult;
export {};
