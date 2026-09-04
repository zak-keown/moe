import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const CORE = fileURLToPath(new URL("..", import.meta.url));
const SCRIPT = join(CORE, "skills/using-tmux-for-interactive-commands/scripts/tmux-wrapper.mjs");

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function tmpDir() {
  const dir = mkdtempSync(join(tmpdir(), "tmux-test-"));
  roots.push(dir);
  return dir;
}

function fakeTmux(dir: string, behavior = "echo ok") {
  const bin = join(dir, "bin");
  mkdirSync(bin, { recursive: true });
  const script = join(bin, "tmux");
  writeFileSync(script, `#!/bin/sh\n${behavior}\n`);
  chmodSync(script, 0o755);
  return bin;
}

function runWrapper(args: string[], env: Record<string, string> = {}) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

describe("tmux-wrapper", () => {
  it("exits 1 with usage when no action given", () => {
    const r = runWrapper([]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("Usage:");
  });

  it("exits 1 with usage on unknown action", () => {
    const r = runWrapper(["unknown", "sess"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("Usage:");
  });

  it("start defaults to bash when no command given", () => {
    const dir = tmpDir();
    const bin = fakeTmux(dir, 'echo "ARGS: $@"');
    const r = runWrapper(["start", "my-session"], {
      PATH: `${bin}:${process.env.PATH}`,
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("Session: my-session");
  });

  it("start passes command and arguments through as array elements", () => {
    const dir = tmpDir();
    const logFile = join(dir, "args.log");
    const bin = fakeTmux(dir, `printf '%s\\n' "$@" > "${logFile}"`);
    const r = runWrapper(["start", "test-sess", "python3", "-i"], {
      PATH: `${bin}:${process.env.PATH}`,
    });
    expect(r.status).toBe(0);
  });

  it("send requires input arguments", () => {
    const dir = tmpDir();
    const bin = fakeTmux(dir);
    const r = runWrapper(["send", "sess"], {
      PATH: `${bin}:${process.env.PATH}`,
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("No input provided");
  });

  it("send passes keys as arguments to tmux send-keys", () => {
    const dir = tmpDir();
    const logFile = join(dir, "send.log");
    const bin = fakeTmux(dir, `printf '%s\\n' "$@" > "${logFile}"\necho "Session: $3"\necho "---"`);
    const r = runWrapper(["send", "sess", "hello", "Enter"], {
      PATH: `${bin}:${process.env.PATH}`,
    });
    expect(r.status).toBe(0);
  });

  it("capture returns session output", () => {
    const dir = tmpDir();
    const bin = fakeTmux(dir, 'echo "captured pane content"');
    const r = runWrapper(["capture", "my-session"], {
      PATH: `${bin}:${process.env.PATH}`,
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("Session: my-session");
  });

  it("stop kills the session", () => {
    const dir = tmpDir();
    const bin = fakeTmux(dir);
    const r = runWrapper(["stop", "my-session"], {
      PATH: `${bin}:${process.env.PATH}`,
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("terminated");
  });

  it("list invokes tmux list-sessions", () => {
    const dir = tmpDir();
    const bin = fakeTmux(dir, 'echo "session1: 1 windows"');
    const r = runWrapper(["list"], {
      PATH: `${bin}:${process.env.PATH}`,
    });
    expect(r.status).toBe(0);
  });

  it("propagates tmux exit code on failure", () => {
    const dir = tmpDir();
    const bin = fakeTmux(dir, "exit 42");
    const r = runWrapper(["stop", "bad-session"], {
      PATH: `${bin}:${process.env.PATH}`,
    });
    expect(r.status).not.toBe(0);
  });
});
