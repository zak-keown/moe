import { join } from "node:path";
import { run as realRun } from "./proc.js";
/**
 * The parent directory under the repo root where disposable per-worker
 * worktrees are created. Deterministic from the repo root so `stop` can
 * re-derive it without stored state.
 */
const WORKTREE_DIR = ".moe-worktrees";
/** Build the absolute worktree path for a given repo root and worker name. */
export function worktreePath(repoRoot, name) {
    return join(repoRoot, WORKTREE_DIR, name);
}
/**
 * Create a disposable git worktree for a worker.
 *
 * Runs `git worktree add --detach <path> <ref>` (detached HEAD avoids creating
 * a branch per worker). Returns the absolute worktree path on success. Throws
 * on failure (e.g. not a git repo, ref doesn't exist).
 *
 * Uses the Runner DI so tests can mock the git call.
 */
export async function createWorktree(runner = realRun, repoRoot, name, ref = "HEAD") {
    const wt = worktreePath(repoRoot, name);
    const result = await runner("git", [
        "-C",
        repoRoot,
        "worktree",
        "add",
        "--detach",
        wt,
        ref,
    ]);
    if (result.code !== 0) {
        throw new Error(`git worktree add failed (code ${result.code}): ${result.stderr.trim()}`);
    }
    return wt;
}
/**
 * Remove a disposable git worktree.
 *
 * Runs `git worktree remove --force <path>`. Swallows errors when the worktree
 * has already been removed (the path does not exist or git does not know about
 * it) so `stop` never fails because of a manually cleaned-up worktree.
 */
export async function removeWorktree(runner = realRun, repoRoot, wtPath) {
    const result = await runner("git", [
        "-C",
        repoRoot,
        "worktree",
        "remove",
        "--force",
        wtPath,
    ]);
    // Swallow "not a working tree" / path-doesn't-exist errors gracefully.
    if (result.code !== 0) {
        const msg = result.stderr.toLowerCase();
        if (msg.includes("not a working tree") || msg.includes("is not a valid")) {
            return; // already gone — not an error
        }
        // Also swallow when the directory simply doesn't exist any more.
        if (msg.includes("no such file") || msg.includes("does not exist")) {
            return;
        }
        // Real failure — let the caller know, but don't throw (stop must not fail).
        // Prune the worktree entry from git's internal list as a fallback.
        await runner("git", ["-C", repoRoot, "worktree", "prune"]);
    }
}
