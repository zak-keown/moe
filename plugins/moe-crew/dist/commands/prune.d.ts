import type { CommandContext, CommandResult } from "./context.js";
/**
 * Remove dead worker state. Two passes: (1) every registered worker whose tmux
 * session is `gone` (meta/events/shim/.harness/home — the bulk equivalent of
 * `stop`); (2) meta-less leftover sidecars/shims whose tmux session is also gone
 * (orphans from workers that bypassed `stop` — invisible to `list`). Live workers
 * — including derive workers in their pre-registration window — are left alone.
 */
export declare function cmdPrune(ctx: CommandContext): Promise<CommandResult>;
