import type { PackDefinition } from "../core/packs.js";
import type { HarnessId } from "../harness/driver.js";
import { type HarnessResolutionFailure } from "../harness/resolver.js";
import type { CommandContext, CommandResult } from "./context.js";
import type { BootstrapOpts } from "./launch.js";
export interface PackArgs {
    packFile: string;
    cwd: string;
    /** `--harness`, used as the command-wide pack default. */
    harness?: HarnessId | undefined;
    /** Injectable environment default for tests and programmatic callers. */
    environmentHarness?: unknown;
    /** Injectable executable-detection result for tests and programmatic callers. */
    installedHarnesses?: readonly HarnessId[] | undefined;
}
export type PackHarnessResolution = {
    ok: true;
    harnesses: HarnessId[];
} | HarnessResolutionFailure;
/** Resolve every pack worker before any session is launched. */
export declare function resolvePackHarnesses(pack: PackDefinition, defaults: {
    command?: unknown;
    environment?: unknown;
    installed: readonly HarnessId[];
}): PackHarnessResolution;
/**
 * Launch all workers defined in a pack file, then send each its role prompt.
 *
 * For each worker in the pack definition:
 * 1. Resolve every harness without side effects, then `cmdLaunch` with name =
 *    `<packName>-<namePrefix>-<index>` and cwd from the argument.
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
 * tmux_name starts with `<packName>-` and stops each one. Marker-only derive
 * workers are included because their first send may fail before metadata is
 * registered.
 */
export declare function cmdPackStop(ctx: CommandContext, args: PackStopArgs): Promise<CommandResult>;
