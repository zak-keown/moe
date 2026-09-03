import { chmodSync, closeSync, constants, existsSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync, writeSync, } from "node:fs";
import { dirname, join } from "node:path";
import { eventsPath, harnessMarkerPath, metaPath, shimPath, workerHomePath } from "./paths.js";
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
export function ensureOwnedDir(dir) {
    let st;
    try {
        st = lstatSync(dir);
    }
    catch {
        mkdirSync(dir, { recursive: true, mode: 0o700 });
        return;
    }
    if (!st.isDirectory()) {
        throw new Error(`refusing to use ${dir}: not a real directory (possibly a planted symlink)`);
    }
    const uid = process.getuid?.();
    if (uid !== undefined && st.uid !== uid) {
        throw new Error(`refusing to use ${dir}: not owned by the current user`);
    }
}
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
export function stageCredentialFile(src, dest) {
    if (!existsSync(src))
        return;
    const data = readFileSync(src);
    try {
        unlinkSync(dest);
    }
    catch {
        // nothing there yet
    }
    const fd = openSync(dest, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try {
        writeSync(fd, data);
    }
    finally {
        closeSync(fd);
    }
}
export function writeMeta(dir, meta) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(metaPath(dir, meta.session_id), JSON.stringify(meta));
}
export function readMeta(dir, sid) {
    const p = metaPath(dir, sid);
    if (!existsSync(p))
        return null;
    try {
        return JSON.parse(readFileSync(p, "utf8"));
    }
    catch {
        return null;
    }
}
export function listWorkers(dir) {
    if (!existsSync(dir))
        return [];
    return readdirSync(dir)
        .filter((f) => f.endsWith(".meta"))
        .flatMap((f) => {
        const sid = f.slice(0, -".meta".length);
        const meta = readMeta(dir, sid);
        return meta !== null ? [meta] : [];
    });
}
export function resolveSession(dir, arg) {
    if (existsSync(metaPath(dir, arg)) || existsSync(eventsPath(dir, arg))) {
        return arg;
    }
    const match = listWorkers(dir).find((m) => m.tmux_name === arg);
    return match?.session_id ?? null;
}
export function writeShim(dir, name, moeCrewEntry) {
    const p = shimPath(dir, name);
    mkdirSync(dirname(p), { recursive: true });
    const content = `#!/usr/bin/env bash\nexec node "${moeCrewEntry}" --worker "${name}" "$@"\n`;
    writeFileSync(p, content);
    chmodSync(p, 0o755);
    return p;
}
/**
 * Write the sidecar harness marker for a derive worker (codex), so per-worker
 * commands can resolve the right driver before the meta self-registers.
 */
export function writeHarnessMarker(dir, name, harness) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(harnessMarkerPath(dir, name), harness);
}
/** Read the sidecar harness marker for `name`, or null if it does not exist. */
export function readHarnessMarker(dir, name) {
    const p = harnessMarkerPath(dir, name);
    if (!existsSync(p))
        return null;
    try {
        return readFileSync(p, "utf8").trim() || null;
    }
    catch {
        return null;
    }
}
export function removeWorker(dir, sid, name) {
    rmSync(metaPath(dir, sid), { force: true });
    rmSync(eventsPath(dir, sid), { force: true });
    rmSync(shimPath(dir, name), { force: true });
    rmSync(harnessMarkerPath(dir, name), { force: true });
    // The per-worker home (codex/pi staged the operator's auth.json here during
    // prepare); remove it recursively so stop leaves no staged credentials behind.
    rmSync(workerHomePath(dir, name), { recursive: true, force: true });
}
/**
 * tmux-names that have a leftover `.harness` sidecar or shim but NO registered
 * `<sid>.meta` — orphans from workers that bypassed `stop` (crash, killed tmux,
 * old fixtures). `list` can't see them (it keys off meta) and the gone-worker
 * scan misses them (no meta). A live derive worker in its pre-registration
 * window also has no meta yet, so callers must gate removal on the tmux session
 * being gone.
 */
export function listOrphanNames(dir) {
    const registered = new Set(listWorkers(dir).map((m) => m.tmux_name));
    const names = new Set();
    if (existsSync(dir)) {
        for (const f of readdirSync(dir)) {
            if (f.endsWith(".harness"))
                names.add(f.slice(0, -".harness".length));
        }
    }
    const bin = join(dir, "bin");
    if (existsSync(bin)) {
        for (const f of readdirSync(bin))
            names.add(f);
    }
    return [...names].filter((n) => !registered.has(n));
}
/** Remove a meta-less worker's leftover sidecar/shim/home (orphan cleanup). */
export function removeOrphan(dir, name) {
    rmSync(shimPath(dir, name), { force: true });
    rmSync(harnessMarkerPath(dir, name), { force: true });
    rmSync(workerHomePath(dir, name), { recursive: true, force: true });
}
