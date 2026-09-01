# Wave schedule

Recomputed 2026-08-31 after Zak challenged the previous schedule as
under-parallelised. He was right. **14 items, 4 waves, ~31 h wall clock.**

**CLOSED 2026-09-01. All fourteen shipped.** What follows is kept as the record of
how it was scheduled and what the schedule got wrong, because both were argued
for on this page and the arguments are the reusable part. The tables are updated
to what happened; the analysis below them is as written.

Effort is **88.25 h**. The Wave 1 Q&A grew `gsd-core-skill-import` (census plus
an upstream-MIT import: 3-5 h becomes 5-7 h), and a second-upstream census —
`mattpocock-skills-import` — added a new W02 item at 5 h. Wall clock stayed at
30.8 h: the new item sits in W02, whose wall (8 h) is bound by
`codegraph-context-layer` and `deterministic-task-dag`, so 5 h of new work cost
0 h of calendar.

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

**All fourteen shipped**, across four sessions (2026-08-31 → 2026-09-01). Ten
landed in the wave runs; the last four were closed one at a time afterwards —
the two aging iterate branches, the deferred item, and the one skipped on a
precondition.

| Wave | Items | Effort | Wall |
|---|---|---|---|
| **W01** | ~~`installer-hq-dx`~~ (13.5 h) `d288ae7` · ~~`native-renderers`~~ (8.5 h) `65be5f7` · ~~`verification-split-and-firing-rate`~~ (8.5 h) `6e2f44d` · ~~`gsd-core-skill-import`~~ (6 h) `aad2aee` · ~~`runtime-pruning`~~ (5 h) `1e40523` · ~~`moe-tone-and-branding`~~ (4 h) `de74bd0` · ~~`skill-set-fidelity-refactor`~~ `cf37b80` | 51 h | 13.5 h |
| **W02** | ~~`codegraph-context-layer`~~ (8 h) `1a03438` · ~~`deterministic-task-dag`~~ (8 h) `f2bdc60` · ~~`mattpocock-skills-import`~~ (5 h) `3285c68` · ~~`moe-bare-binary-dispatcher`~~ (4.5 h) `a1c5f21` · ~~`parallel-execution-option`~~ (2.5 h) `b02c469` | 28 h | 8 h |
| **W03** | ~~`tiered-workflow-naming`~~ (5 h) `894f5c7` | 5 h | 5 h |
| **W04** | ~~`contributing-flow-docs`~~ (4.25 h) `1d38d97` | 4.25 h | 4.25 h |

W01's critical path was `installer-hq-dx` (13.5 h). It ended up in the iterate
bucket rather than closing on schedule, so W01 was the last wave to finish — the
critical path predicted which item would slip, but not that it would slip for a
reason the schedule never modelled (a close-plan needing a design decision).

### Final status

**Shipped: 14 of 14.** No live branches, no deferred items, no open decisions.

The ten that landed in the wave runs are in the table above. The four that
needed individual closes, and what each actually turned on:

| Item | Was | What closed it |
|---|---|---|
| `runtime-pruning` | iterate | Prose only — line-number citations rewritten as quoted phrases. Rebased with **zero** conflicts against a close-plan predicting four. |
| `installer-hq-dx` | iterate | A real design decision: two test runners over one directory. Zak chose vitest; the node:test suite was ported. |
| `codegraph-context-layer` | deferred | Gate ordering — `pnpm mint` had to run **before** core's tests. Its other blocker was network, and CodeGraph reconnected. |
| `gsd-core-skill-import` | skipped | Precondition met — `open-gsd/gsd-core` is public MIT and was cloned. |

**One of those four closed for a reason the deferral was wrong about**, which is
the most useful thing on this page. `gsd-core-skill-import`'s plan said one
reference's precondition (SBFL needs per-test coverage) should gate the whole
item — but that reference degrades by design, so the precondition never gated
the other nine. **A deferral is a claim with a shelf life.** Re-read the blocker
before re-planning the work.

### Merge highlights
Two rollbacks fired during wave-merge, both from the tier-vocabulary guard
`tiered-workflow-naming` added — `sequencing-plans/SKILL.md`,
`codebase-design/SKILL.md`, and `writing-skills/references/skill-typography.md`
each use "tier" in senses that predate the workflow-depth rename (plugin
tiers, architectural tiers, hierarchical levels). Each was whitelisted rather
than reworded; a fourth addition should trigger reconsidering the rule's shape.

**That threshold is reached.** The guard has since fired on three more
legitimate non-workflow uses: `retrieving-context/SKILL.md` (the `hard`/`soft`
probe fields) and three imported `debugger-*.md` files saying `npm-tier` for an
npm-sized suite. All four were **reworded rather than whitelisted**, so the
whitelist is still at three — but six false positives against zero true ones is
the signal this note asked for. The rule bans the word; what it means to ban is
the word *as a workflow-depth name*.

