import type { CommandContext, CommandResult } from "./context.js";
export interface ReadTurnOpts {
    full?: boolean;
}
/**
 * Render the worker's most recent turn as markdown. Locates the transcript via
 * the harness driver, parses it into a NormalizedTurn, and renders it. The
 * parse/render logic lives in transcript.ts + the driver; this command wires
 * file-read -> driver.parseTurn -> renderTurn.
 */
export declare function cmdReadTurn(ctx: CommandContext, worker: string, opts: ReadTurnOpts): Promise<CommandResult>;
