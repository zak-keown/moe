import type { CommandContext, CommandResult } from "./context.js";
export interface ReadEventsOpts {
    last?: number | undefined;
    type?: string | undefined;
}
/**
 * Read events from a worker's event file (non-follow path). Emits the RAW JSONL
 * lines so a consumer gets exactly what's in the file; the `--type` filter
 * parses each line only to check its `.event`, but emits the original raw line.
 *
 * `--follow` is a streaming command (tail -f) and is NOT handled here — the CLI
 * calls `followEvents` directly for follow. A `follow: true` opt is ignored by
 * this function.
 */
export declare function cmdReadEvents(ctx: CommandContext, worker: string, opts: ReadEventsOpts): Promise<CommandResult>;
export interface FollowEventsOpts {
    type?: string | undefined;
    /**
     * Cap the initial backlog to the last N matching lines before following, so a
     * long-lived worker isn't fully re-ingested on every monitor start. `0` skips
     * the backlog entirely (follow only NEW events). Omitted = replay everything.
     */
    last?: number | undefined;
    pollMs?: number | undefined;
}
/**
 * Tail a worker's event file: emit the existing backlog (optionally capped to the
 * last N matching lines via `last`), then poll for newly appended lines and emit
 * those, until `signal` aborts. With a `type` filter, only matching lines reach
 * `sink`.
 *
 * The CLI wires `sink` to `process.stdout.write` and runs this until SIGINT.
 * Unlike `cmdReadEvents`, this never validates the type (the CLI validates
 * up front) — an unknown type simply matches nothing.
 */
export declare function followEvents(ctx: CommandContext, worker: string, opts: FollowEventsOpts, sink: (line: string) => void, signal?: AbortSignal): Promise<void>;
