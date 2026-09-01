# Wave schedule

Recomputed 2026-08-31 after Zak challenged the previous schedule as
under-parallelised. He was right. **16 items, 4 waves, ~32 h wall clock.**

Effort is now **106.5 h**, up from 89.2 h — the Wave 1 Q&A tripled
`tc-standards-conformance` (Moe replaces the sibling fork `ai/claude-code-platform-plugin`:
4-5 h becomes 12-17 h) and grew `gsd-core-skill-import` (census plus an upstream-MIT
import: 3-5 h becomes 5-7 h), and a second-upstream census — `mattpocock-skills-import`
— added a new W02 item at 5 h. Wall clock is unchanged at 31.8 h: the new item sits
in W02, whose wall (8 h) is bound by `codegraph-context-layer` and
`deterministic-task-dag`, so 5 h of new work cost 0 h of calendar.

The `W##` prefix on each filename is this schedule's wave assignment, and it is
kept accurate. **`P##` is not.** It was originally "orders within a wave by effort,
longest first" and is now assigned once and left alone.

Two reasons. First, `P` carries no information the table below does not already
state — the table lists each wave's items in effort order explicitly, so re-deriving
`P` renames files to communicate something the reader can already see. Second, the
prefix has been re-waved **twice in one session**, and each rename invalidated every
cross-reference written against the old filename. One such citation went stale in
`packages/core/skill-tiers.yaml` and read as correct for hours, because
`W01P01 - parallel-execution-option.md` had genuinely been the right path when it
was written.

**Cite the slug, never the `W##P##` prefix.** The slug is stable; the prefix is a
schedule, and schedules move. Where `P` disagrees with the table, the table wins.

## The schedule

**Eleven of sixteen items have shipped** across three sessions (2026-08-31 →
2026-09-01). Two wave-1 iterate branches remain live, and two items sit
deferred after plan-verify blocked them.

| Wave | Items | Effort | Wall |
|---|---|---|---|
| **W01** | ~~`tc-standards-conformance`~~ (14.5 h) **merged `df4c14b`** · ~~`installer-hq-dx`~~ (13.5 h) **iterate `wave1/installer-hq-dx`** · ~~`native-renderers`~~ (8.5 h) **merged `65be5f7`** · ~~`verification-split-and-firing-rate`~~ (8.5 h) **merged `6e2f44d`** · ~~`gsd-core-skill-import`~~ (6 h) **skipped — precondition unmet** · ~~`runtime-pruning`~~ (5 h) **iterate `wave1/runtime-pruning`** · ~~`moe-tone-and-branding`~~ (4 h) **merged `de74bd0`** · ~~`skill-set-fidelity-refactor`~~ **merged** | 65.5 h | 14.5 h |
| **W02** | ~~`codegraph-context-layer`~~ (8 h) **blocked at plan-verify, deferred 2026-09-01** · ~~`deterministic-task-dag`~~ (8 h) **merged `f2bdc60`** · ~~`mattpocock-skills-import`~~ (5 h) **merged `3285c68`** · ~~`moe-bare-binary-dispatcher`~~ (4.5 h) **merged `a1c5f21`** · ~~`parallel-execution-option`~~ (2.5 h) **merged `b02c469`** | 28 h | 8 h |
| **W03** | ~~`tiered-workflow-naming`~~ (5 h) **merged `894f5c7`** · ~~`tc-governance-integration`~~ (3.75 h) **blocked at plan-verify, deferred 2026-09-01** | 8.75 h | 5 h |
| **W04** | ~~`contributing-flow-docs`~~ (4.25 h) **merged `1d38d97`** | 4.25 h | 4.25 h |

W01's original critical path was **co-held** by `tc-standards-conformance` and
`installer-hq-dx` — both are now in the iterate bucket, so the wave's actual
close date depends on when those two land.

### Current status
- **Shipped (11):** `skill-set-fidelity-refactor`, `moe-tone-and-branding`,
  `native-renderers`, `moe-bare-binary-dispatcher`, `contributing-flow-docs`,
  `deterministic-task-dag`, `parallel-execution-option`,
  `mattpocock-skills-import`, `tiered-workflow-naming`,
  `verification-split-and-firing-rate` (`6e2f44d`),
  `tc-standards-conformance` (`df4c14b`).
