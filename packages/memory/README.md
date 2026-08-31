# @bubstack/moe-memory

Semantic recall over past sessions and journal entries. One MCP server.

Ships as the **`moe-memory`** plugin, generated into `/plugins/moe-memory` by `@bubstack/moe-mint`. Never hand-edit the generated manifest.

**Status:** scaffold. No code imported yet.

## Forked from

| Upstream repo | Pinned | License |
|---|---|---|
| `episodic-memory` | `1075769` | MIT |
| `private-journal-mcp` | `016953f` | MIT |

Snapshots are in `../.moe-references/` (gitignored). They are the spec — not upstream
`main`. See [PARITY.md](../../PARITY.md).

## Import notes

- The merge: both sources ship embeddings.ts, paths.ts, search.ts and types.ts. Reconcile into one embedding layer and one store with two record types.
- Sources embed with two releases of the same library — @xenova/transformers is the former name of @huggingface/transformers. Converge on @huggingface/transformers; @xenova is dropped.
- episodic-memory's four bins collapse into `moe-memory` with subcommands. private-journal-mcp's bin disappears.
- MCP server key: episodic-memory -> moe-memory. Breaking for existing configs.
- episodic-memory bundles its MCP entrypoint with esbuild and has a postinstall script. Both need review before they survive the import.
- Runtime deps arrive here: better-sqlite3, sqlite-vec, @huggingface/transformers, @modelcontextprotocol/sdk, zod, marked, proper-lockfile, @anthropic-ai/claude-agent-sdk.
