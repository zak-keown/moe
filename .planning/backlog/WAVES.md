# Wave schedule

Recomputed 2026-08-31, after the debate review and after DO-NOW-1 through
DO-NOW-4 landed. **15 items, 89 h of effort, 7 waves, ~48 h wall clock.**

The `W##P##` prefix on each filename is this schedule. `W` is the wave — items in
one wave have no file conflict and no dependency on each other, so they can run in
parallel. `P` orders within a wave by effort, longest first, so the wave's critical
path starts first. Nothing else is implied by `P`.

## The schedule

| Wave | Items | Effort | Wall | Gate |
|---|---|---|---|---|
| **W01** | `skill-set-fidelity-refactor` (5 h) · `moe-tone-and-branding` (5 h) | 9 h | 5 h | — |
| **W02** | `deterministic-task-dag` (7 h) · `runtime-pruning` (5 h) | 12 h | 7 h | — |
| **W03** | `verification-split-and-firing-rate` (9 h) · `codegraph-context-layer` (8 h) | 17 h | 9 h | — |
| **W04** | `tc-standards-conformance` (5 h) · `gsd-core-skill-import` (4 h) | 9 h | 5 h | DO-NOW-5 |
| **W05** | `installer-hq-dx` (14 h) · `native-renderers` (9 h) | 23 h | 14 h | DO-NOW-5 |
| **W06** | `tiered-workflow-naming` (5 h) · `moe-bare-binary-dispatcher` (5 h) | 10 h | 5 h | DO-NOW-5 |
| **W07** | `contributing-flow-docs` (4 h) · `tc-governance-integration` (4 h) · `parallel-execution-option` (3 h) | 11 h | 4 h | DO-NOW-5 |

**W01–W03 are entirely ungated: 38 h of effort, ~21 h wall clock, startable now.**
Every item that needs the GitLab remote is in W04 or later. That is deliberate —
an earlier 7-wave solution came in 2 h cheaper on wall clock but put a
DO-NOW-5-gated 14 h item in wave 2, which would have stalled the whole schedule
behind a push. The 2 h was worth spending.

## Seven waves is provably minimal

Not a heuristic result. Two independent lower bounds:

- **The conflict clique is 7.** These seven items *all* conflict with each other
  pairwise, so no two can share a wave and 7 waves is the floor:
  `deterministic-task-dag`, `gsd-core-skill-import`, `native-renderers`,
  `parallel-execution-option`, `skill-set-fidelity-refactor`,
  `tiered-workflow-naming`, `verification-split-and-firing-rate`.
  They collide on `packages/core/skills/`, `packages/core/skill-tiers.yaml` and
  `packages/core/test/metadata.test.ts` — the three files nearly every skill-level
  change has to touch.
- **The longest dependency chain is 3.** Weaker, so it does not bind:
  `skill-set-fidelity-refactor` → `tiered-workflow-naming` /
  `codegraph-context-layer` → `tc-governance-integration`.

The dependency graph is acyclic. A greedy pass gives 9 waves; 60 000 randomized
topological orders find 7, which equals the clique bound, so no reordering can do
better. **Adding people does not compress this below 7 waves.** The only thing
that would is splitting one of the seven clique items so it stops touching
`metadata.test.ts` or `skill-tiers.yaml`.

## How conflicts were computed, and a gap worth knowing about

A wave is only safe if no two members write the same file. So the conflict graph
used here is:

```
declared conflicts_with (symmetrized)  ∪  actual overlap in `touches`
```

**The declared lists alone would have produced a broken schedule.** 23 pairs of
items overlap in `touches` without declaring a conflict, and 30 conflicts are
declared in one direction only. The most consequential undeclared pairs:

| Pair | Collides on |
|---|---|
| `tc-governance-integration` + `verification-split-and-firing-rate` | `packages/core/hooks/hooks.json` — both add a hook |
| `installer-hq-dx` + `verification-split-and-firing-rate` | `.gitignore`, `.gitattributes` |
| `tc-standards-conformance` + `deterministic-task-dag` | four skill directories under `packages/core/skills/` |
| `runtime-pruning` + `gsd-core-skill-import` | `ARCHITECTURE.md`, `PARITY.md` |
| `gsd-core-skill-import` + `verification-split-and-firing-rate` | `packages/core/test/metadata.test.ts` |
| `parallel-execution-option` + `codegraph-context-layer` | `packages/core/skill-tiers.yaml` |

The hooks.json pair is the one the debate review itself called out in prose —
"the two items both write that file and so cannot share a wave" — without the
frontmatter recording it. The frontmatter was left as the author wrote it rather
than silently edited; this file is the record that the schedule was computed from
the union, not from the declarations.

## Claims that DO-NOW-3 invalidated

These docs were researched before `/plugins/` existed. Their conclusions stand;
these specific factual claims do not. Read them as "was true when written".

| Doc | Claim | Now |
|---|---|---|
| `W03P02 - codegraph-context-layer.md:222` | root `pnpm mint` is `echo … && exit 1` | `pnpm mint` builds 6 plugins |
| `W05P01 - installer-hq-dx.md:49` | "`pnpm mint` is a deliberate `exit 1` (`package.json:15`). DO-NOW-3 creates those" | done |
| `W07P01 - contributing-flow-docs.md:57,123` | mint "does not work yet"; `/plugins/` is gitignored at `.gitignore:18` | works; `/plugins/` is tracked, and that `.gitignore` line is gone |
| `W02P02 - runtime-pruning.md:188` | "DO-NOW-3 must decide which adapters to emit" | decided: all **11** emit |
| `W06P01 - tiered-workflow-naming.md:309` | "after DO-NOW-3 proves the mint pipeline" | proven |
| six docs | `packages/core/moe-mint.yaml:NN` | moved to `packages/core/mint/moe-core.yaml`; a second config `mint/moe-everything.yaml` now exists, so line numbers will not match |

Only one was a machine-checkable reference and it is fixed:
`codegraph-context-layer`'s `touches` entry for `packages/core/moe-mint.yaml` now
names `packages/core/mint/moe-core.yaml`. The rest are prose with line numbers I
did not rewrite, because guessing at a line number is worse than a dated claim.

`W07P01 - contributing-flow-docs.md` also splits its estimate "2.5–3.5 h now,
~1 h after DO-NOW-3". That split no longer exists — it is one pass of ~4 h.

## DO-NOW status

| | |
|---|---|
| DO-NOW-1 — integrate Wave B/C | **done**, `5428a76` |
| DO-NOW-2 — the lean/full tiering | **done**, `0b1571d` |
| DO-NOW-3 — mint → `/plugins/` | **done**, `d9dceda` |
| DO-NOW-4 — ARCHITECTURE §5 flight census | **done**, `5187aee` |
| DO-NOW-5 — GitLab remote + first push | **open**, blocked on confirming the project path. Gates W04–W07. |

## Regenerating this

The schedule is derived, not hand-maintained. It is a function of every doc's
`depends_on`, `blocks`, `conflicts_with` and `touches`. Change any of those — or
add an item — and it has to be recomputed, because a wave that looks fine can be
made unsafe by one new `touches` entry. The solver is not committed; it reads the
frontmatter, unions declared conflicts with `touches` overlap, checks the
dependency graph for cycles, computes the max clique as a lower bound, then
searches randomized topological orders for a schedule that hits it.
