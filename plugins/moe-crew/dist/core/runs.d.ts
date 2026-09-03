import type { WorkerEvent } from "../events.js";
export interface RunMeta {
    id: string;
    label?: string;
    workers: string[];
    startedAt: string;
    endedAt?: string;
}
declare function readRunMeta(workerDir: string, runId: string): RunMeta | null;
/**
 * Start a new run. Creates `runs/<run-id>/run.json` with the initial metadata
 * and returns the run id.
 */
export declare function startRun(workerDir: string, label?: string): string;
/**
 * End a run. Stamps `endedAt` on the run metadata.
 * Returns the final RunMeta, or null if the run does not exist.
 */
export declare function endRun(workerDir: string, runId: string): RunMeta | null;
/**
 * Register a worker name into a run's worker list. Appends the name only if
 * it is not already present (idempotent).
 * Returns the updated RunMeta, or null if the run does not exist.
 */
export declare function addWorkerToRun(workerDir: string, runId: string, workerName: string): RunMeta | null;
/** List all runs by reading the runs/ directory. Returns RunMeta[], newest first. */
export declare function listRuns(workerDir: string): RunMeta[];
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
export declare function mergeRunEvents(workerDir: string, runId: string, resolveSession: (dir: string, worker: string) => string | null): MergedEvent[];
export { readRunMeta };
