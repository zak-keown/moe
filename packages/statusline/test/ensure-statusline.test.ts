import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultSettingsPath, ensureStatusLine } from "../src/hooks/ensure-statusline.js";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SESSION_START_COMMANDS = JSON.parse(
  readFileSync(join(PACKAGE_ROOT, "hooks/hooks.json"), "utf8"),
).hooks.SessionStart.flatMap((registration: { hooks?: Array<{ command?: string }> }) =>
  (registration.hooks ?? []).flatMap((hook) =>
    typeof hook.command === "string" ? [hook.command] : [],
  ),
) as string[];

describe("ensureStatusLine", () => {
  let dir: string;
  let settingsPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "moe-statusline-test-"));
    settingsPath = join(dir, "settings.json");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("writes statusLine when settings.json does not exist", () => {
    const result = ensureStatusLine({
      settingsPath,
      vendoredScriptPath: "/plugin/vendor/ccstatusline/ccstatusline.js",
    });

    expect(result).toEqual({ wrote: true, reason: "written" });
    const written = JSON.parse(readFileSync(settingsPath, "utf8"));
    expect(written.statusLine).toEqual({
      type: "command",
      command: 'node "/plugin/vendor/ccstatusline/ccstatusline.js"',
      padding: 0,
    });
  });

  it("writes statusLine when settings.json exists but has no statusLine key, preserving other keys", () => {
    writeFileSync(settingsPath, JSON.stringify({ someOtherSetting: true }));

    const result = ensureStatusLine({
      settingsPath,
      vendoredScriptPath: "/plugin/vendor/ccstatusline/ccstatusline.js",
    });

    expect(result).toEqual({ wrote: true, reason: "written" });
    const written = JSON.parse(readFileSync(settingsPath, "utf8"));
    expect(written.someOtherSetting).toBe(true);
    expect(written.statusLine).toBeDefined();
  });

  it("never overwrites an existing statusLine", () => {
    const existing = { statusLine: { type: "command", command: "my-own-statusline" } };
    writeFileSync(settingsPath, JSON.stringify(existing));

    const result = ensureStatusLine({
      settingsPath,
      vendoredScriptPath: "/plugin/vendor/ccstatusline/ccstatusline.js",
    });

    expect(result).toEqual({ wrote: false, reason: "already-set" });
    expect(JSON.parse(readFileSync(settingsPath, "utf8"))).toEqual(existing);
  });

  it("is idempotent across repeated calls", () => {
    ensureStatusLine({
      settingsPath,
      vendoredScriptPath: "/plugin/vendor/ccstatusline/ccstatusline.js",
    });
    const afterFirst = readFileSync(settingsPath, "utf8");

    const second = ensureStatusLine({
      settingsPath,
      vendoredScriptPath: "/plugin/vendor/ccstatusline/ccstatusline.js",
    });

    expect(second).toEqual({ wrote: false, reason: "already-set" });
    expect(readFileSync(settingsPath, "utf8")).toBe(afterFirst);
  });

  it("treats an unparseable settings.json as unreadable and does not write", () => {
    writeFileSync(settingsPath, "{ not valid json");

    const result = ensureStatusLine({
      settingsPath,
      vendoredScriptPath: "/plugin/vendor/ccstatusline/ccstatusline.js",
    });

    expect(result).toEqual({ wrote: false, reason: "unreadable-settings" });
    expect(readFileSync(settingsPath, "utf8")).toBe("{ not valid json");
  });

  it("treats a settings.json whose top level is not an object as unreadable and does not write", () => {
    writeFileSync(settingsPath, JSON.stringify(["not", "an", "object"]));

    const result = ensureStatusLine({
      settingsPath,
      vendoredScriptPath: "/plugin/vendor/ccstatusline/ccstatusline.js",
    });

    expect(result).toEqual({ wrote: false, reason: "unreadable-settings" });
  });

  it("creates parent directories that do not yet exist", () => {
    const nestedPath = join(dir, "nested", "deeper", "settings.json");

    const result = ensureStatusLine({
      settingsPath: nestedPath,
      vendoredScriptPath: "/plugin/vendor/ccstatusline/ccstatusline.js",
    });

    expect(result).toEqual({ wrote: true, reason: "written" });
    expect(JSON.parse(readFileSync(nestedPath, "utf8")).statusLine).toBeDefined();
  });
});

describe("defaultSettingsPath", () => {
  it("uses CLAUDE_CONFIG_DIR instead of the OS home when configured", () => {
    expect(defaultSettingsPath({ CLAUDE_CONFIG_DIR: "/isolated/claude" }, "/host/home")).toBe(
      "/isolated/claude/settings.json",
    );
  });

  it("falls back to the current ~/.claude location", () => {
    expect(defaultSettingsPath({}, "/host/home")).toBe("/host/home/.claude/settings.json");
  });
});

describe("packed SessionStart command", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "moe-statusline-hook-test-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function execute(command: string, commandIndex: number, envOverrides: NodeJS.ProcessEnv) {
    const commandDir = join(dir, String(commandIndex));
    mkdirSync(commandDir, { recursive: true });
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      CLAUDE_CONFIG_DIR: join(commandDir, "claude-config"),
      CLAUDE_PLUGIN_ROOT: PACKAGE_ROOT,
      ...envOverrides,
    };
    if (envOverrides.PLUGIN_ROOT === undefined) delete env.PLUGIN_ROOT;
    const needsInput = envOverrides.PLUGIN_ROOT === undefined;
    return spawnSync("bash", ["-c", command], {
      cwd: commandDir,
      env,
      ...(needsInput
        ? { input: '{"hook_event_name":"SessionStart","source":"startup"}\n' }
        : { stdio: ["ignore", "pipe", "pipe"] }),
      encoding: "utf8",
    });
  }

  it("is a silent no-op under Codex plugin-root semantics", () => {
    expect(SESSION_START_COMMANDS.length).toBeGreaterThan(0);
    for (const [index, command] of SESSION_START_COMMANDS.entries()) {
      const result = execute(command, index, { PLUGIN_ROOT: PACKAGE_ROOT });

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("");
      expect(existsSync(join(dir, String(index), "claude-config", "settings.json"))).toBe(false);
    }
  });

  it("preserves Claude's first-run configuration behavior", () => {
    expect(SESSION_START_COMMANDS.length).toBeGreaterThan(0);
    for (const [index, command] of SESSION_START_COMMANDS.entries()) {
      const result = execute(command, index, {});

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
      expect(result.stdout).toBe("Moe: configured the Claude Code statusline (ccstatusline).\n");
      expect(result.stderr).toBe("");
      const settings = JSON.parse(
        readFileSync(join(dir, String(index), "claude-config", "settings.json"), "utf8"),
      );
      expect(settings.statusLine.command).toBe(
        `node "${join(PACKAGE_ROOT, "vendor/ccstatusline/ccstatusline.js")}"`,
      );
    }
  });
});
