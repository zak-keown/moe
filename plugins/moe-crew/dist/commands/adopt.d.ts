import type { CommandContext, CommandResult } from "./context.js";
import { type BootstrapOpts } from "./launch.js";
export interface AdoptArgs {
    tmuxName: string;
    cwd: string;
    /** The existing Claude session id to resume. */
    sessionId: string;
    extraArgs: string[];
}
/**
 * Re-attach to an existing Claude session after a reboot. Parity port of bash
 * `cmd_adopt` (upstream bash `csd`:791-905). Claude-only: there is no `--harness` flag, so the
 * driver is always claude.
 *
 * `claude --resume <id>` preserves the session id, so the worker's runtime
 * session_id equals the supplied id. The meta is pre-written keyed by that id
 * BEFORE claude starts, because the SessionStart hook only records events once a
 * meta exists for the session. If a tmux session already exists (e.g. restored
 * by tmux-resurrect), its pane is respawned in place to preserve the window
 * layout; otherwise a new detached session is opened.
 *
 * The proof-of-life wait and its teardown-on-timeout mirror launch; see
 * `cmdLaunch` for the driver-orchestration notes.
 */
export declare function cmdAdopt(ctx: CommandContext, args: AdoptArgs, opts: BootstrapOpts): Promise<CommandResult>;
