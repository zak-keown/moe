/**
 * Codex launch-time tmux dances. Parity port of the bash codex driver's
 * `harness_post_launch` + `harness_await_ready` (drivers/codex.sh).
 *
 * These live in the command layer (not the HarnessDriver) because they need
 * `ctx.tmux` (capture/sendText/sendEnter) — context the driver's
 * `postLaunch(tmuxName)` / `awaitReady(tmuxName, sessionId)` slots do not
 * receive. The launch command calls them on the derive (codex) path, mirroring
 * how `awaitSessionStart` owns claude's proof-of-life wait.
 *
 * Both are best-effort: a worker that never shows the gate / composer still
 * "launches" (codex's `--dangerously-bypass-hook-trust` can race the gate, and
 * codex emits no session_start until the first prompt, so there is no hard
 * proof-of-life signal at launch — the meta self-registers on the first send).
 */
import type { CommandContext } from "./context.js";
export interface CodexTrustGateOpts {
    /** Trust-gate window in ms (bash: 8s). */
    timeoutMs?: number | undefined;
    /** Poll interval in ms (bash: 250ms). */
    pollMs?: number | undefined;
    /** Delay between sending '2' and Enter in ms (bash: 300ms). */
    settleMs?: number | undefined;
}
export interface CodexComposerOpts {
    /** Composer-ready window in ms (bash: 20s). */
    timeoutMs?: number | undefined;
    /** Poll interval in ms (bash: 500ms). */
    pollMs?: number | undefined;
}
/**
 * Dismiss codex's "Hooks need review" trust gate. Poll the pane; when the gate
 * text appears, choose option 2 ("Trust all and continue") by sending '2', a
 * short settle, then Enter. Best-effort: if the gate never appears within the
 * window, return having done nothing.
 */
export declare function dismissCodexTrustGate(ctx: CommandContext, tmuxName: string, opts?: CodexTrustGateOpts): Promise<void>;
/**
 * Block until codex's composer is ready (its prompt glyph `›` is visible), or
 * settle after the window. derive readiness has no hard signal — codex's
 * session_start fires at the first prompt, not at boot — so this is best-effort:
 * it returns success on timeout, and the first send re-confirms via the hook's
 * meta self-registration.
 */
export declare function awaitComposerReady(ctx: CommandContext, tmuxName: string, opts?: CodexComposerOpts): Promise<void>;
