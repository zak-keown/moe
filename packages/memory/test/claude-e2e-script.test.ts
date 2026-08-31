import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const PACKAGE_ROOT = join(import.meta.dirname, "..");

/**
 * The cheap guard on the expensive harness. It greps the script for the exact
 * tokens the rebrand had to touch, so a sweep that moved one and not the other
 * fails here rather than at the next live run — which needs real Claude auth and
 * so effectively never happens in CI.
 *
 * The harness moved to test/manual/: it needs a GENERATED plugin directory now,
 * because the package root is no longer a valid Claude plugin (moe-mint emits
 * manifests into /plugins/moe-memory).
 */
describe("Claude E2E test harness", () => {
  it("exposes an opt-in npm script", () => {
    const pkg = JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf-8"));
    expect(pkg.scripts["test:claude-e2e"]).toBe("node test/manual/claude-e2e.js");
  });

  it("contains the production Claude plugin workflow checks", () => {
    const scriptPath = join(PACKAGE_ROOT, "test/manual/claude-e2e.js");
    expect(existsSync(scriptPath)).toBe(true);

    const script = readFileSync(scriptPath, "utf-8");
    expect(script).toContain("MOE_MEMORY_RUN_CLAUDE_E2E");
    expect(script).toContain("CLAUDE_BIN");
    expect(script).toContain("TEST_PROJECTS_DIR");
    expect(script).toContain("--plugin-dir");
    expect(script).toContain("FOUND_CLAUDE_MEMORY_E2E");
    // The compound MCP tool name: mcp__plugin_<plugin>_<serverKey>__<tool>.
    // Both halves were renamed and the tool itself was renamed from `search`.
    expect(script).toContain("mcp__plugin_moe-memory_moe-memory__search_conversations");
    // The plugin tree is generated, so the harness must be told where it is.
    expect(script).toContain("MOE_MEMORY_E2E_PLUGIN_DIR");
  });
});
