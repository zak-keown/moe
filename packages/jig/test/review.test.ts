import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

function gitIn(dir: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: dir, encoding: "utf-8" }).trim();
}

function makeRepo(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "jig-review-")));
  gitIn(dir, "init", "--initial-branch", "main");
  gitIn(dir, "config", "user.email", "test@test.com");
  gitIn(dir, "config", "user.name", "Test");
  writeFileSync(join(dir, "file.txt"), "initial\n");
  gitIn(dir, "add", ".");
  gitIn(dir, "commit", "-m", "initial");
  return dir;
}

describe("reviewStamp", () => {
  let repo: string;

  beforeEach(() => {
    repo = makeRepo();
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it("creates a stamp commit with the correct message format", async () => {
    const { reviewStamp } = await import("../src/review.js");
    const fixSha = gitIn(repo, "rev-parse", "HEAD");
    const stampSha = reviewStamp("CR-001", fixSha, { cwd: repo });
    expect(stampSha).toMatch(/^[0-9a-f]{40}$/);
    const subject = gitIn(repo, "log", "-1", "--format=%s", stampSha);
    expect(subject).toBe(`fix(review): CR-001 — addressed by ${fixSha}`);
    // Stamp commit should have no file changes
    const diffStat = gitIn(repo, "diff-tree", "--no-commit-id", "--name-only", "-r", stampSha);
    expect(diffStat).toBe("");
  });

  it("rejects an invalid CR-ID", async () => {
    const { reviewStamp } = await import("../src/review.js");
    const sha = gitIn(repo, "rev-parse", "HEAD");
    expect(() => reviewStamp("CR-1", sha, { cwd: repo })).toThrow(/Invalid CR-ID/);
    expect(() => reviewStamp("cr-001", sha, { cwd: repo })).toThrow(/Invalid CR-ID/);
    expect(() => reviewStamp("CR-0012", sha, { cwd: repo })).toThrow(/Invalid CR-ID/);
    expect(() => reviewStamp("ISSUE-001", sha, { cwd: repo })).toThrow(/Invalid CR-ID/);
  });

  it("rejects a SHA that does not resolve to a commit", async () => {
    const { reviewStamp } = await import("../src/review.js");
    expect(() => reviewStamp("CR-001", "deadbeef12345678dead", { cwd: repo })).toThrow(
      /does not resolve to a commit/,
    );
  });

  it("rejects a SHA not reachable from HEAD", async () => {
    const { reviewStamp } = await import("../src/review.js");
    // Create a branch B with its own commit, then switch back to main
    gitIn(repo, "checkout", "-b", "branch-b");
    writeFileSync(join(repo, "b.txt"), "b\n");
    gitIn(repo, "add", ".");
    gitIn(repo, "commit", "-m", "on branch b");
    const bSha = gitIn(repo, "rev-parse", "HEAD");
    gitIn(repo, "checkout", "main");
    expect(() => reviewStamp("CR-001", bSha, { cwd: repo })).toThrow(/not reachable from HEAD/);
  });

  it("rejects when the working tree is dirty", async () => {
    const { reviewStamp } = await import("../src/review.js");
    const sha = gitIn(repo, "rev-parse", "HEAD");
    writeFileSync(join(repo, "file.txt"), "dirty\n");
    expect(() => reviewStamp("CR-001", sha, { cwd: repo })).toThrow(/Working tree is dirty/);
  });
});

describe("commitReviewFix", () => {
  let repo: string;

  beforeEach(() => {
    repo = makeRepo();
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it("commits with the correct message format when changes are staged", async () => {
    const { commitReviewFix } = await import("../src/review.js");
    writeFileSync(join(repo, "fix.txt"), "fixed\n");
    gitIn(repo, "add", "fix.txt");
    const sha = commitReviewFix("CR-001", "fix the parser", { cwd: repo });
    expect(sha).toMatch(/^[0-9a-f]{40}$/);
    const subject = gitIn(repo, "log", "-1", "--format=%s");
    expect(subject).toBe("fix(review): CR-001 — fix the parser");
  });

  it("rejects an invalid CR-ID", async () => {
    const { commitReviewFix } = await import("../src/review.js");
    writeFileSync(join(repo, "fix.txt"), "x\n");
    gitIn(repo, "add", "fix.txt");
    expect(() => commitReviewFix("CR-1", "title", { cwd: repo })).toThrow(/Invalid CR-ID/);
    expect(() => commitReviewFix("CR-0001", "title", { cwd: repo })).toThrow(/Invalid CR-ID/);
  });

  it("rejects an empty title", async () => {
    const { commitReviewFix } = await import("../src/review.js");
    writeFileSync(join(repo, "fix.txt"), "x\n");
    gitIn(repo, "add", "fix.txt");
    expect(() => commitReviewFix("CR-001", "", { cwd: repo })).toThrow(/Title is required/);
    expect(() => commitReviewFix("CR-001", "   ", { cwd: repo })).toThrow(/Title is required/);
  });

  it("refuses to commit when nothing is staged", async () => {
    const { commitReviewFix } = await import("../src/review.js");
    expect(() => commitReviewFix("CR-001", "fix something", { cwd: repo })).toThrow(
      /Nothing staged/,
    );
  });

  it("works from inside a worktree", async () => {
    const { commitReviewFix } = await import("../src/review.js");
    // Create a worktree manually (to avoid importing worktree.ts)
    const wtPath = join(repo, ".moe", "worktrees", "review-wt");
    gitIn(repo, "worktree", "add", wtPath, "-b", "review-wt");
    writeFileSync(join(wtPath, "wt-fix.txt"), "wt-fixed\n");
    gitIn(wtPath, "add", "wt-fix.txt");
    const sha = commitReviewFix("CR-099", "worktree fix", { cwd: wtPath });
    expect(sha).toMatch(/^[0-9a-f]{40}$/);
    const subject = gitIn(wtPath, "log", "-1", "--format=%s");
    expect(subject).toContain("CR-099");
    // Clean up worktree
    gitIn(repo, "worktree", "remove", "--force", wtPath);
  });
});
