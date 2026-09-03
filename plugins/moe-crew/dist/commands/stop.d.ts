import type { CommandContext, CommandResult } from "./context.js";
export interface StopOpts {
    /** Wait for session_end in SECONDS (default 10). */
    stopTimeout?: number;
    /** Poll interval in ms (default 500). Small values keep tests fast. */
    pollMs?: number;
    /** Settle delay after seeing session_end, ms (default 1000, bash `sleep 1`). */
    settleMs?: number;
}
/**
 * Stop a worker and remove its shim/meta/events.
 *
 * Parity port of bash `cmd_stop`: if the tmux session is alive, send the
 * harness quit keys (claude: `/exit`) + Enter, wait up to `stopTimeout` for a
 * `session_end` event (settling briefly once seen), then kill the session if it
 * somehow survived. Always remove the worker's files at the end.
 */
export declare function cmdStop(ctx: CommandContext, worker: string, opts?: StopOpts): Promise<CommandResult>;
