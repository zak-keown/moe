import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CommandContext } from "../src/commands/context.js";
import { cmdLaunch, deriveWorkerHome, renderPanel } from "../src/commands/launch.js";
import { grantConsent } from "../src/core/consent.js";
import { appendEvent } from "../src/core/event-log.js";
import { eventsPath, shimPath } from "../src/core/paths.js";
import { shellQuote } from "../src/core/shell.js";
import type { Tmux } from "../src/core/tmux.js";
import { readHarnessMarker, readMeta } from "../src/core/worker-store.js";
import { worktreePath } from "../src/core/worktree.js";
import { getDriver } from "../src/harness/registry.js";
import { runHook } from "../src/hooks/emit-event.js";

/** A real git repo with one commit, so `git worktree add --detach <path> HEAD` works. */
function makeGitRepo(): string {
  const repoRoot = mkdtempSync(join(tmpdir(), "moe-crew-launch-repo-"));
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

function tmpDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

interface NewSessionCall {
  name: string;
  cwd: string;
  env: Record<string, string>;
  argv: string[];
}

interface FakeTmuxState {
  hasSession: boolean;
  newSession: NewSessionCall[];
  respawnPane: NewSessionCall[];
}

/**
 * A fake tmux. `onNewSession` lets a test simulate the worker emitting its
 * session_start event the moment the session is created.
 */
function fakeTmux(state: FakeTmuxState, onNewSession?: () => void): Tmux {
  return {
    async hasSession() {
      return state.hasSession;
    },
    async killSession() {},
    async capturePane() {
      return "";
    },
    async capturePaneFull() {
      return "";
    },
    async sendText() {},
    async sendEnter() {},
    async sendKey() {},
    async newSession(name, cwd, env, argv) {
      state.newSession.push({ name, cwd, env, argv });
      onNewSession?.();
    },
    async respawnPane(name, cwd, env, argv) {
      state.respawnPane.push({ name, cwd, env, argv });
      onNewSession?.();
    },
  };
}

function makeCtx(workerDir: string, home: string, tmux: Tmux): CommandContext {
  return { workerDir, home, tmux, driver: getDriver("claude") };
}

function freshState(): FakeTmuxState {
  return { hasSession: false, newSession: [], respawnPane: [] };
}

const FAST = { trustTimeoutMs: 50, startTimeoutMs: 2000, pollMs: 10 };

describe("shellQuote", () => {
  it("leaves simple tokens unquoted", () => {
    expect(shellQuote("worker1")).toBe("worker1");
    expect(shellQuote("/tmp/path-to_thing.js")).toBe("/tmp/path-to_thing.js");
  });

  it("single-quotes tokens with whitespace or special chars", () => {
    expect(shellQuote("a b")).toBe("'a b'");
    expect(shellQuote("a;b")).toBe("'a;b'");
  });

  it("escapes embedded single quotes", () => {
    expect(shellQuote("it's")).toBe("'it'\\''s'");
  });

  it("quotes the empty string", () => {
    expect(shellQuote("")).toBe("''");
  });
});

describe("cmdLaunch", () => {
  let workerDir: string;
  let home: string;
  let cwd: string;
  let rawCwd: string;

  beforeEach(() => {
    workerDir = tmpDir("moe-crew-launch-wd-");
    home = tmpDir("moe-crew-launch-home-");
    rawCwd = tmpDir("moe-crew-launch-cwd-");
    // The launch command resolves cwd to its realpath; compare against that.
    cwd = realpathSync(rawCwd);
  });

  afterEach(() => {
    rmSync(workerDir, { recursive: true });
    rmSync(home, { recursive: true });
    rmSync(rawCwd, { recursive: true });
  });

  const baseOpts = () => ({
    pluginDir: "/plugins/moe-crew",
    moeCrewEntry: "/dist/moe-crew.cjs",
    moeCrewPath: "/usr/local/bin/moe-crew",
  });

  it("errors when cwd does not exist", async () => {
    grantConsent(home);
    const ctx = makeCtx(workerDir, home, fakeTmux(freshState()));
    const result = await cmdLaunch(
      ctx,
      { tmuxName: "w1", cwd: "/no/such/dir", extraArgs: [], harness: "claude" },
      { ...baseOpts(), ...FAST },
    );
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("cwd '/no/such/dir' does not exist");
  });

  it("errors when consent has not been granted", async () => {
    const ctx = makeCtx(workerDir, home, fakeTmux(freshState()));
    const result = await cmdLaunch(
      ctx,
      { tmuxName: "w1", cwd, extraArgs: [], harness: "claude" },
      { ...baseOpts(), ...FAST },
    );
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("requires one-time consent");
    expect(result.stderr).toContain("/usr/local/bin/moe-crew grant-consent");
  });

  it("refuses to use a worker dir root that is a symlink rather than a real directory (CR-019)", async () => {
    grantConsent(home);
    const parent = tmpDir("moe-crew-launch-parent-");
    const elsewhere = tmpDir("moe-crew-launch-elsewhere-");
    const plantedWorkerDir = join(parent, "workers");
    symlinkSync(elsewhere, plantedWorkerDir);
    const ctx = makeCtx(plantedWorkerDir, home, fakeTmux(freshState()));

    await expect(
      cmdLaunch(
        ctx,
        { tmuxName: "w1", cwd, extraArgs: [], harness: "claude" },
        { ...baseOpts(), ...FAST },
      ),
    ).rejects.toThrow(/not a real directory/);

    rmSync(parent, { recursive: true });
    rmSync(elsewhere, { recursive: true });
  });

  it("errors when a tmux session with that name already exists", async () => {
    grantConsent(home);
    const state = freshState();
    state.hasSession = true;
    const ctx = makeCtx(workerDir, home, fakeTmux(state));
    const result = await cmdLaunch(
      ctx,
      { tmuxName: "w1", cwd, extraArgs: [], harness: "claude" },
      { ...baseOpts(), ...FAST },
    );
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("tmux session 'w1' already exists");
    expect(state.newSession).toHaveLength(0);
  });

  it("launches: starts the session, awaits proof-of-life, writes meta+shim, prints panel", async () => {
    grantConsent(home);
    const state = freshState();
    let capturedSid: string | undefined;
    // The fake worker emits session_start as soon as the session is created.
    // The launch command writes the events file path from the sid it generated,
    // so we read it back from the meta after the fact; instead, emit on the
    // single events file the command is polling by deriving it lazily.
    const ctx = makeCtx(
      workerDir,
      home,
      fakeTmux(state, () => {
        // The argv carries --session-id <sid>; recover it to write the event.
        const argv = state.newSession.at(-1)?.argv ?? [];
        const i = argv.indexOf("--session-id");
        capturedSid = argv[i + 1] as string;
        appendEvent(eventsPath(workerDir, capturedSid), {
          event: "session_start",
          ts: "2025-01-01T00:00:00Z",
        });
      }),
    );
    const result = await cmdLaunch(
      ctx,
      {
        tmuxName: "w1",
        cwd,
        extraArgs: ["--model", "opus"],
        harness: "claude",
      },
      { ...baseOpts(), ...FAST },
    );

    expect(result.code).toBe(0);
    expect(capturedSid).toBeDefined();
    const sid = capturedSid as string;

    // stdout = the shim path.
    expect(result.stdout).toBe(shimPath(workerDir, "w1"));

    // Panel on stderr with the expected fields.
    expect(result.stderr).toContain("Worker launched.");
    expect(result.stderr).toContain("tmux:       w1");
    expect(result.stderr).toContain(`session_id: ${sid}`);
    expect(result.stderr).toContain(`cwd:        ${cwd}`);
    expect(result.stderr).toContain(eventsPath(workerDir, sid));
    expect(result.stderr).toContain("reproduce: /usr/local/bin/moe-crew launch");

    // newSession was called with the scrubbed env and the claude argv.
    expect(state.newSession).toHaveLength(1);
    const call = state.newSession[0]!;
    expect(call.name).toBe("w1");
    expect(call.cwd).toBe(cwd);
    expect(call.env.CLAUDE_CODE_SSE_PORT).toBe("");
    expect(call.argv).toContain("--session-id");
    expect(call.argv).toContain(sid);
    expect(call.argv).toContain("--plugin-dir");
    expect(call.argv).toContain("/plugins/moe-crew");
    // Extra args are appended after the driver argv.
    expect(call.argv.slice(-2)).toEqual(["--model", "opus"]);

    // Meta written with all fields including harness.
    const meta = readMeta(workerDir, sid);
    expect(meta).toMatchObject({
      tmux_name: "w1",
      session_id: sid,
      cwd,
      harness: "claude",
    });
    expect(typeof meta?.started_at).toBe("string");
    expect(meta?.invocation).toEqual(["w1", cwd, "--", "--model", "opus"]);

    // Shim file exists and is executable.
    const mode = statSync(shimPath(workerDir, "w1")).mode;
    expect(mode & 0o100).toBeTruthy();
  });

  it("writes the meta BEFORE the worker starts, so the real hook records session_start", async () => {
    // This drives the REAL emit-event hook instead of appending the event
    // directly. The hook only records session_start once a `<sid>.meta` exists,
    // so launch can only succeed if it wrote the meta BEFORE the worker ran.
    // (Revert the meta-before-launch ordering in cmdLaunch and this times out.)
    grantConsent(home);
    const state = freshState();
    const ctx = makeCtx(
      workerDir,
      home,
      fakeTmux(state, () => {
        // The real claude worker receives its session id via `--session-id`;
        // mirror that by parsing it from the argv and feeding the real hook.
        const argv = state.newSession.at(-1)?.argv ?? [];
        const sid = argv[argv.indexOf("--session-id") + 1] as string;
        runHook({
          stdin: JSON.stringify({
            session_id: sid,
            hook_event_name: "SessionStart",
            cwd,
          }),
          workerDir,
          now: () => "2025-01-01T00:00:00Z",
        });
      }),
    );
    const result = await cmdLaunch(
      ctx,
      { tmuxName: "w1", cwd, extraArgs: [], harness: "claude" },
      { ...baseOpts(), ...FAST },
    );

    expect(result.code).toBe(0);
    expect(result.stdout).toBe(shimPath(workerDir, "w1"));
  });

  it("fails and tears down when proof-of-life never arrives", async () => {
    grantConsent(home);
    const state = freshState();
    // newSession succeeds but no session_start is ever emitted.
    const ctx = makeCtx(workerDir, home, fakeTmux(state));
    const result = await cmdLaunch(
      ctx,
      { tmuxName: "w1", cwd, extraArgs: [], harness: "claude" },
      { ...baseOpts(), trustTimeoutMs: 20, startTimeoutMs: 40, pollMs: 10 },
    );
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Error: Worker session failed to start within 30 seconds");
    // The session was started, then torn down: no meta remains for its sid.
    expect(state.newSession).toHaveLength(1);
    const argv = state.newSession[0]!.argv;
    const sid = argv[argv.indexOf("--session-id") + 1] as string;
    expect(readMeta(workerDir, sid)).toBeNull();
  });

  it("omits the -- separator in invocation when there are no extra args", async () => {
    grantConsent(home);
    const state = freshState();
    const ctx = makeCtx(
      workerDir,
      home,
      fakeTmux(state, () => {
        const argv = state.newSession.at(-1)?.argv ?? [];
        const sid = argv[argv.indexOf("--session-id") + 1] as string;
        appendEvent(eventsPath(workerDir, sid), {
          event: "session_start",
          ts: "2025-01-01T00:00:00Z",
        });
      }),
    );
    await cmdLaunch(
      ctx,
      { tmuxName: "w1", cwd, extraArgs: [], harness: "claude" },
      { ...baseOpts(), ...FAST },
    );
    const argv = state.newSession[0]!.argv;
    const sid = argv[argv.indexOf("--session-id") + 1] as string;
    const meta = readMeta(workerDir, sid);
    expect(meta?.invocation).toEqual(["w1", cwd]);
  });
});

interface CodexFakeTmuxCalls {
  newSession: NewSessionCall[];
  sendText: { name: string; text: string }[];
  sendEnter: string[];
}

/**
 * A fake tmux for the codex (derive) launch. `paneText` drives capturePane so a
 * test can show the trust gate / composer glyph and have the launch helpers act.
 * `newSessionSucceeds` (default true) controls whether `newSession` actually
 * makes `hasSession` true afterward — false simulates tmux silently no-oping
 * (absent, unreachable, rejecting the session name).
 */
function codexFakeTmux(
  calls: CodexFakeTmuxCalls,
  paneText: () => string,
  opts: { newSessionSucceeds?: boolean } = {},
): Tmux {
  const newSessionSucceeds = opts.newSessionSucceeds ?? true;
  let sessionExists = false;
  return {
    async hasSession() {
      return sessionExists;
    },
    async killSession() {},
    async capturePane() {
      return paneText();
    },
    async capturePaneFull() {
      return paneText();
    },
    async sendText(name, text) {
      calls.sendText.push({ name, text });
    },
    async sendEnter(name) {
      calls.sendEnter.push(name);
    },
    async sendKey() {},
    async newSession(name, cwd, env, argv) {
      calls.newSession.push({ name, cwd, env, argv });
      if (newSessionSucceeds) sessionExists = true;
    },
    async respawnPane() {},
  };
}

const CODEX_FAST = {
  codexTrustTimeoutMs: 200,
  codexReadyTimeoutMs: 200,
  codexTrustSettleMs: 0,
  pollMs: 10,
};

describe("cmdLaunch — codex (derive)", () => {
  let workerDir: string;
  let home: string;
  let rawCwd: string;
  let cwd: string;

  beforeEach(() => {
    workerDir = tmpDir("moe-crew-launch-cx-wd-");
    home = tmpDir("moe-crew-launch-cx-home-");
    rawCwd = tmpDir("moe-crew-launch-cx-cwd-");
    cwd = realpathSync(rawCwd);
  });

  afterEach(() => {
    rmSync(workerDir, { recursive: true });
    rmSync(home, { recursive: true });
    rmSync(rawCwd, { recursive: true });
  });

  const baseOpts = () => ({
    pluginDir: "/plugins/moe-crew",
    moeCrewEntry: "/dist/moe-crew.cjs",
    moeCrewPath: "/usr/local/bin/moe-crew",
  });

  function codexCtx(tmux: Tmux): CommandContext {
    return { workerDir, home, tmux, driver: getDriver("codex") };
  }

  it("launches without an id/meta: writes the .harness marker, dismisses the trust gate, prints the derive panel", async () => {
    grantConsent(home);
    const calls: CodexFakeTmuxCalls = {
      newSession: [],
      sendText: [],
      sendEnter: [],
    };
    // The pane shows the trust gate and the composer glyph, so both launch
    // helpers act (dismiss + ready) on the first capture.
    const ctx = codexCtx(codexFakeTmux(calls, () => "Hooks need review ›"));

    const result = await cmdLaunch(
      ctx,
      { tmuxName: "cx1", cwd, extraArgs: [], harness: "codex" },
      { ...baseOpts(), ...CODEX_FAST },
    );

    expect(result.code).toBe(0);
    // stdout is the shim path.
    expect(result.stdout).toBe(shimPath(workerDir, "cx1"));

    // No meta was pre-written (codex self-registers it on the first prompt);
    // no `<sid>.meta` exists for any id.
    expect(readdirSync(workerDir).filter((f) => f.endsWith(".meta"))).toHaveLength(0);

    // The sidecar harness marker was written, keyed by tmux name.
    expect(readHarnessMarker(workerDir, "cx1")).toBe("codex");

    // The trust gate was dismissed: '2' then Enter.
    expect(calls.sendText).toEqual([{ name: "cx1", text: "2" }]);
    expect(calls.sendEnter).toEqual(["cx1"]);

    // tmux started with the codex argv and the per-worker CODEX_HOME env.
    expect(calls.newSession).toHaveLength(1);
    const call = calls.newSession[0]!;
    expect(call.name).toBe("cx1");
    expect(call.cwd).toBe(cwd);
    expect(call.env.CODEX_HOME).toBe(deriveWorkerHome(workerDir, "cx1"));
    expect(call.argv).toContain("--dangerously-bypass-approvals-and-sandbox");
    expect(call.argv).toContain("--dangerously-bypass-hook-trust");
    expect(call.argv.slice(-2)).toEqual(["-C", cwd]);

    // The panel notes the id/events are assigned on the first prompt.
    expect(result.stderr).toContain("Worker launched.");
    expect(result.stderr).toContain("tmux:       cx1");
    expect(result.stderr).toContain("session_id: (derive — minted by the harness on registration)");
    expect(result.stderr).toContain("events:     (available after the worker registers)");

    // prepare wrote the per-worker CODEX_HOME config.
    expect(existsSync(join(deriveWorkerHome(workerDir, "cx1"), "config.toml"))).toBe(true);
  });

  it("settles (still succeeds) when the trust gate / composer never appear", async () => {
    grantConsent(home);
    const calls: CodexFakeTmuxCalls = {
      newSession: [],
      sendText: [],
      sendEnter: [],
    };
    // Pane never shows the gate or glyph: both helpers time out best-effort.
    const ctx = codexCtx(codexFakeTmux(calls, () => "just booting"));

    const result = await cmdLaunch(
      ctx,
      { tmuxName: "cx2", cwd, extraArgs: [], harness: "codex" },
      { ...baseOpts(), ...CODEX_FAST },
    );

    expect(result.code).toBe(0);
    expect(result.stdout).toBe(shimPath(workerDir, "cx2"));
    // No keystrokes sent (the gate never matched).
    expect(calls.sendText).toEqual([]);
    expect(calls.sendEnter).toEqual([]);
  });

  it("fails instead of reporting success when tmux never actually started the session (CR-016)", async () => {
    grantConsent(home);
    const calls: CodexFakeTmuxCalls = { newSession: [], sendText: [], sendEnter: [] };
    // newSession is called (moe-crew asked tmux to start a session) but tmux
    // silently no-ops — the same observable shape as tmux being absent,
    // unreachable, or rejecting the session name: hasSession never becomes
    // true. neither the trust-gate dismissal nor awaitComposerReady can fail
    // (both documented best-effort), so this is the only failure signal.
    const ctx = codexCtx(codexFakeTmux(calls, () => "just booting", { newSessionSucceeds: false }));

    const result = await cmdLaunch(
      ctx,
      { tmuxName: "cx3", cwd, extraArgs: [], harness: "codex" },
      { ...baseOpts(), ...CODEX_FAST },
    );

    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/tmux session 'cx3' was not started/);
    // No shim for a worker that doesn't exist — the exact bug: the caller
    // used to get a shim path and only discover the worker was never
    // launched on the first `send`.
    expect(existsSync(shimPath(workerDir, "cx3"))).toBe(false);
    // The sidecar harness marker written before the newSession attempt is
    // cleaned up too, so prune doesn't have to discover the orphan later.
    expect(readHarnessMarker(workerDir, "cx3")).toBeNull();
  });

  it("removes the disposable git worktree, not just its marker, when tmux never starts (CR-027)", async () => {
    grantConsent(home);
    const realRepo = makeGitRepo();
    try {
      const calls: CodexFakeTmuxCalls = { newSession: [], sendText: [], sendEnter: [] };
      const ctx = codexCtx(
        codexFakeTmux(calls, () => "just booting", { newSessionSucceeds: false }),
      );

      const result = await cmdLaunch(
        ctx,
        { tmuxName: "cx4", cwd: realRepo, extraArgs: [], harness: "codex", worktree: true },
        { ...baseOpts(), ...CODEX_FAST },
      );

      expect(result.code).toBe(1);
      const wtPath = worktreePath(realRepo, "cx4");
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

describe("renderPanel reproduce line (RE-2)", () => {
  const base = {
    header: "Worker launched.",
    verb: "launch" as const,
    tmuxName: "w",
    sessionId: "s",
    cwd: "/c",
    eventsFile: "/e",
    invocation: ["w", "/c"],
  };

  it("node-prefixes a JS bundle path so the line is runnable", () => {
    const panel = renderPanel({ ...base, moeCrewPath: "/x/dist/moe-crew.cjs" });
    expect(panel).toContain("reproduce: node /x/dist/moe-crew.cjs launch w /c");
  });

  it("uses a non-JS MOE_CREW_PATH wrapper as-is", () => {
    const panel = renderPanel({ ...base, moeCrewPath: "/usr/local/bin/moe-crew" });
    expect(panel).toContain("reproduce: /usr/local/bin/moe-crew launch w /c");
    expect(panel).not.toContain("node /usr/local/bin/moe-crew");
  });
});
