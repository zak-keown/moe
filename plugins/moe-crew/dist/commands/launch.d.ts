import type { CommandContext, CommandResult } from "./context.js";
/** The shared bootstrap options launch and adopt both accept. */
export interface BootstrapOpts {
    /** Plugin root, passed to the harness via `--plugin-dir`. */
    pluginDir: string;
    /** Absolute path to the moe-crew entry (dist/moe-crew.cjs) baked into each worker shim. */
    moeCrewEntry: string;
    /** The moe-crew command path used in the reproduce line + consent message. */
    moeCrewPath: string;
    /** awaitSessionStart timing overrides (tests pass tiny values). */
    trustTimeoutMs?: number;
    startTimeoutMs?: number;
    pollMs?: number;
    /**
     * Codex (derive) launch-gate timing overrides (tests pass tiny values): the
     * trust-gate dismissal window and the composer-ready window. Unused on the
     * claude (assign) path.
     */
    codexTrustTimeoutMs?: number;
    codexReadyTimeoutMs?: number;
    codexTrustSettleMs?: number;
    /**
     * Pi (derive) launch-ready timing override (tests pass tiny values): the
     * status-bar/composer-ready window. Unused on the claude/codex paths.
     */
    piReadyTimeoutMs?: number;
}
export interface LaunchArgs {
    tmuxName: string;
    cwd: string;
    extraArgs: string[];
    /**
     * The harness to launch; the command resolves its own driver from this via
     * getDriver, which validates the id (the CLI also validates it at parse time).
     */
    harness: string;
}
/** The one-time-consent error, matching the bash text. */
export declare function consentError(moeCrewPath: string): CommandResult;
/**
 * Validate that cwd is an existing directory and resolve it to an absolute
 * realpath (bash `pwd -P`). Returns the resolved path, or a code-1 result.
 */
export declare function resolveCwd(cwd: string): string | CommandResult;
/** Render the status panel printed to stderr by launch/adopt. */
export declare function renderPanel(opts: {
    header: string;
    verb: string;
    tmuxName: string;
    sessionId: string;
    cwd: string;
    eventsFile: string;
    moeCrewPath: string;
    invocation: string[];
}): string;
/**
 * The per-worker home dir for a derive harness (codex's CODEX_HOME). Deterministic
 * from tmux_name so it can be re-derived without persisted state. Each worker gets
 * its own config/auth/sessions dir under `<workerDir>/homes/<tmuxName>` — the same
 * path `removeWorker` cleans up on stop (single source of truth in `paths.ts`).
 */
export declare function deriveWorkerHome(workerDir: string, tmuxName: string): string;
/**
 * Launch a fresh worker. Parity port of bash `cmd_launch` (upstream `csd` PR #21).
 *
 * The harness is chosen here, so launch resolves its OWN driver from `harness`
 * (ignoring `ctx.driver`). Two id strategies branch after the shared setup
 * (cwd validation, consent, collision, dir setup):
 *
 * - `assign` (claude): moe-crew generates the session id, pre-writes the meta keyed
 *   by it (so the SessionStart hook can record events), and proof-of-life is a
 *   `session_start` event (orchestrated by `awaitSessionStart`).
 * - `derive` (codex): codex mints its OWN id at the first prompt, so moe-crew does
 *   NOT generate an id or pre-write a meta — instead it writes a sidecar
 *   `.harness` marker (so per-worker commands resolve the codex driver during
 *   the pre-registration window) and the producer self-registers the meta on
 *   the first prompt. There is no session_start at boot, so "proof-of-life" is
 *   best-effort: dismiss the trust gate, then wait for the composer to be ready.
 */
export declare function cmdLaunch(ctx: CommandContext, args: LaunchArgs, opts: BootstrapOpts): Promise<CommandResult>;
