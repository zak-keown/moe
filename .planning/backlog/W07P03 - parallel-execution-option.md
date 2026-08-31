---
slug: parallel-execution-option
title: Parallelism As A First-Class Execution Option
idea: |
  - Explore parallelization as an execution option
status: backlog
size: S
estimate: 2-3 h
depends_on: [DO-NOW-1, DO-NOW-2]
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
decision_needed: yes
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
- **So step 5 goes away.** No `skill-tiers.yaml` edit, no `metadata.test.ts:470`
  13 → 14. The lean tier stays at 13.
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

Fixing it also removes a documented falsehood. `skill-tiers.yaml:157-160` justifies
demoting `dispatching-parallel-agents` to the `everything` tier on the grounds that
"subagent-driven-development already covers the parallel case inside the everyday flow."
SDD line 282 says the opposite. Nothing in the package REQUIREs
`dispatching-parallel-agents` — the only reference outside its own directory is a passing
mention in `skills/using-moe/references/codex-tools.md:11`. It is an orphan skill about
the one thing the everyday flow bans.

## Current state

Read in the `core` worktree (`.claude/worktrees/wf_238bb49d-362-13`), not `packages/core`
on main, which is a stub.

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

**The tests that constrain any answer** (`packages/core/test/metadata.test.ts`):

- `:115` asserts exactly 27 skills; `:156-190` asserts the skill-name set equals a
  hardcoded enumeration of the six upstream sources. There is no slot for a
  fork-original skill.
- `:469-470` asserts the lean tier is exactly 13.
- `:242` resolves every `**REQUIRED SUB-SKILL:**` name against core's own 27 skills, so a
  REQUIRED edge from a core skill to crew's `driving-claude-code-sessions` fails.

## Prerequisites

**DO-NOW-1** — core is only on a branch. Editing five of its SKILL.md files before the
merge means resolving those edits in the merge.

**DO-NOW-2** — this work moves `dispatching-parallel-agents` from `everything` to `core`
and changes the lean count from 13 to 14. That is the same decision DO-NOW-2 is putting
in front of a human; it should be one decision, not two.

No backlog slug blocks this. `deterministic-task-dag` is the natural successor, not a
prerequisite: task disjointness computed from a plan's own `Files:` blocks is enough for
waves inside one plan, and a DAG is what you need once scheduling crosses plans and
phases. Whichever lands first should define the wave record the other reads.

## Proposed approach

**Option A — a third execution option: a new `parallel-execution` skill.** Matches the
idea's wording. Cost: it is the fork's first original skill, so it breaks
`metadata.test.ts:115`, `:190` and the tier map at `:457`, and forces a decision about how
that test separates inherited skills from authored ones — a decision
`gsd-core-skill-import` also needs. And it spends a permanent description line on a mode
that is a property of the other two options rather than a rival to them.

**Option B — make parallelism a mode of the two existing options.** Replace the blanket
bans at `subagent-driven-development/SKILL.md:282` and `implementing-tasks/SKILL.md:101`
with a gate; teach `using-git-worktrees` a "one worktree per parallel worker" step;
promote `dispatching-parallel-agents` to the lean tier and route the execution skills into
it, which turns an orphan into the thing it always described. No new skill, so no
inventory-test surgery beyond two counted constants.

**Option C — wire it to crew.** Real long-lived workers, human-inspectable in tmux,
three harnesses, a lifecycle event stream. But `metadata.test.ts:242` forbids a REQUIRED
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
   This is the single largest piece of new prose and the reason this is M, not S.
4. **`using-git-worktrees` Step 1c: one worktree per parallel worker**, via the native
   tool, per Step 1a's existing "never fight the harness" rule (`:51-57`). This repo's
   worktrees live in `.claude/worktrees/`, gitignored at `.gitignore:25-27` — evidence
   the native path is the one in use.
5. **Tier and test.** `skill-tiers.yaml`: `dispatching-parallel-agents` → `tier: core`,
   with a `why` that replaces the false claim at :157-160. `metadata.test.ts:470`: 13 →
   14.
6. **Fix crew's example.** `packages/crew/skills/driving-claude-code-sessions/SKILL.md:195-209`
   gets one worktree per worker instead of a shared `~/proj`, and a pointer to the gate.
   Same rule, stated where crew's readers are; no REQUIRED edge, so `:242` stays green.

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

1. **Is parallel implementation allowed at all?** Reversing an inherited safety rule in
   both execution families is a human call, not a research finding. If the answer is no,
   the honest deliverable shrinks to a one-line fix: correct the false `why` at
   `skill-tiers.yaml:157-160` so the ledger stops claiming SDD covers a case it bans.
2. **Does `dispatching-parallel-agents` move to the lean tier?** It is the only sane home
   for the gate, and a rule that lives in a plugin most people do not have installed is
   not a rule. This is a DO-NOW-2 input.
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
| `skill-tiers.yaml` + `metadata.test.ts:470`; run `pnpm --filter @bubstack/moe-core test` | 30 m |
| crew fan-out example | 20 m |

**Slower if:** question 3 answers "portable" (+1 h, seven files); or
`dispatching-parallel-agents` stays in `everything`, in which case the gate must be
duplicated into both execution skills and kept in sync — worse prose, and more of it.

## Verification

- `pnpm --filter @bubstack/moe-core run test` green, with `metadata.test.ts:470`
  asserting 14 and the tier map at `:457` still covering all 27 skills.
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
