/**
 * The Claude Code harness driver. Parity port of the bash `claude.sh` driver
 * (skills/driving-claude-code-sessions/scripts/drivers/claude.sh).
 *
 * Claude's control plane is hooks; the controller assigns the session id; quit
 * is `/exit`. `prepare`/`postLaunch`/`awaitReady` are no-ops here — the launch
 * command (A11j) owns Claude's trust-dialog handling and the
 * await-session-start wait, since those need the full launch-time context.
 */
import type { HarnessDriver } from "./driver.js";
/** Claude's harness-specific transcript location and cwd encoding. */
export declare function claudeTranscriptPath(home: string, cwd: string, sid: string): string;
/**
 * Build the `-e KEY=VALUE` pins for a Claude worker's tmux env, as a record
 * (tmux.newSession expands a record into `-e K=V` pairs; an empty-string value
 * becomes `-e VAR=`, which is exactly the pin-empty behaviour).
 *
 * `CLAUDE_CODE_SSE_PORT` is always pinned empty: it is the IDE socket port, only
 * ever a UI channel and never an auth channel, so a headless worker must not
 * auto-connect to the controller's IDE socket.
 *
 * `CLAUDE_CODE_SESSION_ID` and `CLAUDE_CODE_CHILD_SESSION` are always pinned empty:
 * when moe-crew is driven from INSIDE a Claude session, the tmux SERVER's global env
 * carries the controller's session identity, and a worker must be an independent
 * top-level session, not a continuation of the controller's. Each breaks session
 * logs in a distinct way (verified live):
 *  - `CLAUDE_CODE_SESSION_ID`: Claude honours it OVER the worker's `--session-id`
 *    flag, so the worker writes its turns into the CONTROLLER's transcript
 *    (`~/.claude/projects/<cwd>/<controller-id>.jsonl`), corrupting it.
 *  - `CLAUDE_CODE_CHILD_SESSION`: marks the process a sub-session, which suppresses
 *    its own transcript persistence entirely — so `read-turn`/`converse` find no
 *    session log even once the id is correct.
 * Pinning both empty makes the worker a clean session keyed by its `--session-id`.
 */
export declare function claudeWorkerEnv(controllerEnv?: NodeJS.ProcessEnv): Record<string, string>;
export declare const claude: HarnessDriver;
