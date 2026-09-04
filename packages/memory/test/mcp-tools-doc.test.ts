import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const PACKAGE_ROOT = join(import.meta.dirname, "..");

/**
 * Regression guard for the MCP-TOOLS.md tool-count drift (BL-e6e0a743f3): the
 * doc claimed "seven MCP tools" while `mcp-server.ts` `toolDefinitions()`
 * returns nine — `search_conversations`, `read_conversation`,
 * `process_thoughts`, `search_journal`, `read_journal_entry`,
 * `list_recent_entries`, `read_recent_entries`, `link_memories`, and
 * `trace_provenance`. The server side is already guarded by
 * `mcp-startup.test.ts` ("lists all tools…", `toHaveLength(9)`); the doc had no
 * guard until now.
 */
describe("MCP-TOOLS.md documents nine tools", () => {
  const doc = readFileSync(
    join(PACKAGE_ROOT, "skills/remembering-conversations/MCP-TOOLS.md"),
    "utf-8",
  );

  it("states the correct tool count and no longer claims seven", () => {
    expect(doc).toContain("nine");
    expect(doc).not.toContain("seven MCP tools");
  });

  it("documents the two graph / provenance tools", () => {
    expect(doc).toContain("link_memories");
    expect(doc).toContain("trace_provenance");
  });
});
