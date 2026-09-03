#!/usr/bin/env node
/**
 * The one MCP server, keyed `moe-memory`.
 *
 * Seven tools over two record types:
 *
 *   search_conversations  read_conversation                    harvested transcript turns
 *   process_thoughts      search_journal  read_journal_entry   deliberately written entries
 *   list_recent_entries   read_recent_entries
 *
 * Upstream this was two servers. episodic-memory registered bare `search` and
 * `read`; private-journal-mcp registered the five journal tools. There was no
 * byte-identical collision, but `search` alongside `search_journal` reads as a
 * bug — so the two generic names are the ones that got namespaced. That rename
 * drags eleven Zone-A sites with it: the agent's `tools:` frontmatter, SKILL.md,
 * MCP-TOOLS.md, prompts/search-agent.md, both e2e harnesses and two tests.
 *
 * private-journal-mcp's `PrivateJournalServer` class is gone. Its `new Server({name,
 * version})` single-argument constructor is legal only on SDK 0.x; on ^1.20 a
 * tools server must declare `capabilities: { tools: {} }` or the capability
 * assertion rejects tools/list and tools/call — which would have looked exactly
 * like the "empty tools/list on Node 22+" bug its own CHANGELOG records, and been
 * misdiagnosed as that.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
export interface MemoryServerOptions {
    /** Overrides the project journal directory. `moe-memory mcp-server --journal-path <dir>`. */
    journalPath?: string | undefined;
}
export declare function createMemoryMcpServer(options?: MemoryServerOptions): Server;
/** Parse the one CLI flag the MCP entry point accepts. */
export declare function parseJournalPathArg(argv: string[]): string | undefined;
export declare function runMemoryMcpServer(argv?: string[]): Promise<void>;
