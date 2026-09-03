import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const hooks = JSON.parse(readFileSync(new URL("../hooks/hooks.json", import.meta.url), "utf-8"));
const sessionStartCommands = hooks.hooks.SessionStart.flatMap(
  (entry: { hooks: { command: string }[] }) => entry.hooks.map((hook) => hook.command),
);

const testDirs: string[] = [];

function makeTestDir(): string {
  const testDir = mkdtempSync(join(tmpdir(), "moe-memory-hook-test-"));
  testDirs.push(testDir);
  return testDir;
}

afterEach(() => {
  for (const testDir of testDirs.splice(0)) {
    rmSync(testDir, { recursive: true, force: true });
  }
});

describe("plugin hook configuration", () => {
  it("exits silently in Codex before invoking Node", () => {
    const testDir = makeTestDir();
    const nodeBinDir = join(testDir, "bin");
    const nodeInvocation = join(testDir, "node-invoked");
    mkdirSync(nodeBinDir);
    const fakeNode = join(nodeBinDir, "node");
    writeFileSync(fakeNode, '#!/bin/sh\nprintf invoked > "$NODE_INVOCATION"\n', "utf-8");
    chmodSync(fakeNode, 0o755);

    for (const command of sessionStartCommands) {
      const result = spawnSync("/bin/sh", ["-c", command], {
        encoding: "utf-8",
        env: {
          NODE_INVOCATION: nodeInvocation,
          PATH: nodeBinDir,
          PLUGIN_ROOT: "/tmp/codex-npm-cache/moe-memory",
        },
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("");
    }

    expect(existsSync(nodeInvocation)).toBe(false);
  });

  it("runs Claude's dependency-free fixture CLI with sync --background", () => {
    const testDir = makeTestDir();
    const pluginRoot = join(testDir, "claude-plugin");
    const capturePath = join(testDir, "cli-arguments.json");
    mkdirSync(join(pluginRoot, "dist"), { recursive: true });
    writeFileSync(
      join(pluginRoot, "dist", "cli.js"),
      'import { writeFileSync } from "node:fs";\nwriteFileSync(process.env.HOOK_CAPTURE, JSON.stringify(process.argv.slice(2)));\n',
      "utf-8",
    );

    for (const command of sessionStartCommands) {
      const result = spawnSync("/bin/sh", ["-c", command], {
        encoding: "utf-8",
        env: {
          CLAUDE_PLUGIN_ROOT: pluginRoot,
          HOOK_CAPTURE: capturePath,
          PATH: process.env.PATH ?? "",
        },
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("");
      expect(JSON.parse(readFileSync(capturePath, "utf-8"))).toEqual(["sync", "--background"]);
    }
  });

  it("does not mark the hook async because Codex plugin hooks do not support async handlers yet", () => {
    const handler = hooks.hooks.SessionStart[0].hooks[0];

    expect(handler.async).toBeUndefined();
  });
});
