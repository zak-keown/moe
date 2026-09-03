import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseEvent } from "../events.js";
import { readRawLines } from "./event-log.js";
import { eventsPath } from "./paths.js";
import { isoSecondsUtc } from "./time.js";
/** The directory that holds a single run's metadata. */
function runDir(workerDir, runId) {
    return join(workerDir, "runs", runId);
}
/** The path to a run's metadata file. */
function runMetaPath(workerDir, runId) {
    return join(runDir(workerDir, runId), "run.json");
}
function readRunMeta(workerDir, runId) {
    const p = runMetaPath(workerDir, runId);
    if (!existsSync(p))
        return null;
    try {
        return JSON.parse(readFileSync(p, "utf8"));
    }
    catch {
        return null;
    }
}
function writeRunMeta(workerDir, meta) {
    const dir = runDir(workerDir, meta.id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(runMetaPath(workerDir, meta.id), JSON.stringify(meta, null, 2) + "\n");
}
/**
 * Start a new run. Creates `runs/<run-id>/run.json` with the initial metadata
 * and returns the run id.
 */
export function startRun(workerDir, label) {
    const id = randomUUID();
    const meta = {
        id,
        ...(label !== undefined ? { label } : {}),
        workers: [],
        startedAt: isoSecondsUtc(),
    };
    writeRunMeta(workerDir, meta);
    return id;
}
/**
 * End a run. Stamps `endedAt` on the run metadata.
 * Returns the final RunMeta, or null if the run does not exist.
 */
export function endRun(workerDir, runId) {
    const meta = readRunMeta(workerDir, runId);
    if (meta === null)
        return null;
    meta.endedAt = isoSecondsUtc();
    writeRunMeta(workerDir, meta);
    return meta;
}
/**
 * Register a worker name into a run's worker list. Appends the name only if
 * it is not already present (idempotent).
 * Returns the updated RunMeta, or null if the run does not exist.
 */
export function addWorkerToRun(workerDir, runId, workerName) {
    const meta = readRunMeta(workerDir, runId);
    if (meta === null)
        return null;
    if (!meta.workers.includes(workerName)) {
        meta.workers.push(workerName);
        writeRunMeta(workerDir, meta);
    }
    return meta;
}
/** List all runs by reading the runs/ directory. Returns RunMeta[], newest first. */
export function listRuns(workerDir) {
    const runsRoot = join(workerDir, "runs");
    if (!existsSync(runsRoot))
        return [];
    const entries = readdirSync(runsRoot, { withFileTypes: true });
    const metas = [];
    for (const entry of entries) {
        if (!entry.isDirectory())
            continue;
        const meta = readRunMeta(workerDir, entry.name);
        if (meta !== null)
            metas.push(meta);
    }
    // Newest first by startedAt.
    metas.sort((a, b) => (a.startedAt > b.startedAt ? -1 : a.startedAt < b.startedAt ? 1 : 0));
    return metas;
}
/**
 * Merge per-worker JSONL event streams for all workers in a run, sorted by
 * timestamp. Each worker's session id is resolved from the worker store; if a
 * worker has no events file it is silently skipped.
 *
 * `resolveSession` is injected so the caller (the CLI command) can supply the
 * real resolver without this module importing the full worker-store.
 */
export function mergeRunEvents(workerDir, runId, resolveSession) {
    const meta = readRunMeta(workerDir, runId);
    if (meta === null)
        return [];
    const merged = [];
    for (const worker of meta.workers) {
        const sid = resolveSession(workerDir, worker);
        if (sid === null)
            continue;
        const file = eventsPath(workerDir, sid);
        const lines = readRawLines(file);
        for (const line of lines) {
            const parsed = parseEvent(line);
            if (parsed !== null) {
                merged.push({ worker, event: parsed });
            }
        }
    }
    // Stable sort by timestamp, preserving per-worker order for same-ts events.
    merged.sort((a, b) => (a.event.ts < b.event.ts ? -1 : a.event.ts > b.event.ts ? 1 : 0));
    return merged;
}
export { readRunMeta };
