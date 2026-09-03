import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("plugin hook configuration", () => {
  it("uses a plugin root fallback that works in Codex and Claude Code", () => {
    const hooks = JSON.parse(
      readFileSync(new URL("../hooks/hooks.json", import.meta.url), "utf-8"),
    );

    const command = hooks.hooks.SessionStart[0].hooks[0].command;

    // The two-name fallback is load-bearing: Codex sets PLUGIN_ROOT, Claude Code
    // sets CLAUDE_PLUGIN_ROOT. The path is `dist/cli.js` because the four
    // upstream bins and their extensionless shim layer collapsed into one
    // dispatcher — `cli/episodic-memory.js` no longer exists.
    expect(command).toBe('node "${PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT}}/dist/cli.js" sync --hook');
  });

  it("does not mark the hook async because Codex plugin hooks do not support async handlers yet", () => {
    const hooks = JSON.parse(
      readFileSync(new URL("../hooks/hooks.json", import.meta.url), "utf-8"),
    );

    const handler = hooks.hooks.SessionStart[0].hooks[0];

    expect(handler.async).toBeUndefined();
  });
});
