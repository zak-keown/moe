# Migrating to @bubstack/moe-memory 0.2

## What changed

The 0.2 release narrows the public API to high-level operations. Raw database
handles (`initDatabase`, `insertExchange`, `deleteExchange`), internal migration
functions, embedding lifecycle, indexer internals, journal store classes, and
summarizer internals are no longer exported from the package root.

## Why

The 0.1.x API exposed `better-sqlite3` types in its public surface. The 0.2
line replaces `better-sqlite3` with Node's built-in `node:sqlite`, making the
raw database type a breaking change. Rather than re-export a different raw
handle, the public API now exposes only the high-level operations that
consumers actually use.

## What to use instead

| Old API | New approach |
|---------|-------------|
| `initDatabase()` + raw SQL | Use the CLI (`moe-memory sync`, `moe-memory stats`) or MCP tools |
| `insertExchange()` | `moe-memory sync` indexes conversations automatically |
| `searchConversations()` | Still exported — no change |
| `JournalStore` / `indexJournal` | `moe-memory journal index` CLI or MCP `search_journal` |
| `generateEmbedding()` | Embedding is internal; search functions handle it |
| `insertNode()` / `insertEdge()` | MCP `create_memory_node` / `create_memory_edge` |
| `getNode()` / `getEdgesFrom()` | MCP `get_memory_node` / `get_memory_edges` |

## Retained exports

All path utilities, parser functions, search functions, type definitions, and
constants remain available. See `API-DIFF-0.1.5-to-0.2.0.md` for the complete
list.
