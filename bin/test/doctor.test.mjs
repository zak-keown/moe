// Vitest coverage for the dependency-free doctor and installer entry points.

import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  allProbes,
  cmpVersion,
  executableFile,
  extractTmuxVersion,
  extractVersion,
  overallExit,
  probeBashOnWindows,
  probeChrome,
} from "../lib/probes.mjs";

const BIN_DIR = fileURLToPath(new URL("..", import.meta.url));
const PROBES_URL = new URL("../lib/probes.mjs", import.meta.url).href;
const GENERAL_PLUGIN_NAMES = ["moe", "moe-backstory", "moe-memory", "moe-glass", "moe-crew"];

function harnessBin(...executables) {
  const dir = mkdtempSync(join(tmpdir(), "moe-host-bin-"));
  for (const executable of executables) {
    const file = join(dir, executable);
    writeFileSync(
      file,
      [
        "#!/bin/sh",
        'if [ "$1" = "--version" ]; then',
        `  printf '${executable} 1.2.3\\n'`,
        "  exit 0",
        "fi",
        'if [ -n "$MOE_TEST_ACTION_LOG" ]; then',
        `  printf '${executable} %s\\n' "$*" >> "$MOE_TEST_ACTION_LOG"`,
        "fi",
        "exit 0",
        "",
      ].join("\n"),
    );
    chmodSync(file, 0o755);
  }
  return dir;
}

function runBin(name, args = [], options = {}) {
  const env = { ...process.env, ...options.env };
  delete env.MOE_DEFAULT_HARNESS;
  if (options.defaultHarness !== undefined) env.MOE_DEFAULT_HARNESS = options.defaultHarness;
  if (options.path !== undefined) env.PATH = options.path;
  return spawnSync(process.execPath, [join(BIN_DIR, name), ...args], {
    encoding: "utf8",
    env,
  });
}

