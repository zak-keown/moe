import type { Runner } from "../core/proc.js";
import type { CommandContext, CommandResult } from "./context.js";
import { type SendOpts } from "./send.js";
export interface ConverseOpts {
    /** Render the full markdown turn instead of just the last assistant text. */
    withTurn?: boolean;
    /** Wait-for-turn timeout in SECONDS (default 120). */
    timeout?: number;
    /** Knobs forwarded to cmdSend (keeps submission confirm fast in tests). */
    sendOpts?: SendOpts;
    /** Poll interval forwarded to cmdWaitForTurn, ms. */
    waitPollMs?: number;
    /** Post-turn assistant-text poll attempts (default 20). */
    postPollCount?: number;
    /** Post-turn poll interval, ms (default 100). */
    postPollMs?: number;
    /** Injectable timestamp for diagnostics (default ISO now). */
    now?: () => string;
    /** Injectable process runner for the diagnostics ps dump. */
    diagRun?: Runner;
}
/**
 * Send a prompt to a worker, wait for the turn to finish, and return the
 * worker's reply.
 *
 * Parity port of bash `cmd_converse`, made harness-aware. The bash version
 * detected "did the worker reply?" with claude-only jq counting the assistant
 * text messages; that recognized neither codex rollouts nor pi sessions, so
 * converse always timed out for those harnesses. Here the turn-complete signal
 * is harness-agnostic — `cmdWaitForTurn` blocks on the `stop`/`session_end`
 * event the worker emits after the prompt — and the reply text is extracted by
 * driving the worker's transcript through `driver.parseTurn` (the same
 * normalized turn model `read-turn` renders), then joining the assistant text.
 * On a wait-for-turn timeout or a no-reply timeout, dumps a diagnostic when
 * `MOE_CREW_CONVERSE_DIAG_FILE` is set.
 */
export declare function cmdConverse(ctx: CommandContext, worker: string, prompt: string, opts: ConverseOpts): Promise<CommandResult>;
