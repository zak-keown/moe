import type { WorkerEvent } from "../events.js";
export type WorkerStatus = "idle" | "working" | "terminated" | "gone" | "unknown";
/** Read the raw, non-empty JSONL lines of an events file. Returns [] if the file does not exist. */
export declare function readRawLines(file: string): string[];
export declare function appendEvent(file: string, e: WorkerEvent): void;
export declare function readEvents(file: string): WorkerEvent[];
/**
 * The event parsed from the LITERAL last non-empty line of the file, or null if
 * there are no lines OR that last line is malformed. This mirrors bash
 * `_worker_status`' `tail -1 | jq` exactly: a torn/garbage final line yields
 * `unknown` (via the caller's null -> unknown), rather than silently falling
 * back to a prior parseable event the way `readEvents().at(-1)` would. Only the
 * status path consumes this; `readEvents` keeps its skip-malformed behavior for
 * full-stream consumers.
 */
export declare function lastEvent(file: string): WorkerEvent | null;
export declare function waitForEvent(file: string, pred: (e: WorkerEvent) => boolean, timeoutMs: number, pollMs?: number): Promise<WorkerEvent>;
export declare function classifyStatus(last: WorkerEvent): WorkerStatus;