describe("probes library", () => {
  it("cmpVersion orders semver-ish version strings numerically", () => {
    expect(cmpVersion("24.19.0", "24.0.0")).toBeGreaterThan(0);
    expect(cmpVersion("2.9.0", "2.10.0")).toBeLessThan(0);
    expect(cmpVersion("1.98.0", "1.98.0")).toBe(0);
  });

  it("extractVersion pulls the first N.N.N triple out of tool version output", () => {
    expect(extractVersion("v24.19.0")).toBe("24.19.0");
    expect(extractVersion("pnpm 11.23.0")).toBe("11.23.0");
    expect(extractVersion("cargo 1.98.0 (some hash 2024-01-01)")).toBe("1.98.0");
    expect(extractVersion(undefined)).toBeUndefined();
    expect(extractVersion("")).toBeUndefined();
  });

  it("extractTmuxVersion handles tmux's own version format, never a N.N.N triple", () => {
    // Real tmux -V output across releases: no release has ever shipped a
    // three-part version, so extractVersion's N.N.N-only regex always misses.
    expect(extractTmuxVersion("tmux 3.7c")).toBe("3.7");
    expect(extractTmuxVersion("tmux 3.4")).toBe("3.4");
    expect(extractTmuxVersion("tmux 3.3a")).toBe("3.3");
    expect(extractTmuxVersion("tmux 2.8")).toBe("2.8");
    expect(extractTmuxVersion(undefined)).toBeUndefined();
    expect(extractTmuxVersion("")).toBeUndefined();
  });

  it("allProbes returns typed results including node", () => {
    const results = allProbes("claude-code");
    expect(results.length).toBeGreaterThanOrEqual(5);
    for (const result of results) {
      expect(typeof result.name).toBe("string");
      expect(["hard", "soft"]).toContain(result.tier);
      expect(typeof result.ok).toBe("boolean");
    }
    const node = results.find((result) => result.name === "node");
    expect(node).toBeDefined();
    expect(node.version).toBe(process.version.replace(/^v/, ""));
    expect(node.ok).toBe(cmpVersion(node.version, "24.0.0") >= 0);
    expect(results.find((result) => result.name === "pnpm")?.tier).toBe("soft");
  });

  it("overallExit is 0 iff every hard probe passes", () => {
    expect(
      overallExit([
        { tier: "hard", ok: true },
        { tier: "soft", ok: false },
      ]),
    ).toBe(0);
    expect(
      overallExit([
        { tier: "hard", ok: false },
        { tier: "soft", ok: true },
      ]),
    ).toBe(1);
    expect(overallExit([])).toBe(0);
  });

  it("tryExec bounds a tool that never exits", () => {
    const source = `
      import { tryExec } from ${JSON.stringify(PROBES_URL)};
      const output = tryExec(process.execPath, ["-e", "setInterval(() => {}, 1000)"]);
      if (output !== undefined) process.exit(2);
    `;
    const proc = spawnSync(process.execPath, ["--input-type=module", "-e", source], {
      encoding: "utf8",
      timeout: 4_000,
      killSignal: "SIGKILL",
    });

    expect(proc.error?.code).not.toBe("ETIMEDOUT");
    expect(proc.status, proc.stderr).toBe(0);
  });

  it("honors the Claude bash override only for Claude Code on Windows", () => {
    const options = {
      platform: "win32",
      env: { CLAUDE_CODE_GIT_BASH_PATH: "C:\\custom\\bash.exe", PATH: "" },
      isExecutableFile: (path) => path === "C:\\custom\\bash.exe",
      executableOnPath: () => false,
    };

    expect(probeBashOnWindows("claude-code", options)).toMatchObject({
      ok: true,
      version: "C:\\custom\\bash.exe",
    });
    for (const harness of ["cursor", "copilot"]) {
      const result = probeBashOnWindows(harness, options);
      expect(result).toMatchObject({ ok: false, tier: "hard" });
      expect(result.fixHint).not.toMatch(/CLAUDE_CODE_GIT_BASH_PATH|Claude Code/);
    }
  });

  it("accepts only wrapper-visible standard or PATH bash for Cursor and Copilot", () => {
    const standard = probeBashOnWindows("cursor", {
      platform: "win32",
      env: { PATH: "" },
      isExecutableFile: (path) => path === "C:\\Program Files\\Git\\bin\\bash.exe",
      executableOnPath: () => false,
    });
    const onPath = probeBashOnWindows("copilot", {
      platform: "win32",
      env: { PATH: "C:\\tools" },
      isExecutableFile: () => false,
      executableOnPath: () => true,
    });

    expect(standard).toMatchObject({ ok: true, version: "C:\\Program Files\\Git\\bin\\bash.exe" });
    expect(onPath).toMatchObject({ ok: true, version: "bash.exe on PATH" });
  });

  it("accepts a Windows executable candidate only when it is a regular file", () => {
    const dir = mkdtempSync(join(tmpdir(), "moe-windows-bash-"));
    const file = join(dir, "bash.exe");
    writeFileSync(file, "fixture\n");

    expect(executableFile(dir, { platform: "win32" })).toBe(false);
    expect(executableFile(file, { platform: "win32" })).toBe(true);
  });

  it("rejects a non-file Claude bash override before trying executable standard candidates", () => {
    const result = probeBashOnWindows("claude-code", {
      platform: "win32",
      env: { CLAUDE_CODE_GIT_BASH_PATH: "C:\\directory", PATH: "" },
      isExecutableFile: (path) => path === "C:\\Program Files\\Git\\bin\\bash.exe",
      executableOnPath: () => false,
    });

    expect(result).toMatchObject({
      ok: true,
      version: "C:\\Program Files\\Git\\bin\\bash.exe",
    });
  });

  it("probeChrome finds a PATH-installed browser without relying on a standalone `command` executable", () => {
    // Regression for CR-002: on Debian/Ubuntu/Alpine there is no standalone
    // `command` binary (it is a shell builtin only), so shelling out to it
    // via execFileSync always throws ENOENT. Constrain PATH to a directory
    // that has the browser but nothing named `command`/`where`, matching
    // that environment, and confirm probeChrome still finds it.
    const dir = mkdtempSync(join(tmpdir(), "moe-chrome-bin-"));
    const file = join(dir, "chromium");
    writeFileSync(file, "#!/bin/sh\necho fixture\n");
    chmodSync(file, 0o755);

    const originalPath = process.env.PATH;
    process.env.PATH = dir;
    try {
      const found = probeChrome();
      expect(found).toMatchObject({ name: "chrome", ok: true });
    } finally {
      process.env.PATH = originalPath;
    }
  });
});