- **Live iterate branches (2):** `wave1/installer-hq-dx`,
  `wave1/runtime-pruning`. Both carry close-plans in
  `.planning/close-plan-status.md` marked `needs-revision` — installer-hq-dx
  has a real bin/test dual-runner collision to disambiguate, runtime-pruning
  needs prose citations rewritten.
- **Deferred (2):** `codegraph-context-layer` (W02),
  `tc-governance-integration` (W03). Both hit the same plan-verify pattern
  (test-assertion-not-updated for a new hook or manifest addition). Punch
  lists in their reports' `## Blocked` sections.
- **Skipped correctly (1):** `gsd-core-skill-import` halted on the missing
  `.moe-references/` precondition exactly as the plan-verify pass predicted.
  Branch and worktree removed.

### Merge highlights
Two rollbacks fired during wave-merge, both from the tier-vocabulary guard
`tiered-workflow-naming` added — `sequencing-plans/SKILL.md`,
`codebase-design/SKILL.md`, and `writing-skills/references/skill-typography.md`
each use "tier" in senses that predate the workflow-depth rename (plugin
tiers, architectural tiers, hierarchical levels). Each was whitelisted rather
than reworded; a fourth addition should trigger reconsidering the rule's shape.

The two close-execute merges on 2026-09-01 were driven by a new workflow
(`wave-close-execute`) that rebases the aging branch onto current main,
resolves conflicts per a pre-authored close-plan, regenerates `/plugins/`,
and re-runs gates. `verification-split-and-firing-rate` landed with a
collateral fix for two pre-existing reds on main introduced by `f2bdc60`
(TS2339 on `metadata.test.ts` at the SessionStart matcher test, and a biome
one-liner formatter on `hasFallback`) — the fix agent added `matcher?: string`
to the hooks.json type union and reformatted `hasFallback`, unblocking full-
repo `pnpm typecheck` and `pnpm lint`. `tc-standards-conformance` then
merged clean; git's 3-way merge resolved the shared
`verification-before-completion/SKILL.md` and its two plugin mirrors on both
sides. Neither branch needed a wave-merge rollback.

## Why the previous schedule was wrong

It built its conflict graph as `declared conflicts_with ∪ overlap in touches`,
then treated every edge as "these two cannot share a wave."

**That makes *annoying* and *dangerous* the same thing, and they are not.** Two
items writing the same file produce a merge conflict: git reports it, a human
resolves it in minutes, and the test suite catches a resolution that drops
something. That is a cost, not a hazard. Serialising to avoid it bought nothing
and spent 18 h of wall clock.

The old file even said the only route below 7 waves was "splitting one of the
seven clique items so it stops touching `metadata.test.ts` or `skill-tiers.yaml`."
That named the right lever and pulled the wrong one. The lever was dropping the
assumption, not splitting the work.

It also contradicted a decision recorded the same day: `parallel-execution-option`
was approved as parallelism gated on worktree isolation, while the backlog was
serialising on exactly the file overlap that worktrees plus a merge step handle.

## The real bounds

- **Longest dependency chain: 3.** The hard floor; adding people cannot beat it.
  `skill-set-fidelity-refactor` → `parallel-execution-option` →
  `tiered-workflow-naming` → `contributing-flow-docs`.
- **One genuine semantic conflict adds the 4th wave.**

Dependency edges come from `depends_on` **and** from inverted `blocks`, which is
not always mirrored: `gsd-core-skill-import` blocks `tiered-workflow-naming`, and
`tiered-workflow-naming` blocks `contributing-flow-docs`, neither of which appears
in the blocked item's own `depends_on`. A solver reading only `depends_on`
produces a schedule that is too short and wrong.

## The one conflict that is not merely annoying

`parallel-execution-option` rewrites the parallel-implementation ban at
`subagent-driven-development/SKILL.md:282` and its Red Flag twin at
`implementing-tasks/SKILL.md:101`. `tiered-workflow-naming` supersedes the
work-shape vocabulary **in the same prose**. Two semantic rewrites of the same
paragraphs — and **no test reads prose**, so a clean textual merge can yield a
skill asserting both the old rule and the new one, with nothing red.

So `tiered-workflow-naming` depends on `parallel-execution-option`. One edge, not
a wave structure. That edge is the entire difference between 3 waves and 4.

## Contended files, and which fail loudly

