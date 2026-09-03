/**
 * The Codex (OpenAI) harness driver. Parity port of the bash `codex.sh` driver
 * (skills/driving-claude-code-sessions/scripts/drivers/codex.sh), validated
 * end-to-end against codex 0.134.
 *
 * Codex's control plane is hooks (the SAME node `emit-event.cjs` bundle as
 * claude); the harness mints its OWN session id (idStrategy `derive`), so the
 * hook self-registers the worker meta — hence the hook command bakes the
 * tmux_name/cwd/worker_dir as positional args (B3 teaches emit-event to accept
 * them). `prepare` writes a per-worker `CODEX_HOME/config.toml` registering the
 * hook on every lifecycle event and trusting the project, and stages the
 * operator's `~/.codex/auth.json` so the worker authenticates as the operator.
 *
 * The TOML is built with a properly-quoted, escaping generator (no unquoted
 * interpolation): a cwd with spaces or quotes survives both as the
 * `[projects."<cwd>"]` table key and inside the shell-quoted hook `command`.
 *
 * `postLaunch` (dismiss the trust gate) and `awaitReady` (poll for the composer)
 * need tmux, which this interface does not hand the driver; they are documented
 * stubs here and the real tmux dance is wired into the launch command (B2/B4).
 */
import type { HarnessDriver } from "./driver.js";
/** The per-worker tmux env: codex reads its config/auth/sessions from CODEX_HOME. */
export declare function codexWorkerEnv(workerHome: string): Record<string, string>;
/**
 * Build the `config.toml` text for a worker. The hook `command` bakes the three
 * positional args (tmux_name, cwd, worker_dir) the self-registering hook needs,
 * each shell-quoted so codex's shell exec handles spaces/specials.
 */
export declare function buildCodexConfig(opts: {
    cwd: string;
    model: string;
    hookCommand: string;
}): string;
export declare const codex: HarnessDriver;
