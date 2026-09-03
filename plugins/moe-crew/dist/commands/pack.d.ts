import type { CommandContext, CommandResult } from "./context.js";
import type { BootstrapOpts } from "./launch.js";
export interface PackArgs {
    packFile: string;
    cwd: string;
}
/**
 * Launch all workers defined in a pack file, then send each its role prompt.
 *
 * For each worker in the pack definition:
 * 1. `cmdLaunch` with name = `<packName>-<namePrefix>-<index>`, harness from
 *    the worker or the default "claude", cwd from the argument.
 * 2. `cmdSend` with the worker's rolePrompt.
 *
 * Returns a summary or the first fatal error.
 */
export declare function cmdPack(ctx: CommandContext, args: PackArgs, opts: BootstrapOpts): Promise<CommandResult>;
export interface PackStopArgs {
    /** Either a pack file path (ends in .yaml/.yml/.json) or a pack name. */
    nameOrFile: string;
}
/**
 * Stop all workers belonging to a pack. Identifies the pack by name: if the
 * argument looks like a file path, loads it to read the name; otherwise uses
 * the argument as a direct name. Finds all workers in the store whose
 * tmux_name starts with `<packName>-` and stops each one.
 */
export declare function cmdPackStop(ctx: CommandContext, args: PackStopArgs): Promise<CommandResult>;
