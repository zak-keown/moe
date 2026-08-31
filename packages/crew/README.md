# @bubstack/moe-crew

Launch, control and monitor worker Claude sessions over tmux.

Ships as the **`moe-crew`** plugin, generated into `/plugins/moe-crew` by `@bubstack/moe-mint`. Never hand-edit the generated manifest.

**Status:** scaffold. No code imported yet.

## Forked from

| Upstream repo | Pinned | License |
|---|---|---|
| `claude-session-driver` | `d97d1eb` | MIT |

Snapshots are in `../.moe-references/` (gitignored). They are the spec — not upstream
`main`. See [PARITY.md](../../PARITY.md).

## Import notes

- Already pnpm, tsup, vitest and biome — the closest upstream package to the target toolchain. Import it early to prove the rename conventions.
- Carries a lefthook prepare script and a dist:check script that diffs committed dist/. Neither survives: dist/ is gitignored here and hooks are root-level.
- Pins @earendil-works/pi-coding-agent at an exact version in devDependencies — check whether that is still needed.
