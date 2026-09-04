import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const PACKAGE_ROOT = join(import.meta.dirname, "..");

/**
 * This suite guards the shape of the OPT-IN Codex MCP E2E harness, which targets
 * the v0.3.0 (H1) Codex MCP path — NOT a shipped 0.2.1 capability. In 0.2.1,
 * `moe-memory.yaml` grants Codex `expected_capabilities: [skill-discovery]`
 * only; the codex adapter emits no MCP server and no hooks (see
 * `packages/mint/src/adapters/codex.ts`). The `hooks/list` and
 * `mcp__moe_memory__` assertions below therefore verify that the harness file
 * is intact for the 0.3.0 Codex MCP emitter — they do NOT assert that the
 * plugin ships MCP recall today.
 */
describe("Codex E2E test harness (targets v0.3.0 Codex MCP; not a 0.2.1 capability)", () => {
  it("exposes an opt-in npm script", () => {
    const pkg = JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf-8"));
    expect(pkg.scripts["test:codex-e2e"]).toBe("node test/manual/codex-e2e.js");
  });

  it("contains the planned Codex MCP workflow checks", () => {
    const scriptPath = join(PACKAGE_ROOT, "test/manual/codex-e2e.js");
    expect(existsSync(scriptPath)).toBe(true);

    const script = readFileSync(scriptPath, "utf-8");
    expect(script).toContain("MOE_MEMORY_RUN_CODEX_E2E");
    expect(script).toContain("tmux");
    expect(script).toContain("hooks/list");
    expect(script).toContain("FOUND_MEMORY_E2E");
    expect(script).toContain("MIN_CODEX_VERSION");
    // Codex normalises the server key to underscores, so this form is invisible
    // to any hyphen-based sweep and there is exactly one occurrence of it.
    expect(script).toContain("mcp__moe_memory__");
    expect(script).toContain("MOE_MEMORY_E2E_PLUGIN_DIR");
  });
});
