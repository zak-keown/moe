import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

function gitIn(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf-8" }).trim();
}

function primaryRoot(cwd: string): string {
  const commonDir = gitIn(cwd, "rev-parse", "--git-common-dir");
  const resolved = resolve(cwd, commonDir, "..");
  return gitIn(resolved, "rev-parse", "--show-toplevel");
}

function defaultBranch(cwd: string): string {
  try {
    const ref = gitIn(cwd, "symbolic-ref", "refs/remotes/origin/HEAD");
    return ref.replace("refs/remotes/origin/", "");
  } catch {
    // No remote — check for main, then master, then whatever HEAD is
    try {
      gitIn(cwd, "rev-parse", "--verify", "refs/heads/main");
      return "main";
    } catch {
      try {
        gitIn(cwd, "rev-parse", "--verify", "refs/heads/master");
        return "master";
      } catch {
        return gitIn(cwd, "branch", "--show-current");
      }
    }
  }
}

function ensureGitignored(root: string): void {
  const gitignorePath = join(root, ".gitignore");
  const entry = ".moe/worktrees/";

  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, "utf-8");
    if (content.includes(entry)) return;
    appendFileSync(gitignorePath, `\n${entry}\n`);
  } else {
    writeFileSync(gitignorePath, `${entry}\n`);
  }
}

export interface WorktreeCreateOpts {
  base?: string;
  cwd?: string;
}

export function worktreeCreate(branch: string, opts: WorktreeCreateOpts = {}): string {
  const cwd = opts.cwd ?? process.cwd();
  const root = primaryRoot(cwd);
  const worktreeDir = join(root, ".moe", "worktrees");

  mkdirSync(worktreeDir, { recursive: true });
  ensureGitignored(root);

  const baseBranch = opts.base ?? defaultBranch(root);
  const baseSha = gitIn(root, "rev-parse", `${baseBranch}^{commit}`);

  const wtPath = join(worktreeDir, branch);
  gitIn(root, "worktree", "add", wtPath, "-b", branch, baseSha);

  // Verify lineage
  const mergeBase = gitIn(wtPath, "merge-base", "HEAD", baseSha);
  if (mergeBase !== baseSha) {
    throw new Error(`Lineage verification failed: merge-base ${mergeBase} !== base ${baseSha}`);
  }

  return wtPath;
}

export function worktreeRemove(pathOrBranch: string, opts: { cwd?: string } = {}): void {
  const cwd = opts.cwd ?? process.cwd();
  const root = primaryRoot(cwd);
  const worktreeDir = join(root, ".moe", "worktrees");

  let wtPath: string;
  if (isAbsolute(pathOrBranch)) {
    wtPath = pathOrBranch;
  } else if (existsSync(join(worktreeDir, pathOrBranch))) {
    wtPath = join(worktreeDir, pathOrBranch);
  } else {
    throw new Error(
      `Worktree "${pathOrBranch}" not found in ${worktreeDir}. ` +
        `jig only removes worktrees it created in .moe/worktrees/.`,
    );
  }

  if (!wtPath.startsWith(worktreeDir)) {
    throw new Error(
      `Refusing to remove "${wtPath}" — it is outside .moe/worktrees/. ` +
        `Worktrees in .claude/worktrees/ belong to the harness; remove them there.`,
    );
  }

  gitIn(root, "worktree", "remove", "--force", wtPath);
}

export interface ValidateResult {
  valid: boolean;
  diagnostics: string[];
}

export function worktreeValidate(paths: string[]): ValidateResult {
  const diagnostics: string[] = [];

  // Condition 1: each path is a linked worktree (not main, not submodule)
  for (const p of paths) {
    try {
      const gitDir = resolve(p, gitIn(p, "rev-parse", "--git-dir"));
      const commonDir = resolve(p, gitIn(p, "rev-parse", "--git-common-dir"));
      if (gitDir === commonDir) {
        diagnostics.push(`${p}: is the main checkout, not a linked worktree`);
        continue;
      }
      const superproject = execFileSync(
        "git",
        ["-C", p, "rev-parse", "--show-superproject-working-tree"],
        { encoding: "utf-8" },
      ).trim();
      if (superproject) {
        diagnostics.push(`${p}: is a submodule, not a linked worktree`);
      }
    } catch {
      diagnostics.push(`${p}: not a valid git directory`);
    }
  }

  // Condition 2: paths are pairwise unique
  const resolved = paths.map((p) => resolve(p));
  const uniquePaths = new Set(resolved);
  if (uniquePaths.size !== resolved.length) {
    diagnostics.push("paths are not pairwise unique");
  }

  // Condition 3: git directories are pairwise unique
  const gitDirs: string[] = [];
  for (const p of paths) {
    try {
      gitDirs.push(resolve(p, gitIn(p, "rev-parse", "--git-dir")));
    } catch {
      /* already reported above */
    }
  }
  const uniqueGitDirs = new Set(gitDirs);
  if (uniqueGitDirs.size !== gitDirs.length) {
    diagnostics.push("git directories are not pairwise unique");
  }

  // Condition 4: no path is a prefix of another
  for (let i = 0; i < resolved.length; i++) {
    const a = resolved[i];
    if (a === undefined) continue;
    for (let j = i + 1; j < resolved.length; j++) {
      const b = resolved[j];
      if (b === undefined) continue;
      if (a.startsWith(`${b}/`) || b.startsWith(`${a}/`)) {
        diagnostics.push(`path prefix overlap: ${paths[i]} and ${paths[j]}`);
      }
    }
  }

  return { valid: diagnostics.length === 0, diagnostics };
}
