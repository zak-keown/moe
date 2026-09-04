export const TRUSTED_READ_ONLY_MCP = new Set([
  "mcp__plugin_moe-memory_moe-memory__search_conversations",
  "mcp__plugin_moe-memory_moe-memory__read_conversation",
  "mcp__plugin_moe-memory_moe-memory__search_journal",
  "mcp__plugin_moe-memory_moe-memory__read_journal_entry",
  "mcp__plugin_moe-memory_moe-memory__list_recent_entries",
  "mcp__plugin_moe-memory_moe-memory__read_recent_entries",
  "mcp__plugin_moe-memory_moe-memory__trace_provenance",
]);

export function classifyMcp(operation) {
  return TRUSTED_READ_ONLY_MCP.has(operation?.toolId)
    ? {
        eligible: true,
        normalized: { toolId: operation.toolId },
        globalSafe: false,
        reason: "exact Moe-owned read-only tool",
      }
    : {
        eligible: false,
        reason: "tool is not in the exact read-only catalog",
      };
}
