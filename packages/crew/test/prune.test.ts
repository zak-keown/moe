import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CommandContext } from "../src/commands/context.js";
import { cmdPrune } from "../src/commands/prune.js";
import { harnessMarkerPath, metaPath, shimPath } from "../src/core/paths.js";
import { makeTmux } from "../src/core/tmux.js";
import {
  writeHarnessMarker,
  writeMeta,
  writeShim,
  writeWorktreeMarker,
} from "../src/core/worker-store.js";
import { createWorktree } from "../src/core/worktree.js";
import { getDriver } from "../src/harness/registry.js";

/** A real git repo with one commit, so `git worktree add --detach <path> HEAD` works. */
function makeGitRepo(): string {
  const repoRoot = mkdtempSync(join(tmpdir(), "moe-crew-prune-repo-"));
  const git = (args: string[]) => execFileSync("git", ["-C", repoRoot, ...args]);
  git(["init", "-q"]);
  git([
    "-c",
    "user.email=t@t.test",
    "-c",
    "user.name=t",
    "commit",
    "--allow-empty",
    "-q",
    "-m",
    "init",
  ]);
  return realpathSync(repoRoot);
}

/** A session is alive iff its name is in `alive` (decided by the has-session -t arg). */
function makeCtx(dir: string, alive: Set<string>): CommandContext {
  const tmux = makeTmux(async (_cmd, args) => {
    if (args[0] === "has-session") {
      const name = args[args.indexOf("-t") + 1] ?? "";
      return { stdout: "", stderr: "", code: alive.has(name) ? 0 : 1 };
    }
    return { stdout: "", stderr: "", code: 0 };
  });
  return { workerDir: dir, home: dir, tmux, driver: getDriver("claude") };
}

describe("cmdPrune", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "moe-crew-prune-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true });
  });

  const mk = (name: string, sid: string) =>
    writeMeta(dir, {
      tmux_name: name,
      session_id: sid,
      cwd: "/w",
      harness: "claude",
    });

  it("removes gone workers, keeps live ones, and reports the count", async () => {
    mk("alive1", "sid-a");
    mk("dead1", "sid-d1");
    mk("dead2", "sid-d2");

    const result = await cmdPrune(makeCtx(dir, new Set(["alive1"])));

    expect(result.code).toBe(0);
    // live worker untouched; gone workers' state removed
    expect(existsSync(metaPath(dir, "sid-a"))).toBe(true);
    expect(existsSync(metaPath(dir, "sid-d1"))).toBe(false);
    expect(existsSync(metaPath(dir, "sid-d2"))).toBe(false);
    expect(result.stdout).toContain("2");
    expect(result.stdout).toContain("dead1");
    expect(result.stdout).toContain("dead2");
    expect(result.stdout).not.toContain("alive1");
  });

  it("reports nothing to prune when every worker is live", async () => {
    mk("alive1", "sid-a");
    const result = await cmdPrune(makeCtx(dir, new Set(["alive1"])));
    expect(result.code).toBe(0);
    expect(result.stderr).toBe("Nothing to prune");
    expect(result.stdout).toBeUndefined();
  });

  it("sweeps meta-less orphan sidecars/shims whose tmux is gone, keeps live ones (N-3)", async () => {
    // Orphan: a .harness sidecar + shim with no meta, tmux session dead.
    writeHarnessMarker(dir, "orphan", "codex");
    writeShim(dir, "orphan", "/dist/moe-crew.cjs");
    // A live derive worker mid-registration: same shape, but tmux still alive.
    writeHarnessMarker(dir, "pending", "codex");
    writeShim(dir, "pending", "/dist/moe-crew.cjs");

    const result = await cmdPrune(makeCtx(dir, new Set(["pending"])));

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("orphan");
    // orphan removed, pending (live) untouched.
    expect(existsSync(harnessMarkerPath(dir, "orphan"))).toBe(false);
    expect(existsSync(shimPath(dir, "orphan"))).toBe(false);
    expect(existsSync(harnessMarkerPath(dir, "pending"))).toBe(true);
    expect(existsSync(shimPath(dir, "pending"))).toBe(true);
  });

  it("removes the git worktree of a pruned gone worker, not just its marker (CR-027)", async () => {
    const realRepo = makeGitRepo();
    try {
      const wtPath = await createWorktree(undefined, realRepo, "dead1");
      mk("dead1", "sid-d1");
      writeWorktreeMarker(dir, "dead1", wtPath);
      expect(existsSync(wtPath)).toBe(true);

      const result = await cmdPrune(makeCtx(dir, new Set()));

      expect(result.code).toBe(0);
      expect(existsSync(metaPath(dir, "sid-d1"))).toBe(false);
      expect(existsSync(wtPath)).toBe(false);
      const list = execFileSync("git", ["-C", realRepo, "worktree", "list"], {
        encoding: "utf8",
      });
      expect(list).not.toContain(wtPath);
    } finally {
      rmSync(realRepo, { recursive: true, force: true });
    }
  });

  it("removes the git worktree of a pruned orphan sidecar, not just its marker (CR-027)", async () => {
    const realRepo = makeGitRepo();
    try {
      const wtPath = await createWorktree(undefined, realRepo, "orphan-wt");
      writeHarnessMarker(dir, "orphan-wt", "codex");
      writeShim(dir, "orphan-wt", "/dist/moe-crew.cjs");
      writeWorktreeMarker(dir, "orphan-wt", wtPath);
      expect(existsSync(wtPath)).toBe(true);

      const result = await cmdPrune(makeCtx(dir, new Set()));

      expect(result.code).toBe(0);
      expect(existsSync(harnessMarkerPath(dir, "orphan-wt"))).toBe(false);
      expect(existsSync(wtPath)).toBe(false);
      const list = execFileSync("git", ["-C", realRepo, "worktree", "list"], {
        encoding: "utf8",
      });
      expect(list).not.toContain(wtPath);
    } finally {
      rmSync(realRepo, { recursive: true, force: true });
    }
  });
});
