import type { CommandContext, CommandResult } from "./context.js";
/**
 * Print instructions for a human to take over the worker's tmux session. The
 * `$WORKER` token in the resume note is intentionally literal (matching the
 * bash heredoc's `\$WORKER`): it shows the user the shim invocation to avoid.
 */
export declare function cmdHandoff(ctx: CommandContext, worker: string): Promise<CommandResult>;
