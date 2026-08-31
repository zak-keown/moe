import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const PACKAGE_ROOT = join(import.meta.dirname, "..");

describe("Codex E2E test harness", () => {
  it("exposes an opt-in npm script", () => {
    const pkg = JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf-8"));
    expect(pkg.scripts["test:codex-e2e"]).toBe("node test/manual/codex-e2e.js");
  });

  it("contains the production Codex plugin workflow checks", () => {
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
