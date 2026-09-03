import type { WorkerStatus } from "../core/event-log.js";
import type { WorkerMeta } from "../core/worker-store.js";
import type { CommandContext, CommandResult } from "./context.js";
/**
 * Compute the current status for a worker given its meta.
 * Reused by the list command.
 */
export declare function computeStatus(ctx: CommandContext, meta: WorkerMeta): Promise<WorkerStatus>;
export declare function cmdStatus(ctx: CommandContext, worker: string): Promise<CommandResult>;
