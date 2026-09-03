import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worktreeMarkerPath } from "../src/core/paths.js";
import type { Runner, RunResult } from "../src/core/proc.js";
import { readWorktreeMarker, writeWorktreeMarker } from "../src/core/worker-store.js";
import { createWorktree, removeWorktree, worktreePath } from "../src/core/worktree.js";

function tmpDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

describe("worktreePath", () => {
  it("returns <repoRoot>/.moe-worktrees/<name>", () => {
    expect(worktreePath("/repo", "w1")).toBe("/repo/.moe-worktrees/w1");
  });
});

describe("createWorktree", () => {
  it("calls git worktree add --detach and returns the path on success", async () => {
    const calls: Array<{ cmd: string; args: string[] }> = [];
    const fakeRunner: Runner = async (cmd, args) => {
      calls.push({ cmd, args });
      return { stdout: "", stderr: "Preparing worktree\n", code: 0 };
    };

    const result = await createWorktree(fakeRunner, "/repo", "w1", "main");

    expect(result).toBe("/repo/.moe-worktrees/w1");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.cmd).toBe("git");
    expect(calls[0]!.args).toEqual([
      "-C",
      "/repo",
      "worktree",
      "add",
      "--detach",
      "/repo/.moe-worktrees/w1",
      "main",
    ]);
  });

  it("defaults to HEAD when no ref is provided", async () => {
    const calls: Array<{ cmd: string; args: string[] }> = [];
    const fakeRunner: Runner = async (cmd, args) => {
      calls.push({ cmd, args });
      return { stdout: "", stderr: "", code: 0 };
    };

    await createWorktree(fakeRunner, "/repo", "w2");

    expect(calls[0]!.args).toContain("HEAD");
  });

  it("throws when git worktree add fails", async () => {
    const fakeRunner: Runner = async () => {
      return { stdout: "", stderr: "fatal: not a git repository", code: 128 };
    };

    await expect(createWorktree(fakeRunner, "/not-a-repo", "w1")).rejects.toThrow(
      /git worktree add failed/,
    );
  });
});

describe("removeWorktree", () => {
  it("calls git worktree remove --force on success", async () => {
    const calls: Array<{ cmd: string; args: string[] }> = [];
    const fakeRunner: Runner = async (cmd, args) => {
      calls.push({ cmd, args });
      return { stdout: "", stderr: "", code: 0 };
    };

    await removeWorktree(fakeRunner, "/repo", "/repo/.moe-worktrees/w1");

    expect(calls).toHaveLength(1);
    expect(calls[0]!.args).toEqual([
      "-C",
      "/repo",
      "worktree",
      "remove",
      "--force",
      "/repo/.moe-worktrees/w1",
    ]);
  });

  it("swallows 'not a working tree' errors gracefully", async () => {
    const fakeRunner: Runner = async () => {
      return { stdout: "", stderr: "fatal: '/x' is not a working tree", code: 128 };
    };

    // Should NOT throw.
    await removeWorktree(fakeRunner, "/repo", "/x");
  });

  it("swallows 'does not exist' errors gracefully", async () => {
    const fakeRunner: Runner = async () => {
      return { stdout: "", stderr: "fatal: '/x' does not exist", code: 128 };
    };

    await removeWorktree(fakeRunner, "/repo", "/x");
  });

  it("calls git worktree prune as a fallback on other failures", async () => {
    const calls: Array<{ cmd: string; args: string[] }> = [];
    const fakeRunner: Runner = async (cmd, args) => {
      calls.push({ cmd, args });
      if (args.includes("remove")) {
        return { stdout: "", stderr: "fatal: unexpected error", code: 1 };
      }
      return { stdout: "", stderr: "", code: 0 };
    };

    await removeWorktree(fakeRunner, "/repo", "/repo/.moe-worktrees/w1");

    // Should have called remove, then prune as fallback.
    expect(calls).toHaveLength(2);
    expect(calls[1]!.args).toEqual(["-C", "/repo", "worktree", "prune"]);
  });
});

describe("worktree marker (sidecar)", () => {
  let dir: string;

  beforeEach(() => {
    dir = tmpDir("moe-crew-wt-marker-");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true });
  });

  it("writes and reads the worktree path", () => {
    writeWorktreeMarker(dir, "w1", "/repo/.moe-worktrees/w1");
    expect(readWorktreeMarker(dir, "w1")).toBe("/repo/.moe-worktrees/w1");
  });

  it("returns null when the marker does not exist", () => {
    expect(readWorktreeMarker(dir, "ghost")).toBeNull();
  });

  it("is removed by the marker path function", () => {
    writeWorktreeMarker(dir, "w1", "/path");
    expect(existsSync(worktreeMarkerPath(dir, "w1"))).toBe(true);
    rmSync(worktreeMarkerPath(dir, "w1"), { force: true });
    expect(readWorktreeMarker(dir, "w1")).toBeNull();
  });
});
