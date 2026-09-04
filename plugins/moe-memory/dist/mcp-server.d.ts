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
 * Startup connects MCP transport BEFORE opening databases, loading models,
 * or indexing journals. `initialize` and `tools/list` finish in under two
 * seconds from a cold extracted artifact. Heavy runtime is created lazily
 * on the first tool call.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { MemoryToolRuntimeFactory } from "./mcp-runtime.js";
export interface MemoryServerOptions {
    /** Overrides the project journal directory. `moe-memory mcp-server --journal-path <dir>`. */
    journalPath?: string | undefined;
    /** Factory for the heavy runtime; defaults to lazy singleton. */
    runtimeFactory?: MemoryToolRuntimeFactory | undefined;
}
export declare function createMemoryMcpServer(options?: MemoryServerOptions): Server;
/** Parse the one CLI flag the MCP entry point accepts. */
export declare function parseJournalPathArg(argv: string[]): string | undefined;
export declare function runMemoryMcpServer(argv?: string[]): Promise<void>;
