import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { isoSecondsUtc } from "./time.js";
import { eventsPath } from "./paths.js";
import { readRawLines } from "./event-log.js";
import { parseEvent } from "../events.js";
import type { WorkerEvent } from "../events.js";

export interface RunMeta {
  id: string;
  label?: string;
  workers: string[];
  startedAt: string;
  endedAt?: string;
}

/** The directory that holds a single run's metadata. */
function runDir(workerDir: string, runId: string): string {
  return join(workerDir, "runs", runId);
}

/** The path to a run's metadata file. */
function runMetaPath(workerDir: string, runId: string): string {
  return join(runDir(workerDir, runId), "run.json");
}

function readRunMeta(workerDir: string, runId: string): RunMeta | null {
  const p = runMetaPath(workerDir, runId);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as RunMeta;
  } catch {
    return null;
  }
}

function writeRunMeta(workerDir: string, meta: RunMeta): void {
  const dir = runDir(workerDir, meta.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(runMetaPath(workerDir, meta.id), JSON.stringify(meta, null, 2) + "\n");
}

/**
 * Start a new run. Creates `runs/<run-id>/run.json` with the initial metadata
 * and returns the run id.
 */
export function startRun(workerDir: string, label?: string): string {
  const id = randomUUID();
  const meta: RunMeta = {
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
export function endRun(workerDir: string, runId: string): RunMeta | null {
  const meta = readRunMeta(workerDir, runId);
  if (meta === null) return null;
  meta.endedAt = isoSecondsUtc();
  writeRunMeta(workerDir, meta);
  return meta;
}

/**
 * Register a worker name into a run's worker list. Appends the name only if
 * it is not already present (idempotent).
 * Returns the updated RunMeta, or null if the run does not exist.
 */
export function addWorkerToRun(
  workerDir: string,
  runId: string,
  workerName: string,
): RunMeta | null {
  const meta = readRunMeta(workerDir, runId);
  if (meta === null) return null;
  if (!meta.workers.includes(workerName)) {
    meta.workers.push(workerName);
    writeRunMeta(workerDir, meta);
  }
  return meta;
}

/** List all runs by reading the runs/ directory. Returns RunMeta[], newest first. */
export function listRuns(workerDir: string): RunMeta[] {
  const runsRoot = join(workerDir, "runs");
  if (!existsSync(runsRoot)) return [];
  const entries = readdirSync(runsRoot, { withFileTypes: true });
  const metas: RunMeta[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const meta = readRunMeta(workerDir, entry.name);
    if (meta !== null) metas.push(meta);
  }
  // Newest first by startedAt.
  metas.sort((a, b) => (a.startedAt > b.startedAt ? -1 : a.startedAt < b.startedAt ? 1 : 0));
  return metas;
}

/** A merged event with its source worker name attached. */
export interface MergedEvent {
  worker: string;
  event: WorkerEvent;
}

/**
 * Merge per-worker JSONL event streams for all workers in a run, sorted by
 * timestamp. Each worker's session id is resolved from the worker store; if a
 * worker has no events file it is silently skipped.
 *
 * `resolveSession` is injected so the caller (the CLI command) can supply the
 * real resolver without this module importing the full worker-store.
 */
export function mergeRunEvents(
  workerDir: string,
  runId: string,
  resolveSession: (dir: string, worker: string) => string | null,
): MergedEvent[] {
  const meta = readRunMeta(workerDir, runId);
  if (meta === null) return [];

  const merged: MergedEvent[] = [];
  for (const worker of meta.workers) {
    const sid = resolveSession(workerDir, worker);
    if (sid === null) continue;
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
