import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CommandContext } from "../src/commands/context.js";
import { cmdPack, cmdPackStop, resolvePackHarnesses } from "../src/commands/pack.js";
import { loadPack, parsePackYaml } from "../src/core/packs.js";
import { harnessMarkerPath, shimPath } from "../src/core/paths.js";
import { makeTmux } from "../src/core/tmux.js";
import { writeHarnessMarker, writeShim } from "../src/core/worker-store.js";
import { getDriver } from "../src/harness/registry.js";

function tmpDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

/** A minimal fake tmux that always reports sessions as absent. */
function noopTmux() {
  return makeTmux(async () => ({ stdout: "", stderr: "", code: 1 }));
}

describe("parsePackYaml", () => {
  it("parses a simple pack with block-scalar rolePrompt", () => {
    const yaml = `
name: test-pack
description: A test pack
workers:
  - namePrefix: alpha
    rolePrompt: |
      You are worker alpha.
      Do the thing.
  - namePrefix: beta
    harness: codex
    rolePrompt: Single line prompt
`;
    const result = parsePackYaml(yaml) as Record<string, unknown>;
    expect(result.name).toBe("test-pack");
    expect(result.description).toBe("A test pack");

    const workers = result.workers as Record<string, unknown>[];
    expect(workers).toHaveLength(2);

    expect(workers[0]!.namePrefix).toBe("alpha");
    expect(workers[0]!.rolePrompt).toBe("You are worker alpha.\nDo the thing.\n");

    expect(workers[1]!.namePrefix).toBe("beta");
    expect(workers[1]!.harness).toBe("codex");
    expect(workers[1]!.rolePrompt).toBe("Single line prompt");
  });

  it("handles harnessArgs as a sub-sequence", () => {
    const yaml = `
name: args-pack
workers:
  - namePrefix: worker
    harnessArgs:
      - --model
      - gpt-4
    rolePrompt: do stuff
`;
    const result = parsePackYaml(yaml) as Record<string, unknown>;
    const workers = result.workers as Record<string, unknown>[];
    expect(workers[0]!.harnessArgs).toEqual(["--model", "gpt-4"]);
  });

  it("handles comments and blank lines", () => {
    const yaml = `
# This is a comment
name: commented-pack

# More comments
workers:
  # Worker comment
  - namePrefix: w1
    rolePrompt: hello
`;
    const result = parsePackYaml(yaml) as Record<string, unknown>;
    expect(result.name).toBe("commented-pack");
    const workers = result.workers as Record<string, unknown>[];
    expect(workers).toHaveLength(1);
    expect(workers[0]!.namePrefix).toBe("w1");
  });
});

