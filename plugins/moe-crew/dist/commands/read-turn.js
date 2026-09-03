import { existsSync, readFileSync } from "node:fs";
import { renderTurnForCommand } from "../core/transcript.js";
import { resolveWorker } from "./context.js";
/**
 * Render the worker's most recent turn as markdown. Locates the transcript via
 * the harness driver, parses it into a NormalizedTurn, and renders it. The
 * parse/render logic lives in transcript.ts + the driver; this command wires
 * file-read -> driver.parseTurn -> renderTurn.
 */
export async function cmdReadTurn(ctx, worker, opts) {
    const resolved = resolveWorker(ctx, worker);
    if ("code" in resolved)
        return resolved;
    const { sid, meta } = resolved;
    if (!meta.cwd) {
        return {
            stderr: "Error: Could not determine working directory from meta file",
            code: 1,
        };
    }
    const logFile = ctx.driver.transcriptPath(sid, meta.cwd, ctx.home);
    if (!existsSync(logFile)) {
        return { stderr: `Error: Session log not found at ${logFile}`, code: 1 };
    }
    const turn = ctx.driver.parseTurn(readFileSync(logFile, "utf8"));
    if (turn.length === 0) {
        return { stderr: "No user prompt found in session log", code: 1 };
    }
    return {
        stdout: renderTurnForCommand(turn, { full: opts.full ?? false }),
        code: 0,
    };
}
