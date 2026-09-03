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
    expect(() => reviewStamp("CR-001", bSha, { cwd: repo })).toThrow(
      /not reachable from HEAD/,
    );
  });

  it("rejects when the working tree is dirty", async () => {
    const { reviewStamp } = await import("../src/review.js");
    const sha = gitIn(repo, "rev-parse", "HEAD");
    writeFileSync(join(repo, "file.txt"), "dirty\n");
    expect(() => reviewStamp("CR-001", sha, { cwd: repo })).toThrow(
      /Working tree is dirty/,
    );
  });
});