The close-execute merge on 2026-09-01 was driven by a new workflow
(`wave-close-execute`) that rebases the aging branch onto current main,
resolves conflicts per a pre-authored close-plan, regenerates `/plugins/`,
and re-runs gates. `verification-split-and-firing-rate` landed with a
collateral fix for two pre-existing reds on main introduced by `f2bdc60`
(TS2339 on `metadata.test.ts` at the SessionStart matcher test, and a biome
one-liner formatter on `hasFallback`) — the fix agent added `matcher?: string`
to the hooks.json type union and reformatted `hasFallback`, unblocking full-
repo `pnpm typecheck` and `pnpm lint`. That merge needed no wave-merge
rollback.

The four individual closes needed no rollback either, but three of them landed
a fix for something the *previous* merge had broken or missed:
`runtime-pruning`'s own 11→10 adapter recount had missed four of six mint yamls;
`installer-hq-dx`'s chaining of `bin:test` into root `test` turned a latent
worktree bug into a live one; and `gsd-core-skill-import` tripped the licence
assertion, which is an exact file list and caught the missing sixth LICENSE
before any gate did. **Each was found by the next item touching the same
files** — an argument for closing related work in sequence rather than in
parallel, once the wave itself is done.

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

## Preconditions, and the gate holes that kept turning up

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
- **`packages/core` was not typechecked at all** (fixed, `6b0e28c`). Its
  `typecheck` script was literally `echo 'content package: no TypeScript'`, which
  was false — `test/` holds the assertions the whole fidelity model rests on, and
  only vitest executed them. It now has `tsconfig.tests.json` and is one of the
  12 typecheck tasks. This is why
  merged refactor added a guard against a mistyped spread key — a typo producing
  `undefined` is exactly what a typechecker would catch and nothing here does.

The first two were the same defect in different layers: **a skip reading as a
pass.** Any future compression should re-ask that question first — does the suite
actually run, in the tree where the work happens?

**Two more of the same shape surfaced on 2026-09-01, after the waves were done.**
The question keeps paying:

- **`.gitlab-ci.yml` was never parsed by any local gate** (fixed, `ci-config.test.ts`).
  A `script` entry containing an unquoted `": "` parses as a single-key MAP, and
  GitLab requires a string — a map there fails pipeline **creation** for the whole
  file, taking every job with it. It reached a merge candidate with four local
  gates green because none of them read the file. An adversarial review caught it;
  the test is the mechanical replacement for that review happening to look.
- **`pnpm bin:test` ran every live worktree's copy of the suite** (fixed, `d288ae7`).
  The script was `vitest run bin/test`, and that argument is a *filter pattern*,
  not a path — it also matched `.claude/worktrees/<id>/bin/test/`. With two
  worktrees open it ran 8 files and 132 tests instead of 2 and 33. Chaining
  `bin:test` into root `pnpm test` is what made it dangerous: a failure on an
  unrelated in-flight branch would have reddened main. Now `--dir bin/test`.

Four of the five are the same question with a different subject: **is the thing
that runs the check actually looking at the tree you think it is?** Worktrees,
turbo's cache, and a vitest path argument each answered no.

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

**Two bugs the solver had, recorded because they were both silent.** It dropped
`re.M`, so `^depends_on:` never matched and it produced 2 waves — impossible
against a chain of length 3, and it reported that as a result rather than an
error. And its effort parser read `"1.5-2 days (12-15 h)"` as 1.75 h by taking
the first number pair it found. A scheduler that returns a plausible wrong answer
is worse than one that crashes.

## What carries forward

This schedule's fourteen items are all shipped. Two things sit in the backlog
directory that this schedule never contained, and they are **not** waves 5 and 6
of it — the wave numbering in their filenames is filename convention only, per the
`P##` note at the top of this file:

- **`codebase-review-skills`** — two fork-authored skills for repo-wide review and
  TDD repair. In flight elsewhere as of 2026-09-01.
- **`cross-stack-tracing`** — Zak asked whether cross-repo trace capability could
  be built against CodeGraph alone rather than moedex, and it mostly can:
  `HTTP_CALLS` carries `source_repo`/`target_repo`, so "what breaks if I change
  this endpoint?" is complete on the baseline. Everything-tier, 5-7 h, no open
  decisions.

None of these depend on each other or on anything above. If a third arrives,
re-run the solver rather than appending to this table — it is a record now, not a
plan.

## What this schedule was right and wrong about

Kept for the next one.

**Right:** compressing 7 waves to 4. The premise — that a merge conflict is a
cost, not a hazard, when tests cover the resolution — held. The wave runs
produced conflicts that took minutes, and no bad resolution reached main. The
longest-chain floor of 3 was the real bound, and the single semantic edge that
made it 4 was correctly identified.

**Wrong, in one specific way:** it modelled *scheduling* risk and not *closing*
risk. Every item that slipped slipped after its wave, in the close — a design
decision nobody had made (`installer-hq-dx`), citations to rewrite
(`runtime-pruning`), a gate ordering (`codegraph-context-layer`), a precondition
that was never really binding (`gsd-core-skill-import`). Four of fourteen, and
the schedule had nothing to say about any of them, because it treated "planned"
and "merged" as the same event.

**The cheap fix for next time:** a wave is not done when its branches build. It
is done when they are merged. Budget the close, and re-read a deferral's stated
blocker before re-planning against it — one of the four had a blocker that was
already false.