describe("moe-doctor and moe-install entry points", () => {
  it("moe-doctor --help exits 0 and mentions the two tiers", () => {
    const proc = runBin("moe-doctor", ["--help"]);
    expect(proc.status, proc.stderr).toBe(0);
    expect(proc.stdout).toMatch(/moe-doctor/);
    expect(proc.stdout).toMatch(/HARD/);
  });

  it("moe-doctor --json emits parseable JSON with a results array", () => {
    const proc = runBin("moe-doctor", ["--harness", "codex", "--json"], {
      path: harnessBin("codex"),
    });
    expect([0, 1], `unexpected exit ${proc.status}: ${proc.stderr}`).toContain(proc.status);
    const parsed = JSON.parse(proc.stdout);
    expect(parsed.harness).toBe("codex");
    expect(Array.isArray(parsed.results)).toBe(true);
    expect(typeof parsed.platform).toBe("string");
    expect(parsed.results).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "codex", tier: "hard" })]),
    );
    expect(parsed.results).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "claude" })]),
    );
  });

  it("moe-doctor uses the configured default ahead of an ambiguous installed fleet without mutation", () => {
    const actionLog = join(mkdtempSync(join(tmpdir(), "moe-doctor-log-")), "actions");
    const proc = runBin("moe-doctor", [], {
      path: harnessBin("claude", "codex"),
      defaultHarness: "pi",
      env: { MOE_TEST_ACTION_LOG: actionLog },
    });

    expect([0, 1], proc.stderr).toContain(proc.status);
    expect(proc.stdout).toMatch(/harness: pi; selected-by: MOE_DEFAULT_HARNESS/);
    expect(existsSync(actionLog)).toBe(false);
  });

  it("moe-doctor selects the sole installed harness without mutation", () => {
    const actionLog = join(mkdtempSync(join(tmpdir(), "moe-doctor-log-")), "actions");
    const proc = runBin("moe-doctor", [], {
      path: harnessBin("opencode"),
      env: { MOE_TEST_ACTION_LOG: actionLog },
    });

    expect([0, 1], proc.stderr).toContain(proc.status);
    expect(proc.stdout).toMatch(/harness: opencode; selected-by: installed executable/);
    expect(existsSync(actionLog)).toBe(false);
  });

  it("moe-doctor rejects ambiguous installed harnesses without mutation", () => {
    const actionLog = join(mkdtempSync(join(tmpdir(), "moe-doctor-log-")), "actions");
    const proc = runBin("moe-doctor", [], {
      path: harnessBin("claude", "codex"),
      env: { MOE_TEST_ACTION_LOG: actionLog },
    });

    expect(proc.status).toBe(2);
    expect(proc.stderr).toMatch(
      /multiple harness executables are installed \(claude-code, codex\)/,
    );
    expect(existsSync(actionLog)).toBe(false);
  });

  it("moe-install --help documents apply and no migration surface", () => {
    const proc = runBin("moe-install", ["--help"]);
    expect(proc.status, proc.stderr).toBe(0);
    expect(proc.stdout).toMatch(/--apply/);
    expect(proc.stdout).not.toMatch(/--migrate/);
  });

  it("uses the sole installed harness for a read-only plan", () => {
    const proc = runBin("moe-install", [], { path: harnessBin("opencode") });
    expect(proc.status, proc.stderr).toBe(0);
    expect(proc.stdout).toMatch(/harness=opencode/);
    expect(proc.stdout).toMatch(/Manual plan/);
    expect(proc.stdout).not.toMatch(/moe-statusline/);
  });

  it("lets --harness win over an ambiguous installed fleet and the configured default", () => {
    const proc = runBin("moe-install", ["--harness", "codex"], {
      path: harnessBin("claude", "codex", "pi"),
      defaultHarness: "pi",
    });
    expect(proc.status, proc.stderr).toBe(0);
    expect(proc.stdout).toMatch(/harness=codex/);
    expect(proc.stdout).toMatch(/Manual plan/);
  });

  it("uses MOE_DEFAULT_HARNESS before installed executable detection", () => {
    const proc = runBin("moe-install", [], {
      path: harnessBin("claude", "codex"),
      defaultHarness: "pi",
    });
    expect(proc.status, proc.stderr).toBe(0);
    expect(proc.stdout).toMatch(/harness=pi/);
  });

  it.each([
    ["zero", harnessBin(), /no supported harness executable/i],
    ["multiple", harnessBin("claude", "codex"), /multiple harness executables/i],
  ])("rejects %s detected harnesses before any action", (_case, path, message) => {
    const actionLog = join(mkdtempSync(join(tmpdir(), "moe-action-log-")), "actions");
    const proc = runBin("moe-install", ["--apply"], {
      path,
      env: { MOE_TEST_ACTION_LOG: actionLog },
    });
    expect(proc.status).toBe(2);
    expect(proc.stderr).toMatch(message);
    expect(proc.stderr).toMatch(
      /claude-code, cursor, codex, kimi, opencode, pi, agent-plugins-1\.0, copilot/,
    );
    expect(existsSync(actionLog)).toBe(false);
  });

  it("keeps automated dry-runs side-effect-free", () => {
    const actionLog = join(mkdtempSync(join(tmpdir(), "moe-action-log-")), "actions");
    const proc = runBin("moe-install", ["--harness", "claude-code"], {
      path: harnessBin("claude"),
      env: { MOE_TEST_ACTION_LOG: actionLog },
    });
    expect(proc.status, proc.stderr).toBe(0);
    expect(proc.stdout).toMatch(/Plan \(dry-run/);
    expect(existsSync(actionLog)).toBe(false);
  });

  it.each([
    ...["cursor", "kimi", "agent-plugins-1.0", "codex", "opencode", "pi"].flatMap((harness) => [
      [harness, "install", []],
      [harness, "upgrade", ["--upgrade"]],
      [harness, "uninstall", ["--uninstall"]],
    ]),
    ["copilot", "upgrade", ["--upgrade"]],
    ["copilot", "uninstall", ["--uninstall"]],
  ])(
    "refuses manual-only %s %s --apply before doctor or host mutation",
    (harness, _action, actionArgs) => {
      const actionLog = join(mkdtempSync(join(tmpdir(), "moe-action-log-")), "actions");
      const proc = runBin("moe-install", ["--harness", harness, ...actionArgs, "--apply"], {
        path: harnessBin("claude", "cursor-agent", "codex", "kimi", "opencode", "pi"),
        env: { MOE_TEST_ACTION_LOG: actionLog },
      });
      expect(proc.status).toBe(2);
      expect(proc.stderr).toMatch(/manual-only|no stable automated route/i);
      expect(existsSync(actionLog)).toBe(false);
    },
  );

  it("routes Claude install through the verified action commands", () => {
    const actionLog = join(mkdtempSync(join(tmpdir(), "moe-action-log-")), "actions");
    const proc = runBin(
      "moe-install",
      ["--harness", "claude-code", "--apply", "--skip-doctor", "--scope", "project"],
      {
        path: harnessBin("claude"),
        env: { MOE_TEST_ACTION_LOG: actionLog },
      },
    );
    expect(proc.status, proc.stderr).toBe(0);
    const actions = readFileSync(actionLog, "utf8");
    expect(actions).toContain(
      "claude plugin marketplace add https://github.com/zak-keown/moe.git --scope project",
    );
    expect(actions).toContain("claude plugin install moe-statusline@moe --scope project");
  });

  it.each([
    ["upgrade", "--upgrade"],
    ["uninstall", "--uninstall"],
  ])("keeps Claude %s manual-only before any destructive host command", (_action, flag) => {
    const actionLog = join(mkdtempSync(join(tmpdir(), "moe-action-log-")), "actions");
    const proc = runBin(
      "moe-install",
      ["--harness", "claude-code", flag, "--apply", "--skip-doctor"],
      {
        path: harnessBin("claude"),
        env: { MOE_TEST_ACTION_LOG: actionLog },
      },
    );
    expect(proc.status).toBe(2);
    expect(proc.stdout).toMatch(/Manual plan/);
    for (const name of [...GENERAL_PLUGIN_NAMES, "moe-statusline"]) {
      expect(proc.stdout).toContain(`${name}@moe`);
    }
    expect(existsSync(actionLog)).toBe(false);
  });

  it("routes the verified Copilot install without the Claude-only statusline", () => {
    const actionLog = join(mkdtempSync(join(tmpdir(), "moe-action-log-")), "actions");
    const proc = runBin("moe-install", ["--harness", "copilot", "--apply", "--skip-doctor"], {
      path: harnessBin("copilot"),
      env: { MOE_TEST_ACTION_LOG: actionLog },
    });
    expect(proc.status, proc.stderr).toBe(0);
    const actions = readFileSync(actionLog, "utf8");
    expect(actions).toContain("copilot plugin marketplace add https://github.com/zak-keown/moe");
    expect(actions).not.toContain("https://github.com/zak-keown/moe.git");
    expect(actions).toContain("copilot plugin install moe@moe");
    expect(actions).not.toContain("moe-statusline");
  });

  it.each([
    ["cursor", (name) => `- ${name}: run \`/add-plugin\`; plugin directory \`plugins/${name}/\``],
    [
      "codex",
      (name) =>
        `- ${name}: open \`/plugins\`; marketplace descriptor \`plugins/${name}/.agents/plugins/marketplace.json\``,
    ],
    ["kimi", (name) => `- ${name}: \`/plugins install https://github.com/zak-keown/moe\``],
    ["opencode", (name) => `"${name}@git+https://github.com/zak-keown/moe.git"`],
    ["pi", (name) => `- ${name}: \`pi install git:github.com/zak-keown/moe\``],
    ["agent-plugins-1.0", (name) => `- ${name}: \`plugins/${name}/\``],
  ])("prints concrete generated-equivalent %s install guidance per plugin", (harness, entry) => {
    const proc = runBin("moe-install", ["--harness", harness]);
    expect(proc.status, proc.stderr).toBe(0);
    for (const name of GENERAL_PLUGIN_NAMES) expect(proc.stdout).toContain(entry(name));
    expect(proc.stdout).not.toMatch(/<name>|<your-repo>|\bNAME\b|listed plugins|then select/i);
  });

  it.each([
    [["--harness", "nope"], /unknown harness/i],
    [["--scope", "global", "--harness", "claude-code"], /invalid scope/i],
    [["--scope", "user", "--harness", "codex"], /does not support --scope/i],
    [["--wat"], /unknown option/i],
    [["--upgrade", "--uninstall", "--harness", "claude-code"], /choose only one action/i],
  ])("diagnoses invalid installer arguments with exit 2", (args, message) => {
    const proc = runBin("moe-install", args, { path: harnessBin("claude") });
    expect(proc.status).toBe(2);
    expect(proc.stderr).toMatch(message);
  });
});
