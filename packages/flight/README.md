# @bubstack/moe-flight

Drive web, CLI or TUI targets through acceptance criteria and grade them. Also drives nine agent CLIs side by side.

Not a plugin. A library/CLI consumed by other packages.

**Status:** scaffold. No code imported yet.

## Forked from

| Upstream repo | Pinned | License |
|---|---|---|
| `gauntlet` | `91b6f7e` | Apache-2.0 |
| `superpowers-evals` | `114f725` | UNLICENSED |

Snapshots are in `../.moe-references/` (gitignored). They are the spec — not upstream
`main`. See [PARITY.md](../../PARITY.md).

## Import notes

- IMPORT LAST. 1072 of the 1632 files needing rebrand edits are here, and the license question is unresolved — see PARITY.md#license-exposure.
- superpowers-evals ships no LICENSE and no package.json license field. It does not enter this package until that is settled.
- Two frontends, and they are not duplicates: gauntlet/ui is a React + Vite SPA, @quorum/dashboard is a zod-only server-side reporter. Both survive, as flight/ui and flight/dashboard.
- quorum's nested packages/dashboard workspace flattens to packages/flight/dashboard so it cannot collide with the outer workspace.
- Arrives on bun (bun test, bun build --compile, bun.lock). Converges to pnpm + vitest + tsc. The bun lockfiles do not survive.
- bins gauntlet, quorum and evals-appliance collapse into `moe-flight` subcommands.
- Confirmed dependency on @bubstack/moe-tab, currently @primeradianthq/obol@^0.9.0 from npm. Becomes workspace:*.
- Candidate edges to glass (CDP for the web adapter) and crew (tmux for the tui adapter) — confirm by import census before adding either to dependencies.
