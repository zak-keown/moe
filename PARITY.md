# Parity inventory

The fork's ledger. Every upstream repository, the exact revision forked, its
license, and where it lands. With no reachable upstream author for this fork,
this file is how a pre-fork decision gets reconstructed: find the artifact, not
the person.

**Snapshots are the spec, not upstream HEAD.** The 19 repositories live in
`.references/` (gitignored). They are shallow clones — one commit each, so there
is no upstream history to preserve and no `git subtree` or `filter-repo` import
to attempt. Do not consult upstream `main`: parity against a moving target is
unfalsifiable.

Regenerate the pinned column with:

```sh
cd .references && for r in */; do n=${r%/}
  printf '| `%s` | %s | %s |\n' "$n" "$(git -C $n rev-parse --short HEAD)" "$(git -C $n log -1 --format=%cs)"
done
```

## Map

| Upstream repo | Pinned | Date | License | → lands as |
|---|---|---|---|---|
| `superpowers` | `b36e082` | 2026-08-12 | MIT | `@moe/core` |
| `superpowers-lab` | `51111f7` | 2026-06-01 | MIT | `@moe/core` |
| `superpowers-developing-for-claude-code` | `74afe93` | 2025-12-03 | MIT | `@moe/core` |
| `iterative-development` | `c05889a` | 2026-06-06 | Apache-2.0 | `@moe/core` |
| `the-elements-of-style` | `05fc4f0` | 2026-08-12 | Public domain | `@moe/core` |
| `double-shot-latte` | `dfe7567` | 2026-02-25 | MIT | `@moe/core` (hooks) |
| `greenfield` | `6e6d4b4` | 2026-08-06 | Apache-2.0 | `@moe/backstory` |
| `episodic-memory` | `1075769` | 2026-05-21 | MIT | `@moe/memory` |
| `private-journal-mcp` | `016953f` | 2026-08-11 | MIT | `@moe/memory` |
| `gauntlet` | `91b6f7e` | 2026-08-06 | Apache-2.0 | `@moe/flight` |
| `superpowers-evals` | `114f725` | 2026-08-25 | **none — see below** | `@moe/flight` |
| `everyharness` | `4f7c5e2` | 2026-08-15 | MIT | `@moe/mint` |
| `everyharness-container` | `2467bd7` | 2026-08-11 | MIT | `infra/container` |
| `claude-session-driver` | `d97d1eb` | 2026-06-14 | MIT | `@moe/crew` |
| `superpowers-chrome` | `782358e` | 2026-08-07 | MIT | `@moe/glass` |
| `obol` | `28e3dba` | 2026-08-06 | Apache-2.0 | `@moe/tab` |
| `smevals` | `0c28dc6` | 2026-08-11 | MIT | `py/proof` |
| `superpowers-marketplace` | `1ab7b8e` | 2026-08-12 | MIT | `.claude-plugin/marketplace.json` |
| `prime-radiant-marketplace` | `49a45ef` | 2026-06-06 | Apache-2.0 | `.claude-plugin/marketplace.json` |

### Excluded

| Upstream repo | Pinned | Why |
|---|---|---|
| `superpowers-autoresearch` | `6e6f33f` | 16 MB of research campaigns, logs, raw captures and reports. Data, not code, and no LICENSE. Kept as a reference snapshot only. |

## License exposure

Everything forked is MIT, Apache-2.0, or public domain, and all three require
retaining the notices — so upstream `LICENSE` files travel with the code they
cover, under each package, and `NOTICE` at the root carries attribution. Apache-2.0
also requires stating that files were changed; the rebrand does change them.

**One unresolved item.** `superpowers-evals` ships **no `LICENSE` file and no
`package.json` license field**. No grant of rights has been located. It is the
single largest body of forked material — 796 files, 17 MB, roughly half the
rebrand surface — and it lands in `@moe/flight` alongside Apache-2.0 `gauntlet`.

Absent a license, the default is all rights reserved. Options, in order of
preference:

1. Ask Prime Radiant to state a license, or confirm the omission is an oversight.
2. Import `gauntlet` only, and rebuild quorum's agent-CLI runner from its
   documented behavior rather than its source.
3. Proceed internally and do not redistribute `@moe/flight` outside the team.

This does not block the other 8 packages. It blocks publishing `flight`.

## Rebrand footprint

19 in-scope repositories, 2964 files. **1632 of them (55%) contain at least one
brand token** — `superpowers`, `gauntlet`, `quorum`, `obol`, `greenfield`,
`everyharness`, `elements-of-style`, `episodic-memory`, `private-journal`,
`double-shot-latte`, `claude-session-driver`, `smevals`, `obra`, `prime-radiant`.

| Upstream repo | Files to touch |
|---|---|
| `superpowers-evals` | 796 |
| `gauntlet` | 276 |
| `superpowers` | 125 |
| `obol` | 95 |
| `everyharness` | 75 |
| `episodic-memory` | 59 |
| `superpowers-chrome` | 50 |
| `the-elements-of-style` | 31 |
| `smevals` | 23 |
| `iterative-development` | 22 |
| `claude-session-driver` | 22 |
| `greenfield` | 15 |
| `private-journal-mcp` | 14 |
| `superpowers-developing-for-claude-code` | 9 |
| `double-shot-latte` | 7 |
| `prime-radiant-marketplace` | 5 |
| `superpowers-marketplace` | 3 |
| `everyharness-container` | 3 |
| `superpowers-lab` | 2 |

Half the work is one package. Import `flight` last, once the license question is
settled and the rename conventions have been proven on smaller packages.

### Identifiers that change

Not text substitutions — each is a breaking interface change, and each needs a
deliberate mapping rather than a regex:

| Kind | Upstream | Moe |
|---|---|---|
| MCP server key | `episodic-memory` | `moe-memory` |
| MCP server key | `chrome` | `moe-glass` |
| bin | `episodic-memory`, `-index`, `-search`, `-mcp-server` | `moe-memory` + subcommands |
| bin | `private-journal-mcp` | folded into `moe-memory` |
| bin | `gauntlet` | `moe-flight` |
| bin | `quorum`, `evals-appliance` | `moe-flight` subcommands |
| bin | `everyharness` | `moe-mint` |
| bin | `obol` | `moe-tab` |
| bin | `superpowers-chrome-mcp` | `moe-glass` |
| npm package | `@primeradianthq/obol` | `@moe/tab` (`workspace:*`) |
| PyPI package | `smevals` | `moe-proof` |

Watch for these beyond source: `${CLAUDE_PLUGIN_ROOT}` paths in plugin manifests,
skill frontmatter `name:` fields, hook script paths, GitHub URLs in docs, and
`catalog-info.yaml` service identifiers.
