import { dirname } from "node:path";
import { listOrphanNames, listWorkers, readWorktreeMarker, removeOrphan, removeWorker, } from "../core/worker-store.js";
import { removeWorktree } from "../core/worktree.js";
import { computeStatus } from "./status.js";
/**
 * Remove the disposable git worktree at `wtPath`, if any (CR-027). Callers
 * must read the worktree marker before deleting it via removeWorker/removeOrphan.
 */
async function removeAssociatedWorktree(wtPath) {
    if (!wtPath)
        return;
    const repoRoot = dirname(dirname(wtPath));
    await removeWorktree(undefined, repoRoot, wtPath);
}
/**
 * Remove dead worker state. Two passes: (1) every registered worker whose tmux
 * session is `gone` (meta/events/shim/.harness/home — the bulk equivalent of
 * `stop`); (2) meta-less leftover sidecars/shims whose tmux session is also gone
 * (orphans from workers that bypassed `stop` — invisible to `list`). Live workers
 * — including derive workers in their pre-registration window — are left alone.
 */
export async function cmdPrune(ctx) {
    const removed = [];
    for (const meta of listWorkers(ctx.workerDir)) {
        if ((await computeStatus(ctx, meta)) !== "gone")
            continue;
        // Read the marker BEFORE removeWorker deletes it, mirroring cmdStop. The
        // meta's `worktree` field is a fallback for workers whose marker was lost.
        const wtPath = readWorktreeMarker(ctx.workerDir, meta.tmux_name) ?? meta.worktree;
        removeWorker(ctx.workerDir, meta.session_id, meta.tmux_name);
        await removeAssociatedWorktree(wtPath);
        removed.push(meta.tmux_name);
    }
    for (const name of listOrphanNames(ctx.workerDir)) {
        // A live worker without a meta is a derive worker mid-registration — keep it.
        if (await ctx.tmux.hasSession(name))
            continue;
        const wtPath = readWorktreeMarker(ctx.workerDir, name);
        removeOrphan(ctx.workerDir, name);
        await removeAssociatedWorktree(wtPath);
        removed.push(name);
    }
    if (removed.length === 0) {
        return { stderr: "Nothing to prune", code: 0 };
    }
    return {
        stdout: `Pruned ${removed.length} dead worker(s)/orphan(s): ${removed.join(", ")}`,
        code: 0,
    };
}
