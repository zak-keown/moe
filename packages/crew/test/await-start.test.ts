import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { awaitSessionStart } from "../src/commands/await-start.js";
import type { CommandContext } from "../src/commands/context.js";
import { appendEvent } from "../src/core/event-log.js";
import { eventsPath, metaPath, shimPath } from "../src/core/paths.js";
import type { Tmux } from "../src/core/tmux.js";
import {
  readWorktreeMarker,
  writeMeta,
  writeShim,
  writeWorktreeMarker,
} from "../src/core/worker-store.js";
import { createWorktree } from "../src/core/worktree.js";
import { getDriver } from "../src/harness/registry.js";

function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), "moe-crew-await-"));
}

const SID = "sid-await";
const TMUX_NAME = "await-worker";

interface FakeTmuxCalls {
  capturePane: string[];
  sendEnter: string[];
  killSession: string[];
}

function fakeTmux(calls: FakeTmuxCalls, paneText: () => string, onSendEnter?: () => void): Tmux {
  return {
    async hasSession() {
      return true;
    },
    async killSession(name: string) {
      calls.killSession.push(name);
    },
    async capturePane(name: string) {
      calls.capturePane.push(name);
      return paneText();
    },
    async capturePaneFull() {
      return paneText();
    },
    async sendText() {},
    async sendEnter(name: string) {
      calls.sendEnter.push(name);
      onSendEnter?.();
    },
    async sendKey() {},
    async newSession() {},
    async respawnPane() {},
  };
}

function makeCtx(workerDir: string, tmux: Tmux): CommandContext {
  return {
    workerDir,
    home: workerDir,
    tmux,
    driver: getDriver("claude"),
  };
}

function seedWorker(workerDir: string): void {
  writeMeta(workerDir, {
    tmux_name: TMUX_NAME,
    session_id: SID,
    cwd: "/home/user/project",
    harness: "claude",
  });
  writeShim(workerDir, TMUX_NAME, "/path/to/moe-crew.js");
}

/** A real git repo with one commit, so `git worktree add --detach <path> HEAD` works. */
function makeGitRepo(): string {
  const repoRoot = mkdtempSync(join(tmpdir(), "moe-crew-await-repo-"));
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
  return repoRoot;
}

describe("awaitSessionStart", () => {
  let workerDir: string;

  beforeEach(() => {
    workerDir = tmpDir();
    seedWorker(workerDir);
  });

  afterEach(() => {
    rmSync(workerDir, { recursive: true });
  });

  it("returns started when a session_start event appears", async () => {
    const ef = eventsPath(workerDir, SID);
    const calls: FakeTmuxCalls = {
      capturePane: [],
      sendEnter: [],
      killSession: [],
    };
    const tmux = fakeTmux(calls, () => "");
    const ctx = makeCtx(workerDir, tmux);
    // Worker emits session_start shortly after launch.
    setTimeout(() => {
      appendEvent(ef, { event: "session_start", ts: "2025-01-01T00:00:00Z" });
    }, 30);
    const result = await awaitSessionStart(ctx, TMUX_NAME, SID, {
      trustTimeoutMs: 100,
      startTimeoutMs: 2000,
      pollMs: 10,
    });
    expect(result.started).toBe(true);
    // The discriminated union guarantees no failureMessage on success.
    expect("failureMessage" in result).toBe(false);
    // No teardown on success.
    expect(calls.killSession).toHaveLength(0);
    expect(existsSync(metaPath(workerDir, SID))).toBe(true);
  });

  it("accepts the trust dialog by sending Enter when the pane prompts", async () => {
    const ef = eventsPath(workerDir, SID);
    const calls: FakeTmuxCalls = {
      capturePane: [],
      sendEnter: [],
      killSession: [],
    };
    // Pane shows the trust prompt; once Enter is sent, the worker starts.
    const tmux = fakeTmux(
      calls,
      () => "Do you trust this folder?",
      () => {
        appendEvent(ef, { event: "session_start", ts: "2025-01-01T00:00:00Z" });
      },
    );
    const ctx = makeCtx(workerDir, tmux);
    const result = await awaitSessionStart(ctx, TMUX_NAME, SID, {
      trustTimeoutMs: 1000,
      startTimeoutMs: 2000,
      pollMs: 10,
    });
    expect(result.started).toBe(true);
    expect(calls.sendEnter).toContain(TMUX_NAME);
  });

  it("times out: kills the session, removes meta+events, returns a failure message", async () => {
    // No session_start event is ever written, so the wait must time out.
    const calls: FakeTmuxCalls = {
      capturePane: [],
      sendEnter: [],
      killSession: [],
    };
    const tmux = fakeTmux(calls, () => "line one\n\nlast visible line\n");
    const ctx = makeCtx(workerDir, tmux);
    const result = await awaitSessionStart(ctx, TMUX_NAME, SID, {
      trustTimeoutMs: 30,
      startTimeoutMs: 60,
      pollMs: 10,
    });
    expect(result.started).toBe(false);
    if (result.started) throw new Error("expected timeout failure");
    expect(result.failureMessage).toContain(
      "Error: Worker session failed to start within 30 seconds",
    );
    // Pane tail included in the failure message.
    expect(result.failureMessage).toContain("last visible line");
    // Teardown happened.
    expect(calls.killSession).toEqual([TMUX_NAME]);
    expect(existsSync(metaPath(workerDir, SID))).toBe(false);
    expect(existsSync(eventsPath(workerDir, SID))).toBe(false);
    expect(existsSync(shimPath(workerDir, TMUX_NAME))).toBe(false);
  });

  it("removes the git worktree on timeout teardown, not just the marker (CR-027)", async () => {
    const realRepo = makeGitRepo();
    try {
      const wtPath = await createWorktree(undefined, realRepo, TMUX_NAME);
      writeWorktreeMarker(workerDir, TMUX_NAME, wtPath);
      expect(existsSync(wtPath)).toBe(true);

      const calls: FakeTmuxCalls = { capturePane: [], sendEnter: [], killSession: [] };
      const tmux = fakeTmux(calls, () => "");
      const ctx = makeCtx(workerDir, tmux);
      const result = await awaitSessionStart(ctx, TMUX_NAME, SID, {
        trustTimeoutMs: 30,
        startTimeoutMs: 60,
        pollMs: 10,
      });

      expect(result.started).toBe(false);
      // The marker is gone (removeWorker already did this before the fix)...
      expect(readWorktreeMarker(workerDir, TMUX_NAME)).toBeNull();
      // ...but the git worktree itself must ALSO be gone: both the checkout
      // directory and git's own internal worktree registration.
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
