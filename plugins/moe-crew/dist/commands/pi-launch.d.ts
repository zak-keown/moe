/**
 * Pi launch-time tmux wait. The pi analog of codex-launch's trust-gate/composer
 * dance — but far lighter, because pi has NO trust gate and no special launch
 * approval. The only thing moe-crew waits for is that pi's TUI has come up and is
 * showing its prompt/status bar, so a subsequent `send` paste lands in a live
 * composer rather than racing the boot.
 *
 * Like the codex helpers, this lives in the command layer (not the HarnessDriver)
 * because it needs `ctx.tmux.capturePane` — context the driver's
 * `awaitReady(tmuxName, sessionId)` slot does not receive.
 *
 * BEST-EFFORT: pi is ready quickly once launched, and the REAL proof a pi worker
 * is usable is that its extension self-registers the meta on the first prompt
 * (mirroring codex). So this never throws and returns success on timeout — a
 * worker whose status bar never matched still "launches"; the first send
 * re-confirms via the extension's meta self-registration.
 */
import type { CommandContext } from "./context.js";
export interface PiReadyOpts {
    /** Ready window in ms (default 10s — pi is fast to boot). */
    timeoutMs?: number | undefined;
    /** Poll interval in ms (default 250ms). */
    pollMs?: number | undefined;
}
/**
 * Block until pi's composer/status bar is visible in the pane, or settle after
 * the window. Best-effort: returns on timeout (no hard proof-of-life signal at
 * boot — the meta self-registers on the first prompt), never throws.
 */
export declare function awaitPiReady(ctx: CommandContext, tmuxName: string, opts?: PiReadyOpts): Promise<void>;
