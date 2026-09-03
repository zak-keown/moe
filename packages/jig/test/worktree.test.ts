import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

function gitIn(dir: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: dir, encoding: "utf-8" }).trim();
}

function makeRepo(): string {
  // realpath'd because git's own path resolution (e.g. rev-parse
  // --show-toplevel) resolves symlinks — on macOS, os.tmpdir() lives under
  // /var, which is itself a symlink to /private/var. Without this, a raw
  // mkdtempSync() path and a git-resolved path for the same directory would
  // compare unequal.
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "jig-test-")));
  gitIn(dir, "init", "--initial-branch", "main");
  gitIn(dir, "config", "user.email", "test@test.com");
  gitIn(dir, "config", "user.name", "Test");
  execFileSync("touch", ["file.txt"], { cwd: dir });
  gitIn(dir, "add", ".");
  gitIn(dir, "commit", "-m", "initial");
  return dir;
}

describe("worktreeCreate", () => {
  let repo: string;

  beforeEach(() => {
    repo = makeRepo();
  });

  afterEach(() => {
    // Clean up worktrees before removing the repo
    try {
      const list = gitIn(repo, "worktree", "list", "--porcelain");
      for (const line of list.split("\n")) {
        if (line.startsWith("worktree ") && !line.endsWith(repo)) {
          const wt = line.replace("worktree ", "");
          gitIn(repo, "worktree", "remove", "--force", wt);
        }
      }
    } catch {
      /* ignore */
    }
    rmSync(repo, { recursive: true, force: true });
  });

  it("creates a worktree in .moe/worktrees/", async () => {
    const { worktreeCreate } = await import("../src/worktree.js");
    const result = worktreeCreate("feature-x", { cwd: repo });
    expect(result).toBe(join(repo, ".moe", "worktrees", "feature-x"));
    expect(existsSync(result)).toBe(true);
  });

  it("ensures .moe/worktrees is gitignored", async () => {
    const { worktreeCreate } = await import("../src/worktree.js");
    worktreeCreate("feature-y", { cwd: repo });
    const gitignore = readFileSync(join(repo, ".gitignore"), "utf-8");
    expect(gitignore).toContain(".moe/worktrees/");
  });

  it("creates worktree from specified base", async () => {
    const { worktreeCreate } = await import("../src/worktree.js");
    const baseSha = gitIn(repo, "rev-parse", "HEAD");
    // Add another commit so HEAD moves
    execFileSync("touch", ["second.txt"], { cwd: repo });
    gitIn(repo, "add", ".");
    gitIn(repo, "commit", "-m", "second");

    const result = worktreeCreate("from-base", { base: baseSha, cwd: repo });
    const wtHead = gitIn(result, "rev-parse", "HEAD");
    expect(wtHead).toBe(baseSha);
  });

  it("defaults base to the default branch", async () => {
    const { worktreeCreate } = await import("../src/worktree.js");
    const headSha = gitIn(repo, "rev-parse", "HEAD");
    const result = worktreeCreate("default-base", { cwd: repo });
    const wtHead = gitIn(result, "rev-parse", "HEAD");
    expect(wtHead).toBe(headSha);
  });

  it("refuses to create if branch already exists", async () => {
    const { worktreeCreate } = await import("../src/worktree.js");
    worktreeCreate("dup-branch", { cwd: repo });
    expect(() => worktreeCreate("dup-branch", { cwd: repo })).toThrow();
  });
});

describe("worktreeRemove", () => {
  let repo: string;

  beforeEach(() => {
    repo = makeRepo();
  });

  afterEach(() => {
    try {
      const list = gitIn(repo, "worktree", "list", "--porcelain");
      for (const line of list.split("\n")) {
        if (line.startsWith("worktree ") && !line.endsWith(repo)) {
          gitIn(repo, "worktree", "remove", "--force", line.replace("worktree ", ""));
        }
      }
    } catch {
      /* ignore */
    }
    rmSync(repo, { recursive: true, force: true });
  });

  it("removes a jig-created worktree by branch name", async () => {
    const { worktreeCreate, worktreeRemove } = await import("../src/worktree.js");
    const path = worktreeCreate("remove-me", { cwd: repo });
    expect(existsSync(path)).toBe(true);
    worktreeRemove("remove-me", { cwd: repo });
    expect(existsSync(path)).toBe(false);
  });

  it("refuses to remove a worktree outside .moe/worktrees/", async () => {
    const { worktreeRemove } = await import("../src/worktree.js");
    expect(() => worktreeRemove("/tmp/some-other-worktree", { cwd: repo })).toThrow(
      /outside \.moe\/worktrees/,
    );
  });
});

describe("worktreeValidate", () => {
  let repo: string;

  beforeEach(() => {
    repo = makeRepo();
  });

  afterEach(() => {
    try {
      const list = gitIn(repo, "worktree", "list", "--porcelain");
      for (const line of list.split("\n")) {
        if (line.startsWith("worktree ") && !line.endsWith(repo)) {
          gitIn(repo, "worktree", "remove", "--force", line.replace("worktree ", ""));
        }
      }
    } catch {
      /* ignore */
    }
    rmSync(repo, { recursive: true, force: true });
  });

  it("passes for valid pairwise-unique worktrees", async () => {
    const { worktreeCreate, worktreeValidate } = await import("../src/worktree.js");
    const a = worktreeCreate("wt-a", { cwd: repo });
    const b = worktreeCreate("wt-b", { cwd: repo });
    const result = worktreeValidate([a, b]);
    expect(result.valid).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("fails if the main checkout is included", async () => {
    const { worktreeCreate, worktreeValidate } = await import("../src/worktree.js");
    const a = worktreeCreate("wt-only", { cwd: repo });
    const result = worktreeValidate([a, repo]);
    expect(result.valid).toBe(false);
    expect(result.diagnostics.some((d: string) => d.includes("main checkout"))).toBe(true);
  });

  it("fails for duplicate paths", async () => {
    const { worktreeCreate, worktreeValidate } = await import("../src/worktree.js");
    const a = worktreeCreate("wt-dup", { cwd: repo });
    const result = worktreeValidate([a, a]);
    expect(result.valid).toBe(false);
    expect(result.diagnostics.some((d: string) => d.includes("pairwise unique"))).toBe(true);
  });
});
