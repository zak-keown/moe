import type { Tmux } from "../core/tmux.js";
import type { WorkerMeta } from "../core/worker-store.js";
import type { HarnessDriver } from "../harness/driver.js";
export interface CommandContext {
    workerDir: string;
    home: string;
    environment?: NodeJS.ProcessEnv;
    tmux: Tmux;
    driver: HarnessDriver;
}
export interface CommandResult {
    stdout?: string;
    stderr?: string;
    code: number;
}
/**
 * Resolve a worker arg (session id or tmux_name alias) to its session id and
 * meta, or a code-1 error CommandResult the caller can return directly.
 *
 * Callers discriminate on the shape: a successful resolve has `sid`/`meta`; an
 * error result has `code`. Use `'code' in result` to branch.
 */
export declare function resolveWorker(ctx: CommandContext, worker: string): {
    sid: string;
    meta: WorkerMeta;
} | CommandResult;
