import { homedir } from "node:os";
import { join } from "node:path";
/**
 * Everything under the worker dir — meta/events (world-readable at 0644,
 * embedding full tool_input), the executable shim, and each derive
 * harness's staged operator credentials — used to default under the
 * shared, world-traversable /tmp, keyed by the operator-chosen tmux name
 * rather than a random id. On a host with another local account, that
 * account could enumerate the low-entropy names and pre-plant a directory
 * (or a symlink) at a predictable path ahead of us. Default to a private,
 * per-user location instead: $XDG_RUNTIME_DIR (already 0700 and
 * session-scoped on Linux) when set, else ~/.local/state/moe-crew/workers.
 * ensureOwnedDir (worker-store.ts) additionally refuses to use an existing
 * root that isn't a real directory owned by the current user, so even an
 * explicit MOE_CREW_WORKER_DIR override pointed at a shared location is
 * covered.
 */
function defaultWorkerDir() {
    const xdgRuntimeDir = process.env.XDG_RUNTIME_DIR;
    if (xdgRuntimeDir)
        return join(xdgRuntimeDir, "moe-crew-workers");
    return join(homedir(), ".local", "state", "moe-crew", "workers");
}
export function workerDir() {
    return process.env.MOE_CREW_WORKER_DIR ?? defaultWorkerDir();
}
export function eventsPath(dir, sid) {
    return `${dir}/${sid}.events.jsonl`;
}
export function metaPath(dir, sid) {
    return `${dir}/${sid}.meta`;
}
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
export function isSafeSegment(name) {
    return /^[A-Za-z0-9_-]+$/.test(name);
}
/**
 * tmux_name (and any other worker name keyed into these paths) is untrusted:
 * it round-trips through a `.meta` file on disk, which a co-resident local
 * user can plant ahead of `prune`/`stop`. Require a single safe path segment
 * so it can never carry `/`, `.` or `..` out of the worker dir.
 */
function assertSafeSegment(name) {
    if (!isSafeSegment(name)) {
        throw new Error(`unsafe worker name (must be a single [A-Za-z0-9_-]+ segment): ${JSON.stringify(name)}`);
    }
}
export function shimPath(dir, name) {
    assertSafeSegment(name);
    return `${dir}/bin/${name}`;
}
/**
 * The per-worker home dir, keyed by tmux_name. Derive harnesses (codex's
 * CODEX_HOME, pi's PI_CODING_AGENT_DIR) stage the operator's auth and config
 * here during `prepare`. Deterministic from tmux_name so it can be re-derived
 * without persisted state; `stop`/`removeWorker` deletes it to clean up the
 * staged credentials.
 */
export function workerHomePath(dir, name) {
    assertSafeSegment(name);
    return `${dir}/homes/${name}`;
}
/**
 * The sidecar harness marker keyed by tmux_name. Written at launch for derive
 * harnesses (codex), whose `<sid>.meta` does not exist until the producer
 * self-registers it on the first prompt — so per-worker commands can load the
 * right driver during that pre-registration window. Assign harnesses (claude)
 * carry the harness in the meta from launch and do not need this.
 */
export function harnessMarkerPath(dir, name) {
    assertSafeSegment(name);
    return `${dir}/${name}.harness`;
}
/**
 * The sidecar worktree marker keyed by tmux_name. Written at launch when
 * `--worktree` is set; stores the absolute worktree path so `stop` can
 * remove it. Parallels the `.harness` marker.
 */
export function worktreeMarkerPath(dir, name) {
    assertSafeSegment(name);
    return `${dir}/${name}.worktree`;
}
