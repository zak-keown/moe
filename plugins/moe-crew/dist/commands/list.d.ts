import type { CommandContext, CommandResult } from "./context.js";
export interface ListOpts {
    /** Include `gone` workers (default false hides them). */
    all?: boolean | undefined;
    /** Substring filter on tmux_name. */
    pattern?: string | undefined;
}
/**
 * List the known workers as a TAB-separated table.
 *
 * One row per registered worker (status from the shared `computeStatus`, `gone`
 * hidden unless `all`), plus an `unregistered` row for each derive worker that
 * has launched but not yet minted its id — a live tmux session + `.harness`
 * sidecar with no meta (RE-2; invisible otherwise). The optional substring
 * `pattern` filters on tmux_name. When nothing matches, emit `No workers found`
 * on stderr rather than a bare header (RE-6).
 */
export declare function cmdList(ctx: CommandContext, opts: ListOpts): Promise<CommandResult>;
