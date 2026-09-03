import { describe, it, expect } from "vitest";
import { createMemoryMcpServer } from "../src/mcp-server.js";

describe("MCP server cold start", () => {
  it("lists all tools without initializing heavy runtime", async () => {
    let runtimeCreated = false;
    const server = createMemoryMcpServer({
      runtimeFactory: async () => {
        runtimeCreated = true;
        throw new Error("Runtime should not be created during tool listing");
      },
    });

    const handler = (server as any)._requestHandlers?.get("tools/list");
    expect(handler).toBeDefined();

    const result = await handler({ method: "tools/list", params: {} });
    const toolNames = result.tools.map((t: any) => t.name);

    expect(toolNames).toContain("search_conversations");
    expect(toolNames).toContain("read_conversation");
    expect(toolNames).toContain("process_thoughts");
    expect(toolNames).toContain("search_journal");
    expect(toolNames).toContain("read_journal_entry");
    expect(toolNames).toContain("list_recent_entries");
    expect(toolNames).toContain("read_recent_entries");
    expect(toolNames).toContain("link_memories");
    expect(toolNames).toContain("trace_provenance");
    expect(toolNames).toHaveLength(9);

    expect(runtimeCreated).toBe(false);
  });

  it("does not call runtimeFactory until a search tool is invoked", async () => {
    let factoryCalls = 0;
    const server = createMemoryMcpServer({
      runtimeFactory: async () => {
        factoryCalls++;
        return {
          searchConversations: async () => [],
          searchMultipleConcepts: async () => [],
          openDatabase: () => { throw new Error("not available"); },
          createJournalSearch: () => { throw new Error("not available"); },
        };
      },
    });

    const listHandler = (server as any)._requestHandlers?.get("tools/list");
    await listHandler({ method: "tools/list", params: {} });
    expect(factoryCalls).toBe(0);
  });
});
