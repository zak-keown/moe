import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const PACKAGE_ROOT = join(import.meta.dirname, "..");

function readJson(relPath: string): unknown {
  return JSON.parse(readFileSync(join(PACKAGE_ROOT, relPath), "utf-8"));
}

/**
 * REWRITTEN ON IMPORT. Upstream this suite asserted the contents of four hand-
 * maintained plugin manifests — `.claude-plugin/plugin.json`,
 * `.codex-plugin/plugin.json`, `.agents/plugins/marketplace.json` and
 * `.version-bump.json`. All four are gone: `@bubstack/moe-mint` generates plugin
 * manifests into `/plugins/moe-memory`, the two marketplace stubs collapse into
 * the single root `.claude-plugin/marketplace.json`, and the version-bump
 * lockstep tooling is void under the no-public-publishing decision.
 *
 * What survives is the part that is genuinely ours and genuinely breakable: the
 * MCP server declaration that the generated manifest points at, and the env-var
 * allowlist. That allowlist is the classic silent failure — an env var renamed in
 * code but not here is simply not passed through to the server, and nothing
 * reports it.
 */
describe("MCP server declaration", () => {
  it("declares a relative command that works from a generated plugin directory", () => {
    const mcpPath = join(PACKAGE_ROOT, ".mcp.json");
    expect(existsSync(mcpPath)).toBe(true);

    expect(readJson(".mcp.json")).toEqual({
      mcpServers: {
        "moe-memory": {
          command: "node",
          args: ["./dist/cli.js", "mcp-server"],
          cwd: ".",
          env_vars: [
            "MOE_MEMORY_CONFIG_DIR",
            "MOE_MEMORY_DB_PATH",
            "MOE_MEMORY_JOURNAL_PATH",
            "MOE_MEMORY_MODEL_CACHE_DIR",
            "MOE_DATA_DIR",
            "XDG_CONFIG_HOME",
            "CONVERSATION_SEARCH_EXCLUDE_PROJECTS",
          ],
        },
      },
    });
  });

  it("passes through every path-resolving env var src/paths.ts actually reads", () => {
    const mcp = readJson(".mcp.json") as {
      mcpServers: Record<string, { env_vars: string[] }>;
    };
    const allowed = new Set(mcp.mcpServers["moe-memory"]?.env_vars ?? []);
    const paths = readFileSync(join(PACKAGE_ROOT, "src/paths.ts"), "utf-8");

    // Every MOE_* variable paths.ts consults must be on the allowlist, or the
    // MCP server silently resolves a different data directory than the CLI.
    // Trailing-underscore forms are excluded: the file's prose mentions the
    // `MOE_MEMORY_*` namespace, which is a glob, not a variable.
    const referenced = new Set(paths.match(/\bMOE_[A-Z0-9]+(?:_[A-Z0-9]+)*\b/g) ?? []);
    for (const name of referenced) {
      expect(
        allowed.has(name),
        `${name} is read by src/paths.ts but not in .mcp.json env_vars`,
      ).toBe(true);
    }
    // And the two inherited names it also reads.
    expect(allowed.has("XDG_CONFIG_HOME")).toBe(true);
    expect(allowed.has("CONVERSATION_SEARCH_EXCLUDE_PROJECTS")).toBe(true);
  });

  it("does not ship hand-maintained plugin manifests — moe-mint generates them", () => {
    expect(existsSync(join(PACKAGE_ROOT, ".claude-plugin/plugin.json"))).toBe(false);
    expect(existsSync(join(PACKAGE_ROOT, ".codex-plugin/plugin.json"))).toBe(false);
    expect(existsSync(join(PACKAGE_ROOT, ".agents/plugins/marketplace.json"))).toBe(false);
    expect(existsSync(join(PACKAGE_ROOT, ".version-bump.json"))).toBe(false);
  });
});
