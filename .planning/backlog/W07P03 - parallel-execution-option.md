---
slug: parallel-execution-option
title: Parallelism As A First-Class Execution Option
idea: |
  - Explore parallelization as an execution option
status: backlog
size: S
estimate: 2-3 h
depends_on: [DO-NOW-1, DO-NOW-2, skill-set-fidelity-refactor]
blocks: []
conflicts_with: [tiered-workflow-naming, deterministic-task-dag, gsd-core-skill-import, native-renderers, moe-tone-and-branding]
touches:
  - packages/core/skills/writing-plans/SKILL.md
  - packages/core/skills/subagent-driven-development/SKILL.md
  - packages/core/skills/dispatching-parallel-agents/SKILL.md
  - packages/core/skills/using-git-worktrees/SKILL.md
  - packages/core/skills/implementing-tasks/SKILL.md
  - packages/core/skill-tiers.yaml
  - packages/core/test/metadata.test.ts
  - packages/crew/skills/driving-claude-code-sessions/SKILL.md
decision_needed: no
---

# Parallelism As A First-Class Execution Option

*(All citations are to `~/Code/moe`, the Superpowers fork. The other two projects named
Moe — `~/Code/tools/moe` and `~/.claude/moe-core` — were not read for this doc.)*

## The idea

> Explore parallelization as an execution option

`writing-plans` offers exactly two ways to execute a plan
(`writing-plans/SKILL.md:157-163`): subagent-driven, or inline. Both run tasks strictly
one at a time. Parallelism exists in the skill set, but only for read-only work — two
adversarial reviewers (`_shared/parallel-adversarial-review.md:9`), fan-out requirement
extraction (`iterative-development/SKILL.md:30`), independent bug investigation
(`dispatching-parallel-agents`). Every implementation path forbids it outright, in both
execution families, with the same one-word reason:

- `subagent-driven-development/SKILL.md:282` — "Never dispatch multiple implementation
  subagents in parallel (conflicts)."
- `implementing-tasks/SKILL.md:101` — "**Never** dispatch multiple implementers in
  parallel (conflicts)"

