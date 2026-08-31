# @bubstack/moe-glass

Zero-dependency Chrome DevTools Protocol client. Skill mode plus MCP mode.

Ships as the **`moe-glass`** plugin, generated into `/plugins/moe-glass` by `@bubstack/moe-mint`. Never hand-edit the generated manifest.

**Status:** scaffold. No code imported yet.

## Forked from

| Upstream repo | Pinned | License |
|---|---|---|
| `superpowers-chrome` | `782358e` | MIT |

Snapshots are in `.references/` (gitignored). They are the spec — not upstream
`main`. See [PARITY.md](../../PARITY.md).

## Import notes

- Zero runtime dependencies upstream. Keep it that way.
- MCP server key: chrome -> moe-glass. Breaking for existing configs, and `chrome` was a bad key to occupy anyway.
- bin superpowers-chrome-mcp -> moe-glass.
- Has a nested mcp/ directory with its own npm install in the build script, plus seven loose test-*.cjs files at the repo root. Flatten both on import.
- Import early with crew: 50 files, self-contained, and it proves the MCP-key rename before memory does it with a database attached.