describe("loadPack", () => {
  let dir: string;

  beforeEach(() => {
    dir = tmpDir("moe-crew-packs-");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("parses valid YAML and returns a PackDefinition", () => {
    const file = join(dir, "good.yaml");
    writeFileSync(
      file,
      `name: my-pack
description: Does things
defaultHarness: pi
workers:
  - namePrefix: alpha
    rolePrompt: |
      Do something important.
  - namePrefix: beta
    harness: codex
    rolePrompt: Be a beta worker.
`,
    );

    const pack = loadPack(file);
    expect(pack.name).toBe("my-pack");
    expect(pack.description).toBe("Does things");
    expect(pack.defaultHarness).toBe("pi");
    expect(pack.workers).toHaveLength(2);
    expect(pack.workers[0]!.namePrefix).toBe("alpha");
    expect(pack.workers[0]!.rolePrompt).toBe("Do something important.\n");
    expect(pack.workers[0]!.harness).toBeUndefined();
    expect(pack.workers[1]!.namePrefix).toBe("beta");
    expect(pack.workers[1]!.harness).toBe("codex");
    expect(pack.workers[1]!.rolePrompt).toBe("Be a beta worker.");
  });

  it("throws on missing name", () => {
    const file = join(dir, "no-name.yaml");
    writeFileSync(
      file,
      `workers:
  - namePrefix: w
    rolePrompt: hello
`,
    );

    expect(() => loadPack(file)).toThrow("'name' is required");
  });

  it("throws on empty workers array", () => {
    const file = join(dir, "no-workers.yaml");
    writeFileSync(
      file,
      `name: empty
workers:
`,
    );

    expect(() => loadPack(file)).toThrow("'workers' is required and must be a non-empty array");
  });

  it("throws on missing workers key", () => {
    const file = join(dir, "no-workers-key.yaml");
    writeFileSync(file, "name: orphan\n");

    expect(() => loadPack(file)).toThrow("'workers' is required and must be a non-empty array");
  });

  it("handles optional fields (harness, harnessArgs, description)", () => {
    const file = join(dir, "optional.yaml");
    writeFileSync(
      file,
      `name: optional-pack
workers:
  - namePrefix: w1
    harness: pi
    harnessArgs:
      - --fast
      - --no-cache
    rolePrompt: work hard
`,
    );

    const pack = loadPack(file);
    expect(pack.description).toBeUndefined();
    expect(pack.workers[0]!.harness).toBe("pi");
    expect(pack.workers[0]!.harnessArgs).toEqual(["--fast", "--no-cache"]);
  });

  it("throws on missing file", () => {
    expect(() => loadPack(join(dir, "nope.yaml"))).toThrow("Pack file not found");
  });

  it("throws on worker missing namePrefix", () => {
    const file = join(dir, "no-prefix.yaml");
    writeFileSync(
      file,
      `name: bad
workers:
  - rolePrompt: hello
`,
    );

    expect(() => loadPack(file)).toThrow("namePrefix is required");
  });

  it("throws on worker missing rolePrompt", () => {
    const file = join(dir, "no-prompt.yaml");
    writeFileSync(
      file,
      `name: bad
workers:
  - namePrefix: w
`,
    );

    expect(() => loadPack(file)).toThrow("rolePrompt is required");
  });

  it("parses a JSON pack file", () => {
    const file = join(dir, "pack.json");
    writeFileSync(
      file,
      JSON.stringify({
        name: "json-pack",
        workers: [{ namePrefix: "j", rolePrompt: "do json things" }],
      }),
    );

    const pack = loadPack(file);
    expect(pack.name).toBe("json-pack");
    expect(pack.workers).toHaveLength(1);
  });

  it("loads the example review-pack.yaml from disk", () => {
    const packPath = join(__dirname, "..", "packs", "review-pack.yaml");
    const pack = loadPack(packPath);
    expect(pack.name).toBe("review-pack");
    expect(pack.description).toBe("Two parallel reviewers plus a verification pass");
    expect(pack.workers).toHaveLength(3);
    expect(pack.workers[0]!.namePrefix).toBe("reviewer");
    expect(pack.workers[1]!.namePrefix).toBe("reviewer");
    expect(pack.workers[2]!.namePrefix).toBe("verifier");
  });
});

describe("cmdPack and cmdPackStop via CLI dispatch", () => {
  let workerDir: string;
  let prevWorkerDir: string | undefined;

  beforeEach(() => {
    workerDir = tmpDir("moe-crew-pack-cli-");
    prevWorkerDir = process.env.MOE_CREW_WORKER_DIR;
    process.env.MOE_CREW_WORKER_DIR = workerDir;
  });

  afterEach(() => {
    if (prevWorkerDir === undefined) {
      delete process.env.MOE_CREW_WORKER_DIR;
    } else {
      process.env.MOE_CREW_WORKER_DIR = prevWorkerDir;
    }
    rmSync(workerDir, { recursive: true, force: true });
  });

  it("rejects pack with no arguments", async () => {
    const { run } = await import("../src/cli.js");
    const out: string[] = [];
    const err: string[] = [];
    const io = {
      out: (s: string) => out.push(s),
      err: (s: string) => err.push(s),
    };

    const code = await run(["pack"], io);
    expect(code).toBe(2);
    expect(err.join("")).toContain("Usage: pack");
  });

  it("rejects pack-stop with no arguments", async () => {
    const { run } = await import("../src/cli.js");
    const out: string[] = [];
    const err: string[] = [];
    const io = {
      out: (s: string) => out.push(s),
      err: (s: string) => err.push(s),
    };

    const code = await run(["pack-stop"], io);
    expect(code).toBe(2);
    expect(err.join("")).toContain("Usage: pack-stop");
  });

  it("rejects --worker with pack (top-level subcommand)", async () => {
    const { run } = await import("../src/cli.js");
    const out: string[] = [];
    const err: string[] = [];
    const io = {
      out: (s: string) => out.push(s),
      err: (s: string) => err.push(s),
    };

    const code = await run(["--worker", "w", "pack", "file.yaml"], io);
    expect(code).toBe(2);
    expect(err.join("")).toContain("--worker is not valid for 'pack'");
  });
});

describe("cmdPack logic", () => {
  let dir: string;

  beforeEach(() => {
    dir = tmpDir("moe-crew-pack-cmd-");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns error for a nonexistent pack file", async () => {
    const { cmdPack } = await import("../src/commands/pack.js");
    const ctx: CommandContext = {
      workerDir: dir,
      home: dir,
      tmux: noopTmux(),
      driver: getDriver("claude"),
    };
    const result = await cmdPack(
      ctx,
      { packFile: join(dir, "nope.yaml"), cwd: dir },
      {
        pluginDir: "/fake/plugin",
        moeCrewEntry: "/fake/moe-crew.cjs",
        moeCrewPath: "/fake/moe-crew.cjs",
      },
    );
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Pack file not found");
  });

  it("applies worker, command, pack, environment, and installed defaults in order", () => {
    const pack = {
      name: "mixed",
      defaultHarness: "claude" as const,
      workers: [
        { namePrefix: "special", harness: "pi" as const, rolePrompt: "special" },
        { namePrefix: "default", rolePrompt: "default" },
      ],
    };

    expect(
      resolvePackHarnesses(pack, {
        command: "codex",
        environment: "pi",
        installed: ["claude"],
      }),
    ).toEqual({ ok: true, harnesses: ["pi", "codex"] });
    expect(resolvePackHarnesses(pack, { environment: "pi", installed: ["codex"] })).toEqual({
      ok: true,
      harnesses: ["pi", "claude"],
    });
  });

  it("returns code 2 before touching tmux when installed-harness selection is ambiguous", async () => {
    const packFile = join(dir, "ambiguous.yaml");
    writeFileSync(
      packFile,
      `name: ambiguous
workers:
  - namePrefix: worker
    rolePrompt: hello
`,
    );
    let tmuxCalls = 0;
    const ctx: CommandContext = {
      workerDir: dir,
      home: dir,
      tmux: makeTmux(async () => {
        tmuxCalls++;
        return { stdout: "", stderr: "", code: 1 };
      }),
      driver: getDriver("claude"),
    };

    const result = await cmdPack(
      ctx,
      {
        packFile,
        cwd: dir,
        installedHarnesses: ["claude", "codex"],
        environmentHarness: undefined,
      },
      {
        pluginDir: "/fake/plugin",
        moeCrewEntry: "/fake/moe-crew.cjs",
        moeCrewPath: "/fake/moe-crew.cjs",
      },
    );

    expect(result.code).toBe(2);
    expect(result.stderr).toContain("multiple crew harnesses are installed");
    expect(tmuxCalls).toBe(0);
  });
});

describe("cmdPackStop logic", () => {
  let dir: string;

  beforeEach(() => {
    dir = tmpDir("moe-crew-pack-stop-");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("reports no workers when none match", async () => {
    const { cmdPackStop } = await import("../src/commands/pack.js");
    const ctx: CommandContext = {
      workerDir: dir,
      home: dir,
      tmux: noopTmux(),
      driver: getDriver("claude"),
    };
    const result = await cmdPackStop(ctx, { nameOrFile: "nonexistent" });
    expect(result.code).toBe(0);
    expect(result.stderr).toContain("No workers found for pack 'nonexistent'");
  });

  it("resolves pack name from a YAML file", async () => {
    const { cmdPackStop } = await import("../src/commands/pack.js");
    const packFile = join(dir, "test.yaml");
    writeFileSync(
      packFile,
      `name: test-pack
workers:
  - namePrefix: w
    rolePrompt: hello
`,
    );

    const ctx: CommandContext = {
      workerDir: dir,
      home: dir,
      tmux: noopTmux(),
      driver: getDriver("claude"),
    };
    const result = await cmdPackStop(ctx, { nameOrFile: packFile });
    expect(result.code).toBe(0);
    expect(result.stderr).toContain("No workers found for pack 'test-pack'");
  });

  it("stops a mixed pack with each persisted worker's own driver", async () => {
    const { cmdPackStop } = await import("../src/commands/pack.js");
    const { writeMeta } = await import("../src/core/worker-store.js");
    const { appendEvent } = await import("../src/core/event-log.js");
    const { eventsPath } = await import("../src/core/paths.js");

    // Register two workers that look like they belong to "my-pack".
    writeMeta(dir, {
      tmux_name: "my-pack-alpha-0",
      session_id: "sid-a",
      cwd: "/work",
      harness: "claude",
    });
    writeMeta(dir, {
      tmux_name: "my-pack-beta-1",
      session_id: "sid-b",
      cwd: "/work",
      harness: "codex",
    });
    // An unrelated worker.
    writeMeta(dir, {
      tmux_name: "other-worker",
      session_id: "sid-c",
      cwd: "/work",
      harness: "claude",
    });

    // Give them events including session_end so stop exits its poll loop immediately.
    appendEvent(eventsPath(dir, "sid-a"), { event: "session_end", ts: "2025-01-01T00:00:00Z" });
    appendEvent(eventsPath(dir, "sid-b"), { event: "session_end", ts: "2025-01-01T00:00:00Z" });
    appendEvent(eventsPath(dir, "sid-c"), { event: "stop", ts: "2025-01-01T00:00:00Z" });

    // Fake tmux: pack workers "alive" initially; stop sends quit keys then
    // polls for session_end or session disappearance.  Since we pre-wrote
    // session_end events, the stop poll exits immediately; then stop does
    // kill-session and we mark them gone so the second has-session returns false.
    const alive = new Set(["my-pack-alpha-0", "my-pack-beta-1"]);
    const quitKeys: Array<{ name: string; text: string }> = [];
    const tmux = makeTmux(async (_cmd, args) => {
      if (args[0] === "has-session") {
        const name = args[args.indexOf("-t") + 1] ?? "";
        return { stdout: "", stderr: "", code: alive.has(name) ? 0 : 1 };
      }
      if (args[0] === "kill-session") {
        const name = args[args.indexOf("-t") + 1] ?? "";
        alive.delete(name);
      }
      if (args[0] === "send-keys" && args.includes("-l")) {
        quitKeys.push({
          name: args[args.indexOf("-t") + 1] ?? "",
          text: args.at(-1) ?? "",
        });
      }
      return { stdout: "", stderr: "", code: 0 };
    });

    const ctx: CommandContext = {
      workerDir: dir,
      home: dir,
      tmux,
      driver: getDriver("claude"),
    };

    const result = await cmdPackStop(ctx, { nameOrFile: "my-pack" });
    expect(result.stdout).toContain("Pack 'my-pack' stopped: 2 workers");
    expect(result.code).toBe(0);
    expect(quitKeys).toEqual([
      { name: "my-pack-alpha-0", text: "/exit" },
      { name: "my-pack-beta-1", text: "/quit" },
    ]);
  });

  it("stops a live derive worker left as a marker-only orphan after initial send failure", async () => {
    const name = "my-pack-codex-0";
    writeHarnessMarker(dir, name, "codex");
    writeShim(dir, name, "/fake/moe-crew.cjs");
    const alive = new Set([name]);
    const quitKeys: string[] = [];
    const tmux = makeTmux(async (_cmd, args) => {
      const target = args[args.indexOf("-t") + 1] ?? "";
      if (args[0] === "has-session") {
        return { stdout: "", stderr: "", code: alive.has(target) ? 0 : 1 };
      }
      if (args[0] === "send-keys" && args.includes("-l")) {
        const text = args.at(-1) ?? "";
        quitKeys.push(text);
        if (text === "/quit") alive.delete(target);
      }
      if (args[0] === "kill-session") alive.delete(target);
      return { stdout: "", stderr: "", code: 0 };
    });
    const ctx: CommandContext = {
      workerDir: dir,
      home: dir,
      tmux,
      driver: getDriver("claude"),
    };

    const result = await cmdPackStop(ctx, { nameOrFile: "my-pack" });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("stopped: 1 worker");
    expect(quitKeys).toContain("/quit");
    expect(alive.has(name)).toBe(false);
    expect(existsSync(harnessMarkerPath(dir, name))).toBe(false);
    expect(existsSync(shimPath(dir, name))).toBe(false);
  });

  it("returns code 2 for an invalid orphan marker after killing and cleaning the live session", async () => {
    const name = "my-pack-broken-0";
    writeHarnessMarker(dir, name, "cursor");
    writeShim(dir, name, "/fake/moe-crew.cjs");
    const alive = new Set([name]);
    const tmux = makeTmux(async (_cmd, args) => {
      const target = args[args.indexOf("-t") + 1] ?? "";
      if (args[0] === "has-session") {
        return { stdout: "", stderr: "", code: alive.has(target) ? 0 : 1 };
      }
      if (args[0] === "kill-session") alive.delete(target);
      return { stdout: "", stderr: "", code: 0 };
    });
    const ctx: CommandContext = {
      workerDir: dir,
      home: dir,
      tmux,
      driver: getDriver("claude"),
    };

    const result = await cmdPackStop(ctx, { nameOrFile: "my-pack" });

    expect(result.code).toBe(2);
    expect(result.stderr).toContain("worker harness 'cursor'");
    expect(alive.has(name)).toBe(false);
    expect(existsSync(harnessMarkerPath(dir, name))).toBe(false);
    expect(existsSync(shimPath(dir, name))).toBe(false);
  });
});
