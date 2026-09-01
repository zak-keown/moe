# Moe Memory

Memory provides semantic recall over coding-agent conversations and deliberate
journal entries. One CLI owns indexing, search, diagnostics, and the MCP server.

## CLI

```sh
moe-memory sync
moe-memory index --cleanup
moe-memory search "authentication decision"
moe-memory journal search "release lesson"
moe-memory stats
moe-memory mcp-server
```

Run `moe-memory --help` or `moe-memory <command> --help` for details.

## Harness integration

The Claude Code and Codex plugin paths feed the same index. Claude Code sessions
are read from its configured transcript directories; Codex sessions are read
from `~/.codex/sessions` unless `CODEX_HOME` selects another profile.

Data lives under the Moe memory directory selected by the platform, or under
`$MOE_DATA_DIR/memory` when `MOE_DATA_DIR` is set. Journal roots can be
overridden with `MOE_MEMORY_JOURNAL_PATH`.

## Layout

- `src/` — CLI commands, indexing, search, MCP, and storage.
- `src/journal/` — journal parsing and indexing.
- `hooks/` — sync integration.
- `skills/`, `agents/`, `prompts/` — agent-facing surfaces.
- `mint/` — plugin generation configuration.

## Development

```sh
pnpm --filter @bubstack/moe-memory build
pnpm --filter @bubstack/moe-memory typecheck
pnpm --filter @bubstack/moe-memory test
pnpm --filter @bubstack/moe-memory test:model
```

`test:model` downloads and runs an embedding model and is intentionally outside
the normal Node-only gate.