Compression means accepting contention. Here is all of it, classified by what
happens when a resolution goes wrong.

**Guarded — a bad resolution turns the suite red:**

| File | The guard |
|---|---|
| `packages/core/test/metadata.test.ts` | self-guarding: "accounts for every skill on disk in exactly one of the two maps", plus `LEAN_TIER_COUNT` |
| `packages/core/skill-tiers.yaml` | every skill directory needs an entry in exactly one map; lean membership pinned |
| `.claude-plugin/marketplace.json` | `checkMarketplace()` asserts registry and marketplace agree in **both** directions |
| `packages/core/skills/_shared/` | every relative markdown link inside an owned file must resolve |
| `.gitattributes` | `git ls-files --eol` surfaces any CRLF that crept in |

**Unguarded but inconsequential** — prose and config with no runtime effect, and
broken CI is loud on the first pipeline: `PARITY.md`, `ARCHITECTURE.md`,
`packages/core/README.md`, `README.md`, `.gitignore`, `.gitlab-ci.yml`.

Their one silent failure mode is a stale line-numbered citation surviving a
resolution: it resolves to real prose and reads as verified. The mitigation is the
cite-by-name rule below, not serialisation.

## Preconditions, which were not met until 2026-08-31

**Parallel waves are only as safe as the suite that verifies the merges.** Three
holes in that suite were found the same day this schedule was written:

- **`dogfood.test.ts` silently skipped in every worktree** (fixed, `58c3efd`). It
  resolved the pinned upstream snapshot relative to its own file, so from
  `.claude/worktrees/<id>/` it found nothing and `describe.skipIf` took out 8
  tests — reported as skipped, not failed. Every wave runs in a worktree, so the
  assertion protecting upstream parity was off in exactly the trees where work
  happens.
- **Turbo replayed a foreign cached test result onto main** (fixed, `b50d66b`).
  `dogfood.test.ts` reads state outside the repo, so the task is not a pure
  function of its inputs and a content-identical tree elsewhere poisoned the
  cache. `pnpm test` reported green with the parity check never having run.
- **`packages/core` is not typechecked at all** — OPEN. Its `typecheck` script is
  `echo 'content package: no TypeScript'`, it has no tsconfig, and the root
  references do not name it. So `metadata.test.ts`, 690 lines carrying every
  fidelity assertion, gets no static check; only vitest executes it. This is why
  that file's grep-based gates are load-bearing rather than cosmetic, and why the
  merged refactor added a guard against a mistyped spread key — a typo producing
  `undefined` is exactly what a typechecker would catch and nothing here does.

The first two were the same defect in different layers: **a skip reading as a
pass.** Any future compression should re-ask that question first — does the suite
actually run, in the tree where the work happens?

## Integration protocol

From `parallel-execution-option`, derived from an incident on 2026-08-31 in which
three agents disputed one citation and reached three different answers, each
running a correct command against a different tree:

- A worker's findings are scoped to the tree it read; its report names the SHA.
- Reviewers compare SHAs before comparing claims.
- Cross-boundary citations use a test name, symbol or quoted sentence — never a
  line number.
- **A wave's workers branch from one recorded base.** That clause alone would have
  prevented the incident.

Read `packages/core/**` from the package's tree; read `PARITY.md` and
`ARCHITECTURE.md` from main, because that is where they live.

## Evidence that this works

W01's first two items ran concurrently in separate worktrees and both touched
`packages/core/` and both READMEs — the old model called that a same-wave pair and
it was right. Merging produced **two conflicts, resolved in about two minutes**,
gates green after. Separately, five backlog agents edited different documents in
one working tree simultaneously with zero conflicts.

What did go wrong was not a write conflict. It was agents reasoning from stale
trees — which the integration protocol addresses and serialisation would not have.

## Regenerating this

Derived, not hand-maintained: a function of every doc's `depends_on`, inverted
`blocks`, and the single semantic edge recorded above. **`touches` overlap is
deliberately not an input** — it is a merge cost, not a scheduling constraint.

The solver is not committed. It reads the frontmatter, unions `depends_on` with
inverted `blocks`, checks for cycles, and assigns each item to the earliest wave
after all its dependencies. Any new *semantic* conflict — two items rewriting the
same prose to different ends — is added by hand as a dependency with its reason
stated, the way the one above is.
