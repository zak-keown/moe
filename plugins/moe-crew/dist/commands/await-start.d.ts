import type { CommandContext } from "./context.js";
export interface AwaitStartOpts {
    /** Trust-dialog window in ms (bash: 5s). */
    trustTimeoutMs?: number;
    /** session_start window in ms (bash: 30s). */
    startTimeoutMs?: number;
    /** Poll interval in ms (bash: 250ms in phase 1, 500ms in phase 2). */
    pollMs?: number;
}
/**
 * Success carries no message; failure always carries the full stderr text the
 * caller should emit. The discriminated union makes that invariant type-enforced.
 */
export type AwaitStartResult = {
    started: true;
} | {
    started: false;
    failureMessage: string;
};
/**
 * Accept any trust dialog, then block until the worker emits `session_start`.
 * Parity port of bash `_await_session_start` (upstream bash `csd`:557-605).
 *
 * Lives in the command layer (not the driver) because it needs `ctx.tmux`
 * (capture/sendEnter) and `ctx.workerDir` (the events file) — context the
 * driver's `awaitReady(tmuxName, sessionId)` slot does not receive. The launch
 * command calls this directly for claude; Phase B/C will generalize the
 * proof-of-life wait through the driver for codex/pi.
 *
 * On timeout it tears the worker down (kill session, remove meta+events+shim)
 * and returns `started: false` with the failure text for the caller to print.
 */
export declare function awaitSessionStart(ctx: CommandContext, tmuxName: string, sessionId: string, opts?: AwaitStartOpts): Promise<AwaitStartResult>;
