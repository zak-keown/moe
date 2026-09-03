/**
 * The converse post-mortem diagnostic dump. A parity port of the bash
 * `_dump_converse_diag` (upstream skills/driving-claude-code-sessions/scripts/csd).
 *
 * Best-effort: writes a multi-section snapshot (ps tree + tmux capture + harness
 * JSONL tail + moe-crew events tail) to `dest`, OVERWRITING it. Returns true on a
 * successful write, false if the dir-create or write fails — so the caller can
 * suppress its "see <dest>" pointer.
 */
import { type Runner } from "./proc.js";
import type { Tmux } from "./tmux.js";
export interface ConverseDiagOpts {
    sid: string;
    worker: string;
    tmuxName: string;
    logFile: string;
    eventFile: string;
    timeout: number;
    dest: string;
    reason: string;
    tmux: Tmux;
    /** Injectable timestamp (e.g. `() => new Date().toISOString()`). */
    now: () => string;
    /** Process runner used for `ps`; injectable so tests can stub it. */
    run?: Runner | undefined;
}
export declare function dumpConverseDiag(opts: ConverseDiagOpts): Promise<boolean>;
