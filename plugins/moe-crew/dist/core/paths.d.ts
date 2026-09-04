export declare function workerDir(): string;
export declare function eventsPath(dir: string, sid: string): string;
export declare function metaPath(dir: string, sid: string): string;
/**
 * True when `name` is safe to use as a single on-disk path segment: letters,
 * digits, `_` and `-` only, so it can never carry `/`, `.` or `..` out of the
 * directory it's joined into. Exported so untrusted ids that reach
 * `metaPath`/`eventsPath` from outside this module (e.g. a hook's
 * `session_id`, or pi's self-minted session id) can be checked *before* a
 * path is built from them, rather than after — those two builders take a
 * `sid` that is not always the same trusted tmux_name every other builder
 * here validates, so they cannot enforce this internally without changing
 * their contract for already-validated callers.
 */
export declare function isSafeSegment(name: string): boolean;
export declare function shimPath(dir: string, name: string): string;
/**
 * The per-worker home dir, keyed by tmux_name. Derive harnesses (codex's
 * CODEX_HOME, pi's PI_CODING_AGENT_DIR) stage the operator's auth and config
 * here during `prepare`. Deterministic from tmux_name so it can be re-derived
 * without persisted state; `stop`/`removeWorker` deletes it to clean up the
 * staged credentials.
 */
export declare function workerHomePath(dir: string, name: string): string;
/**
 * The sidecar harness marker keyed by tmux_name. Written at launch for derive
 * harnesses (codex), whose `<sid>.meta` does not exist until the producer
 * self-registers it on the first prompt — so per-worker commands can load the
 * right driver during that pre-registration window. Assign harnesses (claude)
 * carry the harness in the meta from launch and do not need this.
 */
export declare function harnessMarkerPath(dir: string, name: string): string;
/**
 * The sidecar worktree marker keyed by tmux_name. Written at launch when
 * `--worktree` is set; stores the absolute worktree path so `stop` can
 * remove it. Parallels the `.harness` marker.
 */
export declare function worktreeMarkerPath(dir: string, name: string): string;
