import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { parseEvent, serializeEvent } from "../events.js";
/** Read the raw, non-empty JSONL lines of an events file. Returns [] if the file does not exist. */
export function readRawLines(file) {
    if (!existsSync(file))
        return [];
    return readFileSync(file, "utf8")
        .split("\n")
        .filter((line) => line.length > 0);
}
export function appendEvent(file, e) {
    appendFileSync(file, `${serializeEvent(e)}\n`);
}
export function readEvents(file) {
    if (!existsSync(file))
        return [];
    const raw = readFileSync(file, "utf8");
    return raw
        .split("\n")
        .filter((line) => line.length > 0)
        .map(parseEvent)
        .filter((e) => e !== null);
}
/**
 * The event parsed from the LITERAL last non-empty line of the file, or null if
 * there are no lines OR that last line is malformed. This mirrors bash
 * `_worker_status`' `tail -1 | jq` exactly: a torn/garbage final line yields
 * `unknown` (via the caller's null -> unknown), rather than silently falling
 * back to a prior parseable event the way `readEvents().at(-1)` would. Only the
 * status path consumes this; `readEvents` keeps its skip-malformed behavior for
 * full-stream consumers.
 */
export function lastEvent(file) {
    const lines = readRawLines(file);
    const last = lines.at(-1);
    return last === undefined ? null : parseEvent(last);
}
export async function waitForEvent(file, pred, timeoutMs, pollMs = 100) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const match = readEvents(file).find(pred);
        if (match !== undefined)
            return match;
        if (Date.now() >= deadline) {
            throw new Error(`waitForEvent timed out after ${timeoutMs}ms`);
        }
        await new Promise((r) => setTimeout(r, pollMs));
    }
}
export function classifyStatus(last) {
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
        default: {
            const _exhaustive = last;
            return _exhaustive;
        }
    }
}