That reason has expired. Claude Code now gives a subagent its own git worktree
(`isolation: "worktree"` on the Agent tool; `isolation: worktree` in a custom subagent's
frontmatter — [sub-agents docs](https://code.claude.com/docs/en/sub-agents),
[worktrees docs](https://code.claude.com/docs/en/worktrees)), and it *enforces* the
boundary rather than trusting the agent. Two implementers editing disjoint files in
separate worktrees cannot conflict. The prohibition was a guard against a hazard the
harness has since removed.

## Debate-review decisions (2026-08-31)

Recorded in PARITY.md ("Inherited skills, resolved") and ARCHITECTURE.md §2.

- **The tier promotion is rejected.** `dispatching-parallel-agents` stays
  `tier: everything`. `skill-tiers.yaml`'s own criterion settles it — a skill you
  invoke deliberately, by name, when you already know you want it, belongs in
  `moe-everything` — and so does the silent-failure test: a missed parallel
  dispatch yields serial execution, which is correct and merely slower.
- **So step 5 goes away.** No `skill-tiers.yaml` tier change, no lean-count bump
  13 → 14 (the assertion is `"keeps the lean tier lean"`, and after W01P01 the
  number lives in `LEAN_TIER_BUDGET`). The lean tier stays at 13. Step 5 survives
  only as a `why:` correction — see the Proposed approach.
- **The rest of Option B stands, and it is the valuable half.** The bans at
  `subagent-driven-development/SKILL.md:282` and `implementing-tasks/SKILL.md:101`
  cite a hazard the harness removed; correcting a false statement is maintenance,
  not a feature. The gate, the wave/integration step, `using-git-worktrees` Step
  1c and the crew fix all remain.
- **Net: this is S, not M.** The depth-table row in `tiered-workflow-naming` also
  changes, since the skill it references is no longer promoted.

## Why it matters

Twenty people, one company, a monorepo with 9 packages. Wave A landed five packages by
running five imports in five git worktrees at once — `git worktree list` still shows
`wf_076a633b-f00-1` … `-5` on `import/packages-*`, and Wave B/C is doing the same thing
right now on `-13`, `-14`, `-15`. **The team already executes in parallel. The skills
that are supposed to describe how we work do not know it.** That gap is the cost: every
plan with eight independent tasks is executed as eight serial round-trips because the
skill says to, and the person running it either obeys and waits, or ignores the skill and
loses the ledger, the review gate and the recovery map along with it.

There was also a documented falsehood in the tiering ledger — `skill-tiers.yaml` justified
demoting `dispatching-parallel-agents` on the grounds that "subagent-driven-development
already covers the parallel case inside the everyday flow", which the ban contradicts.
**Commit `0b1571d` has already corrected it** (Zak Keown, 2026-08-31; on main and on every
live branch): the entry now states that claim was false, quotes the ban, and records the
skill as HELD at `everything` pending this item. So that argument is spent — what remains
is the substantive gap, not the bad rationale. Nothing in the package REQUIREs
`dispatching-parallel-agents`; the only reference outside its own directory is a passing
mention in `skills/using-moe/references/codex-tools.md:11`. It is an orphan skill about
the one thing the everyday flow bans.

## Current state

Citations are to `packages/core` **on main**, where core landed with DO-NOW-1 (main
`0e6a5f7`). Every skill line number below was re-verified against main after that merge;
none moved.

**What exists.** Parallel dispatch mechanics are documented once, well:
`dispatching-parallel-agents/SKILL.md:66-77` ("Multiple dispatch calls in one response =
parallel execution"). Per-harness translations exist for five of seven harnesses
(`using-moe/references/gemini-tools.md:46-48`, `hermes-tools.md:46`, `kimi-tools.md:39`,
`pi-tools.md:12`, `codex-tools.md:1-11`). PAR ships a sequential fallback for harnesses
with no parallel dispatch (`_shared/parallel-adversarial-review.md:46-49`) — the
degradation pattern this work should copy.

**What does not exist.** Three gaps, each verified by grep:

1. `dispatching-parallel-agents/SKILL.md` contains the string "worktree" zero times, and
   `using-git-worktrees/SKILL.md` contains "subagent" and "parallel" zero times. The two
   halves of safe parallel implementation are never joined anywhere in core.
2. No harness reference file describes worktree-isolated subagents. Only
   `codex-tools.md:83-96` mentions worktrees at all, and only to detect an existing one.
3. `writing-plans` already emits the data a scheduler needs — a `Files:` block per task
   (`writing-plans/SKILL.md:87-91`) and an `Interfaces: Consumes/Produces` block
   (`:93-96`) — and nothing reads either for scheduling.

**Where crew sits.** `packages/crew` on main (`@bubstack/moe-crew`, ex
`claude-session-driver` @ `d97d1eb`) is a working parallel substrate: `moe-crew launch`
takes an arbitrary per-worker `cwd`, validated and realpath'd at
`src/commands/launch.ts:66-70`, so it can already launch a worker inside a worktree. But
nothing in crew creates or knows about worktrees (`grep -rn worktree src/ skills/` in
`packages/crew` returns nothing), and its Fan-Out example launches two workers into **the
same** `~/proj` (`skills/driving-claude-code-sessions/SKILL.md:195-209`) — the exact
hazard SDD:282 bans. crew is not the missing capability; it is the second consumer of the
same missing rule.

**The tests that constrain any answer** — all in `packages/core/test/metadata.test.ts`.
**Cited by test name, not line number: W01P01 grows that file from ~595 to 925 lines, so
every line cite into it drifts.** Names and symbols survive; numbers do not.

- `"ships exactly 27 skills"` (renamed by W01P01 to `"pins the IMPORTED skill set at
  exactly 27"`) and `"accounts for every skill the six upstream sources shipped"`. On main
  these two together leave no slot for a fork-original skill; after W01P01 both target
  `imported:` rather than the directory.
- `"keeps the lean tier lean"` — asserts the lean count, via the `LEAN_TIER_BUDGET`
  constant after W01P01. Moot here: the promotion is rejected, so this work must not touch
  it.
- `"accounts for every skill on disk in exactly one of the two maps"` — new in W01P01.
  Completeness and disjointness in both directions: nothing on disk without a manifest
  entry, nothing registered without existing, no name in both maps.
- `"every REQUIRED marker names a skill that exists"` — resolves every `**REQUIRED
  SUB-SKILL:**` name against core's own skills, so a REQUIRED edge from a core skill to
  crew's `driving-claude-code-sessions` fails. **W01P01 does not touch this one, and it is
  the constraint that decides Option C.**

## Prerequisites

**DO-NOW-1 — discharged.** Core is merged; `packages/core/skills/` is on main.

**DO-NOW-2 — discharged, against this doc's original step 5.** Approved in commit
`0b1571d` ("DO-NOW-2, reviewed and approved. The split stands"), which also deleted the
ERR SMALL tiebreak and rewrote this skill's rationale. The debate review then declined the
promotion; `PARITY.md:90` keeps `dispatching-parallel-agents` at `everything` and
`ARCHITECTURE.md:105-109` gives the reason (a missed parallel dispatch yields serial
execution — correct, merely slower). See the decisions block above. **`PARITY.md:90` is
on main as of `9c62e62`; a branch cut before that commit will not have it.**

**W01P01 `skill-set-fidelity-refactor`** — scheduled six waves ahead of this one, and it
restructures a file in `touches`. `skill-tiers.yaml`'s flat `skills:` map becomes
`imported:` (frozen, the 27) plus `authored:` (`{}`), and `metadata.test.ts` re-points its
assertions at `imported:` rather than at the directory. Two consequences here: the
`dispatching-parallel-agents` entry body is textually unchanged, so the small `why`
correction this work owes it merges cleanly; and **Option A gets much cheaper** — see
below.

No backlog slug blocks this. `deterministic-task-dag` (W02P01) is the natural successor,
not a prerequisite: task disjointness computed from a plan's own `Files:` blocks is enough
for waves inside one plan, and a DAG is what you need once scheduling crosses plans and
phases. It lands five waves earlier, so it should define the wave record this work reads.

## Proposed approach

**Option A — a third execution option: a new `parallel-execution` skill.** Matches the
idea's wording. **Its cost has dropped sharply and the doc's original objection no longer
holds.** On main it would have been the fork's first original skill, failing both the
27-count and the pinned upstream enumeration at once. After W01P01 those assertions target
`imported:` instead of the directory, the grand total is deliberately unasserted, and the
test's own comment says adding a Moe-original skill "is now a two-line manifest diff, not
a wall": a directory plus an `authored:` entry. Two lines, not zero, and they must land in
the **same commit** — `"accounts for every skill on disk in exactly one of the two maps"`
is bidirectional, so a skill directory with no manifest entry is red. The entry would also
be constrained: `tier: everything` per decision D2 (`skill-tiers.yaml:306`, current policy
and reversible), and `from:` set to the fork's own value rather than an upstream name.
What survives is therefore not a test cost but a design objection: parallelism is a
property of the other two options, not a rival to them, and a fourth routing target is a
permanent description line for twenty people.

**Option B — make parallelism a mode of the two existing options.** Replace the blanket
bans at `subagent-driven-development/SKILL.md:282` and `implementing-tasks/SKILL.md:101`
with a gate; teach `using-git-worktrees` a "one worktree per parallel worker" step; route
the execution skills into `dispatching-parallel-agents`, which turns an orphan into the
thing it always described. No new skill, and — with the promotion rejected — no tier or
counted-constant change either.

**Option C — wire it to crew.** Real long-lived workers, human-inspectable in tmux,
three harnesses, a lifecycle event stream. But `"every REQUIRED marker names a skill that
exists"` forbids a REQUIRED
edge from core to a crew skill, crew's workers are heavier than a fan-out of eight
one-file tasks needs, and crew's own fan-out example has the same worktree bug — so this
is downstream of the rule, not a substitute for it.

**Recommendation: Option B, with the crew fix folded in.** The idea says "execution
option," but parallelism is not a third way to execute a plan — it is the question of how
many workers a wave gets, and both existing options need the answer. Do this:

1. **Define the gate, once, in `dispatching-parallel-agents`.** Two implementers may run
   concurrently when their tasks' `Files:` blocks are disjoint, neither consumes an
   interface the other produces, and each worker gets its own worktree. Fail any one
   condition and the wave is serial. Name the harness capability check and the fallback
   in the shape PAR already uses (`_shared/parallel-adversarial-review.md:46-49`):
   worktree-isolated parallel dispatch → parallel dispatch on disjoint files with no
   isolation → sequential.
2. **Route into it.** `subagent-driven-development` gains a wave step before the task
   loop: group tasks, then dispatch each wave's implementers concurrently and review the
   wave's diffs as it lands. Replace :282 with the gate rather than deleting it — the ban
   is correct whenever the gate fails.
3. **Add the integration step SDD does not have.** Its review loop is a per-task
   `BASE`→`HEAD` diff (`:290`). Parallel workers in separate worktrees produce N
   branches, and something must merge them and re-run the suite before the next wave.
   This is the single largest piece of new prose in the change.

   It must also carry a **divergent-tree rule**, which this backlog round demonstrated
   the hard way. Three agents disputed one citation — `PARITY.md:90` — and reached three
   answers: two greps said it was dangling, one said it resolved. Nobody ran a bad
   command. The row was added by `9c62e62`, which one worktree's branch point predated,
   so *the same path and line number held different content in two live trees*. That is
   not an anecdote about carelessness; it is the standing failure mode of fan-out
   execution, and the gate has to answer it:
   - A worker's findings are scoped to the tree it read. Its report names the SHA it
     read at, and a reviewer comparing two workers' claims compares SHAs first.
   - Cite by test name, symbol, or quoted sentence — not by line number — in anything
     that crosses a worker boundary. Line numbers are only valid within one tree at one
     commit, which is precisely what a wave does not have.
   - Before a wave starts, workers branch from one recorded base. A worker branched from
     an older base is not merely behind; it will read and cite a different file.
4. **`using-git-worktrees` Step 1c: one worktree per parallel worker**, via the native
   tool, per Step 1a's existing "never fight the harness" rule (`:51-57`). This repo's
   worktrees live in `.claude/worktrees/`, gitignored at `.gitignore:25-27` — evidence
   the native path is the one in use.
5. **Fix the stale filename in the `why:`; keep its hedge.** The entry for
   `dispatching-parallel-agents` in `skill-tiers.yaml` was fully rewritten by commit
   `0b1571d` ("core: settle the lean/full tiering…", Zak Keown, 2026-08-31, body opens
   "DO-NOW-2, reviewed and approved"). Three separate things, and only the first is a
   defect:
   - **Stale cross-reference — already being fixed on main, not by this item.** Committed
     main (`b929e31`) still reads `See .planning/backlog/W01P01 -
     parallel-execution-option.md`, a path that no longer exists. It was *correct when
     written* — `0b1571d --stat` shows the doc created at exactly that path — and went
     stale when the orchestrator renumbered the backlog, moving this slug to W07P03 and
     giving W01P01 to `skill-set-fidelity-refactor`. **Main's working tree already carries
     the fix, and it is a better one than renumbering:** cite the item *by slug*, with the
     reason inline — "that prefix IS the wave schedule and moves whenever the backlog is
     re-waved." Do not "fix" this to `W07P03`; that reintroduces a numbered path which
     breaks at the next re-wave. This bullet is therefore someone else's in-flight work —
     recorded here only so this item does not duplicate or revert it.
   - **The "for now" hedge — keep it.** `0b1571d`'s body puts it there deliberately:
     "Held at `everything` for now rather than promoted, because […] reopens exactly that
     prohibition […]; moving the tier now would move it twice." The hedge and the forward
     pointer *are* the approved decision, not residue from before it. Do not delete them
     to "state the settled answer" — an earlier draft of this step said to, and that was
     wrong.
   - **The outcome — record it when this work lands, not before.** `PARITY.md:90`
     resolves whether to *remove* the skill ("all six are kept"), and notes it sits at
     `everything`; `ARCHITECTURE.md:105-109` supplies the silent-failure argument. Once
     this item executes and declines the promotion, replace the hedge with that outcome,
     citing `0b1571d` and `PARITY.md:90`. Sequencing matters: the hedge is correct until
     the thing it defers to has actually decided.
   - Also de-number the `why:`'s own citation of
     `subagent-driven-development/SKILL.md:282` — exact today, but this work moves that
     file. The quoted sentence it already carries is the durable reference.

   **No `tier:` change, no lean-count change, no test-constant change.**
6. **Fix crew's example.** `packages/crew/skills/driving-claude-code-sessions/SKILL.md:195-209`
   gets one worktree per worker instead of a shared `~/proj`, and a pointer to the gate.
   Same rule, stated where crew's readers are; no REQUIRED edge, so the REQUIRED-marker
   test stays green.

## Scope boundary

**In:** the concurrency rule and its degradation ladder; wave grouping from a plan's own
`Files:`/`Interfaces:` blocks; worktree-per-worker; the merge-between-waves step; the
tier change for `dispatching-parallel-agents` and its two test constants; the crew
fan-out correction.

**Out:**
- **Cross-plan and cross-phase scheduling, dependency graphs, any persisted state
  machine** — `deterministic-task-dag` owns that. This doc computes waves inside one
  plan from data the plan already carries.
- **Naming or restructuring the execution options** ("fast/quick/default") —
  `tiered-workflow-naming` owns it, and it will edit the same `writing-plans` handoff
  block.
- **Replacing prose dispatch instructions with real harness tool invocations across the
  skill set** — `native-renderers` owns that. The boundary: this doc names one capability
  (worktree-isolated dispatch) and its fallbacks because the safety rule is meaningless
  without it. It does not convert `dispatching-parallel-agents`' pseudo-code block
  (`:70-75`) into real Agent-tool calls, or touch how any other skill renders a dispatch.
- **New crew commands, worktree creation inside crew, any `packages/crew/src/` change.**
  Prose only in crew: `launch` already accepts the cwd.
- **The lean/full tiering of anything except `dispatching-parallel-agents`** — DO-NOW-2.

## Open questions for Zak

**ANSWERED 2026-08-31 (Zak): YES — as a mode of the two existing execution options,
gated on worktree isolation.** Not a third option. The full scope of this doc stands.

The ban's own stated reason is `(conflicts)` — two agents writing the same file — and
worktree isolation removes that cause rather than accepting the risk. This session is
the evidence in both directions: five agents ran concurrently in separate worktrees with
zero write conflicts, *and* produced the three-way citation dispute that the integration
requirements below now exist to prevent. Parallel execution was safe on the axis the ban
names and unsafe on an axis it does not.

**Question 3 (Claude-Code-only vs portable): PORTABLE.** I first recorded this as
Claude-Code-only, reasoning that "you cannot gate on worktree isolation in a harness that
has no worktree isolation." Zak corrected the premise on 2026-08-31: **`git worktree` is
a git feature, not a Claude Code feature.** Claude Code only wraps it (`isolation:
"worktree"`); any harness that shells out to git has the same isolation available, and
every one of the eleven targets runs shell commands.

That makes the gate portable *and* deterministic, which is better than the
Claude-Code-only version on both counts:

- **The check is a git question, not a harness question.** A worker is in a linked
  worktree when `git rev-parse --git-common-dir` differs from `git rev-parse --git-dir`.
  That is one command, the same on all eleven targets, with no harness feature
  detection and no model in the loop — which is exactly the shape ARCHITECTURE §2 asks
  for when a missed check fails silently, and a missed isolation check fails silently by
  definition: the writes just collide.
- **No harness-capability matrix to maintain.** The rejected design needed one entry per
  target and would have gone stale the way every other inherited support matrix in this
  fork did.

Cost: the ladder goes into all seven reference files (+~1 h), and it collides with
`runtime-pruning`, which is rewriting `gemini-tools.md` in W02. Both are in
`conflicts_with` already or are different waves — this item is W07, `runtime-pruning` is
W02, so the collision is scheduled apart. Update the Effort table's "slower if" row:
portable is now the chosen path, not the contingency.

*The original question, kept because the answer rests on its framing:*

1. **Is parallel implementation allowed at all?** Reversing an inherited safety rule in
   both execution families is a human call, not a research finding. If the answer is no,
   the deliverable shrinks to step 5 alone — close out the deferred `why` — and the rest
   of this doc is dropped.
2. ~~**Does `dispatching-parallel-agents` move to the lean tier?**~~ **Answered: no** — by
   the debate review recorded in the decisions block above. Supporting record: `0b1571d`
   is the approved tiering commit; `PARITY.md:90` resolves the separate proposal to
   *remove* the skill ("all six are kept") and notes it sits at `everything`;
   `ARCHITECTURE.md:105-109` supplies the silent-failure argument — a missed dispatch
   yields serial execution, correct and merely slower. The gate therefore lives in a skill
   most people will not have installed, so the execution skills must carry enough of it
   inline to be correct on their own — a real cost of the decision, and the reason step 2
   routes rather than delegates.
3. **Claude-Code-only, or portable?** Worktree isolation is a Claude Code feature; no
   other harness reference documents an equivalent. Portable means writing the ladder in
   all seven reference files (adds ~1 h and collides with `runtime-pruning`, which is
   rewriting `gemini-tools.md`). Claude-Code-only means the gate simply fails closed
   elsewhere and everyone else runs serial — cheaper, and correct today.

## Effort

| Step | Time |
|---|---|
| Write the gate + degradation ladder in `dispatching-parallel-agents` | 1 h |
| SDD: wave grouping, replace :282, wire the review loop per wave | 1.5 h |
| The merge-between-waves step (new prose, no precedent in the skill) | 1 h |
| `using-git-worktrees` Step 1c; `implementing-tasks:101`; `writing-plans` handoff | 45 m |
| Close out the deferred `why` in `skill-tiers.yaml`; run `pnpm --filter @bubstack/moe-core test` | 15 m |
| crew fan-out example | 20 m |

**Slower if:** ~~question 3 answers "portable"~~ — it did, so the +1 h for seven
reference files is in the estimate rather than a contingency. See the decision block
above: `git worktree` is a git feature, so the gate is one `git rev-parse
--git-common-dir` check and portable across all eleven targets. The rejected promotion
also costs time rather than saving it: because the gate now lives in a plugin most people
will not have installed, its operative rule has to be restated inline in both execution
skills and kept in sync with the canonical copy.

## Verification

- `pnpm --filter @bubstack/moe-core run test` green, with `LEAN_TIER_BUDGET` still 13 and
  `dispatching-parallel-agents` still `tier: everything` under `imported:` — this work must
  not move the tier. If the diff touches `LEAN_TIER_BUDGET`, it has exceeded its scope.
- `grep -rn "Never dispatch multiple implementation subagents in parallel"
  packages/core/skills/` returns nothing; the same grep for the gate's phrasing returns
  hits in `dispatching-parallel-agents`, `subagent-driven-development` and
  `implementing-tasks`.
- `grep -c worktree packages/core/skills/dispatching-parallel-agents/SKILL.md` is
  non-zero — today it is 0, which is the defect.
- `grep -n "~/proj" packages/crew/skills/driving-claude-code-sessions/SKILL.md` no longer
  shows two workers sharing one directory.
- A new case in `metadata.test.ts`: every skill that instructs a parallel dispatch also
  names a sequential fallback. That is the invariant PAR established and the one a
  non-Claude-Code harness depends on.
- End-to-end, on a real plan: a plan with three tasks whose `Files:` blocks are disjoint
  executes as one wave of three worktree-isolated implementers, merges clean, and the
  ledger records the wave. That is the acceptance test a human runs once.

**Sources:**
[Create custom subagents](https://code.claude.com/docs/en/sub-agents) ·
[Run parallel sessions with worktrees](https://code.claude.com/docs/en/worktrees) ·
[Run agents in parallel](https://code.claude.com/docs/en/agents)
