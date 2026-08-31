# Wave schedule

Recomputed 2026-08-31 after the debate review and after DO-NOW-1 through DO-NOW-4
landed, then recomputed again the same day when the Wave 2 Q&A added a hook to
`deterministic-task-dag`. **15 items, 90 h of effort, 7 waves, ~49 h wall clock.**

The `W##P##` prefix on each filename is this schedule. `W` is the wave — items in
one wave have no file conflict and no dependency on each other, so they can run in
parallel. `P` orders within a wave by effort, longest first, so the wave's critical
path starts first. Nothing else is implied by `P`.

## The schedule

| Wave | Items | Effort | Wall | Gate |
|---|---|---|---|---|
| **W01** | `skill-set-fidelity-refactor` (5 h) · `moe-tone-and-branding` (5 h) | 9 h | 5 h | — |
| **W02** | `deterministic-task-dag` (8 h) · `runtime-pruning` (5 h) | 13 h | 8 h | — |
| **W03** | `verification-split-and-firing-rate` (9 h) · `codegraph-context-layer` (8 h) | 17 h | 9 h | — |
| **W04** | `tc-standards-conformance` (5 h) · `gsd-core-skill-import` (4 h) | 9 h | 5 h | DO-NOW-5 |
| **W05** | `installer-hq-dx` (14 h) · `native-renderers` (9 h) | 23 h | 14 h | DO-NOW-5 |
| **W06** | `tiered-workflow-naming` (5 h) · `moe-bare-binary-dispatcher` (5 h) | 10 h | 5 h | DO-NOW-5 |
| **W07** | `contributing-flow-docs` (4 h) · `tc-governance-integration` (4 h) · `parallel-execution-option` (3 h) | 11 h | 4 h | DO-NOW-5 |

**W01–W03 are entirely ungated: 39 h of effort, ~22 h wall clock, startable now.**
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

## Wave 2 Q&A, and the recomputation it forced (2026-08-31)

Four decisions were taken before W02 starts. Three were `runtime-pruning`'s own open
questions; one was the re-price the debate review demanded of `deterministic-task-dag`.
Both docs now record them, and `runtime-pruning` is `decision_needed: no`.

| Decision | Answer |
|---|---|
| Grok — alive as Grok Build, so removal is policy not necessity | **remove anyway**; PARITY row must say "dropped, not discontinued" |
| Anyone on a Gemini Code Assist Standard/Enterprise seat | **no** — so it is a delete, not a deprecation |
| mint dogfood drops 8 hand-maintained manifests → 7 | **accept the loss**; assert 7 so it cannot drift to 6 |
| `deterministic-task-dag` shape: skill, script+prose, or a hook | **skill *and* hook** — the hook cannot silently miss, the skill keeps the loop in one file |

**The fourth answer changed the conflict graph, so the schedule was recomputed rather
than assumed.** `deterministic-task-dag` now touches `packages/core/hooks/hooks.json`,
which adds exactly one edge — to `tc-governance-integration`. Result:

- **Max clique is still 7**, and the same seven items. Adding an edge can only raise the
  bound, so this was the thing that had to be checked; `tc-governance-integration` does
  not conflict with enough of the clique to extend it to 8.
- **The committed schedule is still valid** — verified item-by-item against the new
  graph, not eyeballed. `deterministic-task-dag` is W02, `tc-governance-integration` is
  W07.
- **W02 now defines `hooks.json`'s shape.** Both later writers of that file —
  `verification-split-and-firing-rate` (W03) and `tc-governance-integration` (W07) —
  extend whatever W02 writes. Neither edge is in the frontmatter; that is the same
  undeclared-conflict gap catalogued below.
- Cost: `deterministic-task-dag` 6-8 h → 7-9 h. W02 effort 12 → 13 h, wall 7 → 8 h.

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

### Gate state at the last full measure (2026-08-31)

`pnpm build` 8/8 · `pnpm typecheck` 12/12 · `pnpm test` 17/17 · `pnpm mint:check` clean ·
`biome check . --max-diagnostics=2000` **0 errors** (down from the 560 baseline; 533
warnings and 356 infos remain and are deliberately out of scope). The lint baseline is
therefore no longer a standing exception, and any wave that raises it above 0 has
regressed something.

One known non-blocker: `packages/flight/ui/dist-static/static.html` is a committed build
artifact that regenerates dirty, because UI source changed without it being rebuilt
(last written `cd1045a`). Nothing gates on it. `native-renderers` (W05) is the item most
likely to want it fixed.

## Regenerating this

The schedule is derived, not hand-maintained. It is a function of every doc's
`depends_on`, `blocks`, `conflicts_with` and `touches`. Change any of those — or
add an item — and it has to be recomputed, because a wave that looks fine can be
made unsafe by one new `touches` entry. The solver is not committed; it reads the
frontmatter, unions declared conflicts with `touches` overlap, checks the
dependency graph for cycles, computes the max clique as a lower bound, then
searches randomized topological orders for a schedule that hits it.
