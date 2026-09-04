import type { Runner } from "./proc.js";
/** Build the absolute worktree path for a given repo root and worker name. */
export declare function worktreePath(repoRoot: string, name: string): string;
/**
 * Create a disposable git worktree for a worker.
 *
 * Runs `git worktree add --detach <path> <ref>` (detached HEAD avoids creating
 * a branch per worker). Returns the absolute worktree path on success. Throws
 * on failure (e.g. not a git repo, ref doesn't exist).
 *
 * Uses the Runner DI so tests can mock the git call.
 */
export declare function createWorktree(runner: Runner | undefined, repoRoot: string, name: string, ref?: string): Promise<string>;
/**
 * Remove a disposable git worktree.
 *
 * Runs `git worktree remove --force <path>`. Swallows errors when the worktree
 * has already been removed (the path does not exist or git does not know about
 * it) so `stop` never fails because of a manually cleaned-up worktree. Never
 * throws (stop must not fail) — instead, resolves `true` on success (including
 * when the worktree was already gone) and `false` on a real failure (e.g.
 * permission denied), so a caller that wants to know can check the return
 * value; a caller that doesn't (most don't — stop intentionally never fails on
 * worktree cleanup) can keep discarding it exactly as before (CR-074).
 */
export declare function removeWorktree(runner: Runner | undefined, repoRoot: string, wtPath: string): Promise<boolean>;
