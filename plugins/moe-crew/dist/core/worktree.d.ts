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
 * it) so `stop` never fails because of a manually cleaned-up worktree.
 */
export declare function removeWorktree(runner: Runner | undefined, repoRoot: string, wtPath: string): Promise<void>;
