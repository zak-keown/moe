import type { CommandContext, CommandResult } from "./context.js";
export interface WaitForTurnOpts {
    /** Timeout in SECONDS (default 60). */
    timeout?: number | undefined;
    /**
     * Skip this many leading lines of the events file before scanning for a
     * turn-end. Default: the file's current line count when the call starts — i.e.
     * block until the NEXT turn-end, not one already in the file from a previous
     * turn. (`converse` passes an explicit baseline captured before it sends.)
     */
    afterLine?: number | undefined;
    /** Poll interval in ms (default 500). Small values keep tests fast. */
    pollMs?: number | undefined;
}
/**
 * Block until the worker finishes a turn: the first `stop` or `session_end`
 * event appended after the baseline. The baseline defaults to the events file's
 * current line count, so a bare `wait-for-turn` waits for the NEXT turn-end
 * rather than returning a stale one from a previous turn. Emits the matching
 * event's RAW JSONL line.
 *
 * A single deadline governs both the wait-for-file-to-exist phase and the
 * poll-for-turn-end phase. On the turn poll, only lines beyond what's already
 * been checked are scanned for the first matching event.
 */
export declare function cmdWaitForTurn(ctx: CommandContext, worker: string, opts: WaitForTurnOpts): Promise<CommandResult>;
