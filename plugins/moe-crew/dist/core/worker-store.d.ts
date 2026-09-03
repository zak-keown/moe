export interface WorkerMeta {
    tmux_name: string;
    session_id: string;
    cwd: string;
    harness: string;
    [k: string]: unknown;
}
/**
 * Create `dir` privately (mode 0700) if nothing exists there, or verify an
 * existing path is already a real directory owned by the current user.
 * Refuses (throws) otherwise, closing the shared-host precondition that lets
 * another local account pre-plant a directory — or a symlink, which fails
 * the `isDirectory()` check regardless of what it points at — at a
 * predictable worker-dir or per-worker-home path ahead of us. The ownership
 * check no-ops where `process.getuid` is unavailable (native Windows;
 * moe-crew is WSL2-only there per ARCHITECTURE.md, where getuid exists).
 */
export declare function ensureOwnedDir(dir: string): void;
/**
 * Stage a credential file (`src`, the operator's own) into a worker home at
 * `dest`, refusing to ever follow a symlink planted at `dest`. Missing `src`
 * is silently skipped (best effort, matches prior behaviour). `dest` is
 * unlinked first — removing whatever directory entry is there (a symlink,
 * or a stale copy from a prior run reusing the same tmux name) without
 * following it, since unlink acts on the entry itself — then created fresh
 * with O_EXCL|O_NOFOLLOW, which is always safe to open after the unlink and
 * guarantees mode 0600 actually takes effect.
 */
export declare function stageCredentialFile(src: string, dest: string): void;
export declare function writeMeta(dir: string, meta: WorkerMeta): void;
export declare function readMeta(dir: string, sid: string): WorkerMeta | null;
export declare function listWorkers(dir: string): WorkerMeta[];
export declare function resolveSession(dir: string, arg: string): string | null;
export declare function writeShim(dir: string, name: string, moeCrewEntry: string): string;
/**
 * Write the sidecar harness marker for a derive worker (codex), so per-worker
 * commands can resolve the right driver before the meta self-registers.
 */
export declare function writeHarnessMarker(dir: string, name: string, harness: string): void;
/** Read the sidecar harness marker for `name`, or null if it does not exist. */
export declare function readHarnessMarker(dir: string, name: string): string | null;
export declare function removeWorker(dir: string, sid: string, name: string): void;
/**
 * tmux-names that have a leftover `.harness` sidecar or shim but NO registered
 * `<sid>.meta` — orphans from workers that bypassed `stop` (crash, killed tmux,
 * old fixtures). `list` can't see them (it keys off meta) and the gone-worker
 * scan misses them (no meta). A live derive worker in its pre-registration
 * window also has no meta yet, so callers must gate removal on the tmux session
 * being gone.
 */
export declare function listOrphanNames(dir: string): string[];
/** Remove a meta-less worker's leftover sidecar/shim/home (orphan cleanup). */
export declare function removeOrphan(dir: string, name: string): void;
