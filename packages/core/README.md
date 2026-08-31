# @bubstack/moe-core

The house skills: TDD, debugging, collaboration, iterative methodology, writing, plugin authoring, and the stop-hook.

Ships as the **`moe-core`** plugin, generated into `/plugins/moe-core` by `@bubstack/moe-mint`. Never hand-edit the generated manifest.

**Status:** scaffold. No code imported yet.

## Forked from

| Upstream repo | Pinned | License |
|---|---|---|
| `superpowers` | `b36e082` | MIT |
| `superpowers-lab` | `51111f7` | MIT |
| `iterative-development` | `c05889a` | Apache-2.0 |
| `the-elements-of-style` | `05fc4f0` | Public domain |
| `superpowers-developing-for-claude-code` | `74afe93` | MIT |
| `double-shot-latte` | `dfe7567` | MIT |

Snapshots are in `../.moe-references/` (gitignored). They are the spec — not upstream
`main`. See [PARITY.md](../../PARITY.md).

## Import notes

- 28 skills land here. Namespace collisions between the six sources must be resolved on import — check skill frontmatter `name:` before merging directories.
- double-shot-latte contributes hooks only, no skills.
- the-elements-of-style arrives with its own package.json, plugin.json, gemini-extension.json and GEMINI.md for a single skill. All four are dropped; the skill is one directory here.
- Upstream superpowers hand-maintains Claude Code, Gemini and agent manifests in parallel. None are imported — @bubstack/moe-mint generates them.
