# @bubstack/moe-mint

Generate native plugin manifests for every harness from one config. The monorepo's plugin build step.

Not a plugin. A library/CLI consumed by other packages.

**Status:** scaffold. No code imported yet.

## Forked from

| Upstream repo | Pinned | License |
|---|---|---|
| `everyharness` | `4f7c5e2` | MIT |
| `everyharness-container` | `2467bd7` | MIT |

Snapshots are in `.references/` (gitignored). They are the spec — not upstream
`main`. See [PARITY.md](../../PARITY.md).

## Import notes

- This package is what makes a 28-skill core acceptable: it decouples source layout from install layout.
- Reads core and backstory as data and writes /plugins/. It is the only thing that writes there.
- Supports Claude Code, Codex, Gemini CLI, Cursor, Copilot CLI, OpenCode, Pi, Kimi Code, Hermes, Devin CLI, Factory Droid, Grok Build CLI and Antigravity.
- Upstream has one real consumer (the-elements-of-style) and one fixture. Adoption across all content packages is the work, not new code.
- everyharness-container's Dockerfile and bin move to infra/container, not here.
- bin everyharness -> moe-mint.
