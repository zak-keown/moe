import type { CommandContext, CommandResult } from "./context.js";
export interface SendOpts {
    /** Submission-confirm timeout in SECONDS (default 10, honours MOE_CREW_SUBMIT_TIMEOUT). */
    submitTimeout?: number;
    /**
     * Seconds between retry-Enter resends (default 2, honours MOE_CREW_SUBMIT_RETRY_INTERVAL).
     * Controls both the derive-worker pre-registration Enter cadence (sendDeriveFirst's
     * poll loop) and the post-paste submission-confirm cadence (confirmSubmission).
     */
    retryInterval?: number;
    /** Poll interval in ms (default 250). Small values keep tests fast. */
    pollMs?: number;
    /**
     * Pre-registration window timeout in SECONDS (default 15, honours
     * MOE_CREW_REGISTER_TIMEOUT). Only used on the first send to a derive worker
     * (codex), while polling for the hook-self-registered `<sid>.meta` to appear.
     */
    registerTimeout?: number;
    /** Poll interval in ms while waiting for the meta (default 250). */
    registerPollMs?: number;
}
/**
 * Port of the bash `_prompt_submitted_since`: has a `user_prompt_submit` event
 * appeared after line `beforeLine` of the events file? This is the worker's
 * ground-truth signal that the harness accepted a prompt.
 */
export declare function promptSubmittedSince(eventFile: string, beforeLine: number): boolean;
/**
 * Send a prompt to a worker as a bracketed paste, then confirm submission via
 * the `user_prompt_submit` event (issue #20).
 *
 * Parity port of bash `cmd_send`: the prompt is wrapped in bracketed-paste
 * markers (with any embedded markers stripped so a hostile prompt can't inject
 * its own) and sent as one literal send-keys. Enter is then sent and re-sent
 * every `retryInterval` seconds until the worker emits `user_prompt_submit`
 * (after the events file's pre-send line count) or `submitTimeout` elapses.
 */
/**
 * True when this is the FIRST prompt to a derive worker (codex/pi): the harness
 * mints its own id on the first prompt, so no `<sid>.meta` exists yet and the
 * worker can only be addressed by its tmux_name. `cmdSend` routes this to
 * `sendDeriveFirst` (paste-by-name, poll for the self-registered meta);
 * `cmdConverse` uses the same predicate to send-before-resolve. The claude
 * (assign) path and every subsequent send to a registered derive worker are
 * false here and take the normal resolve-then-send path.
 */
export declare function isDeriveFirst(ctx: CommandContext, worker: string): boolean;
export declare function cmdSend(ctx: CommandContext, worker: string, prompt: string, opts?: SendOpts): Promise<CommandResult>;
