---
slug: deterministic-task-dag
title: Deterministic Plan-Set Sequencing For Multi-Plan Projects
idea: |
  Explore a deterministic task DAG for larger projects (anything more than 1
  phase?) -- some sort of lightweight state machine? Project mgmt for
  larger/greenfield initiatives.
status: done
size: M
estimate: 7-9 h
depends_on: [DO-NOW-1, skill-set-fidelity-refactor]
blocks: []
conflicts_with: [parallel-execution-option, gsd-core-skill-import, tiered-workflow-naming, moe-tone-and-branding, native-renderers, tc-governance-integration]
touches: [packages/core/skills/, packages/core/skill-tiers.yaml, packages/core/test/metadata.test.ts, packages/core/hooks/, packages/core/hooks/hooks.json]
decision_needed: no
---

# Deterministic Plan-Set Sequencing For Multi-Plan Projects

## The idea

> Explore a deterministic task DAG for larger projects (anything more than 1
> phase?) -- some sort of lightweight state machine? Project mgmt for
> larger/greenfield initiatives.

In this repo the idea has one honest referent: **the tier between one plan and a
whole methodology has no state at all.** `writing-plans` produces one plan.
`subagent-driven-development` (SDD) executes one plan and ledgers its own tasks.
`iterative-development` is a six-skill alternative for specs too large to plan
upfront. Nothing tracks *a set of plans and the order they must run in* — and
that set is exactly what both upstream skills instruct the agent to create. The
smallest version worth building is a committed manifest for that set plus one CLI
that answers "what is runnable now".

## Debate-review decisions (2026-08-31)

**ANSWERED 2026-08-31 (Zak): both — Option A *plus* the SessionStart hook.**
The re-price below was run and it did not pick a winner, because the two things do
different jobs: the hook is the only mechanism that cannot silently miss, and the skill
is the only place the loop can live in one file. Consequences, all of them real work
this item now owns:

- The `sequencing-plans` **description shrinks**. It no longer has to carry the
  cold-start case (*"new session, four plans exist, which are done?"*), because the
  hook fires on that deterministically with no model in the loop. Write the description
  for the warm case — "use when a project has more than one plan and you need to know
  which is runnable" — and let the hook own the cold one.
- **New file: `packages/core/hooks/hooks.json` + a `plan-set-notice` hook**, added to
  this item's `touches`. That creates one new conflict edge,
  `tc-governance-integration`, now declared in `conflicts_with`. The schedule was
  recomputed: max clique is **still 7**, wall clock still 47 h, and the committed
  7-wave schedule is still valid — `deterministic-task-dag` is W02 and
  `tc-governance-integration` is W07. **W02 therefore defines `hooks.json`'s shape,**
  and `verification-split-and-firing-rate` (W03) and `tc-governance-integration` (W07)
  both extend whatever this item writes. Neither of those edges was declared in the
  frontmatter the author wrote; see `WAVES.md`.
- The hook script is **extensionless**, per the Windows lesson: Claude Code's Windows
  auto-detection prepends `bash` to any command containing `.sh`. It also must not be
  the thing that carries the loop — announce only, exit 0 on every failure path, and
  say plainly when it did not run, matching `run-hook.cmd`'s diagnostic.
- **+1 h** on the estimate (6-8 h → 7-9 h) for the hook, its registration and its test.

*Original re-price argument, kept because it is the reasoning the answer rests on:*

- **Option A has to be re-argued against a hook.** Its case is that B "is
  undiscoverable exactly when it is needed" — *"new session, four plans exist,
  which are done?"* — and that "a skill's description sentence is the trigger,
  and there is no other way to get one." There is now another way: that trigger
  condition is a deterministic file-existence test
  (`docs/moe/plans/*-MANIFEST.md`), which a SessionStart hook can evaluate with
  no model in the loop. ARCHITECTURE.md §2 records the rule — a skill earns a
  deterministic trigger when a missed trigger fails silently — and a manifest the
  agent never notices is precisely a silent miss.
- **This does not settle it against the skill.** A hook can announce that a plan
  set exists; it cannot carry the loop that reads `next`, dispatches, and calls
  `done`. The likely answer is both, and the description's job shrinks
  accordingly. Re-price Option A against Option B plus a hook.
- **`from: moe` still comes from `skill-set-fidelity-refactor`**, unchanged.
- Both items extend `metadata.test.ts`, so they cannot share a wave.

## Why it matters

The failure is already documented in the fork's own prose:
`subagent-driven-development/SKILL.md:130-134` records that "controllers that
lost their place have re-dispatched entire completed task sequences — the single
most expensive failure observed," and fixes it with a per-plan ledger. That fix
stops at the plan boundary by design — "Another plan's directory is never yours
to read or write" (`SKILL.md:140`) — so on a four-plan project the exact failure
SDD exists to prevent reappears one level up with nothing to catch it. For ~20
internal users that surfaces as a lost afternoon, not a bug report.

## Current state

**Nothing in this repo models a dependency between units of work.** `grep -rl
"depends_on\|dependency graph\|DAG\|topological"` over
`.claude/worktrees/wf_238bb49d-362-13/packages/core/skills/` returns zero files.
Every citation below is in that `import/packages-core` worktree, not `main`.

The everyday flow tells the agent to decompose, then forgets the decomposition:

- `brainstorming/SKILL.md:168` — "decompose into sub-projects: what are the
  independent pieces, how do they relate, what order should they be built?" The
  answer is written to no file.
- `writing-plans/SKILL.md:23` — "suggest breaking this into separate plans — one
  per subsystem." No index of those plans exists.
- SDD's workspace is `<repo-root>/.moe/sdd/<plan-basename>/`, plan-scoped and
  git-ignored (`scripts/sdd-workspace`), holding `progress.md` with the recovery
  contract `Task <N>: complete (commits <base7>..<head7>, review clean)`
  (`SKILL.md:437`), deleted on success (`SKILL.md:483`).
- `finishing-a-development-branch` ends one branch and has no notion of a next one.

The `iterative-development` cluster **does** persist cross-iteration state and is
the real prior art here — "All process state lives in artifact files… There is no
ephemeral in-memory state to recover" (`iterative-development/SKILL.md:88-95`),
five files under `docs/moe/iterations/` plus `progress.md`. But that state is **a
linear list with a status field, not a graph.**
`scoping-the-simplest-core/SKILL.md:10` produces "ordered follow-on iterations";
the fixture `test/iterative-development/fixtures/roadmap.example.md` has `##
Iteration list` with `**Status:** pending` and no dependency field.
`running-an-iteration/SKILL.md:24` is "find the first iteration with status
`pending`" — position, not readiness.

Its nine CLIs (37 tests, `pnpm --filter @bubstack/moe-core test:python`) are
**shape validators, not a state machine** — `validate_roadmap.py` is 60 lines
asserting a heading string and four bold fields. Nothing reads status and returns
a next node, so `running-an-iteration/SKILL.md:47-53` spends a numbered step on
prose "Status reconciliation" across four artifacts, closing "Do not trust any
single artifact blindly — cross-check." That step is the missing CLI, written as
an instruction. Below it, `implementing-tasks/SKILL.md:10` "holds its task batch
in memory" with no ledger at all; the cluster's answer to a mid-iteration reset
is to redo the iteration and let the audit find the mess.

**Settled (#34): nothing above one plan gets routed to `iterative-development`.**
The cluster's entry cost — requirements extraction over a large spec plus a
behavior evidence corpus — is wrong for a three-plan feature, and it is
`everything`-tier (`skill-tiers.yaml:212-217`) so the everyday flow would still
get nothing. This slug serves the `writing-plans` → SDD path.

### The one constraint still standing

**Parallel implementation is banned in writing, and the ban is not mine to
lift.** `subagent-driven-development/SKILL.md:282` — "Never dispatch multiple
implementation subagents in parallel (conflicts)" — repeated verbatim as a Red
Flag at `implementing-tasks/SKILL.md:101`. Parallelism today is permitted only
for read-only work: PAR's two simultaneous reviewers
(`_shared/parallel-adversarial-review.md:9`) and fan-out extraction
(`iterative-development/SKILL.md:30`). `dispatching-parallel-agents/SKILL.md:32`
treats it as a shared-state question rather than a flat rule, but both execution
skills state it flatly. `parallel-execution-option` owns lifting it. This design
runs one plan at a time, so the ban does not bind here.

Usefully, the plan format already carries the data for intra-plan scheduling:
`writing-plans/SKILL.md:86-95` mandates a per-task `**Files:**` block (Create /
Modify / Test) *and* an `**Interfaces:**` block with "Consumes: what this task
uses from earlier tasks" and "Produces: what later tasks rely on." Task-level
edges are already stated per task, in prose, inside every plan.

### Prior art outside this repo

`~/.claude/moe-core` (VERSION `0.0.1`) is a **different project** — one of three
things on this machine named Moe, unrelated to this Superpowers fork. It has the
finished version and it prices it: `bin/lib/phase.cjs:742-838` resolves plan
frontmatter `depends_on` into a DAG by Kahn's algorithm, errors on a cycle naming
the nodes (`:758`), and only warns when a declared `wave` disagrees with the
computed one (`:800`); `bin/lib/plan-dependency-graph.cjs`'s
`computeHaltPropagation` (`:196`) is "Diamond-safe… and transitive-safe"
(`:192-194`). The price: `find bin -name '*.cjs' | xargs wc -l` is **130,764
lines**, of which the phase/state/roadmap/plan cluster alone is **16,570**, with
comments recording a production divergence between two "which plans are
incomplete" readers (#2830), a case-folded plan-id collision, and a `status:
halted # designed stop` YAML trailing-comment bug the templates themselves
invited — plus a live defect where any `state.*` call resets `STATE.md`
`total_phases` to 1. Best thing to steal is the level split: its **phase**-level
`**Depends on**: Phase 2` is a free-text string only
(`bin/lib/roadmap.cjs:326-327`), while the **plan**-level `depends_on` is the
real resolved graph. The graph earns its keep one level down, over plans.
Importing the code belongs to `gsd-core-skill-import`; this slug owns the design.

The harness does not cover this either. Claude Code's dynamic Workflow scripts
resume — "resuming the session will allow the workflow to pick up where it left
off" — but dependencies are orchestration patterns, not declared edges, the state
location is unspecified, and resume is *session*-scoped. A reset in a new session
on another machine is precisely the losing case, and Moe targets 11 harness
adapters, not one. Only a committed file survives. Harness-native primitives
where they *do* fit is `native-renderers`.

## Prerequisites

- **DO-NOW-1** — every path cited above is on `import/packages-core`.
- **`skill-set-fidelity-refactor`** — hard prerequisite. On branch
  `worktree-wf_81b8d9e1-32f-3` it splits `skill-tiers.yaml` into `imported:`
  (27 entries, frozen, `:80`) and `authored:` (open, `{}` at `:316-317`), and
  re-aims both drop-detectors at `imported:`. A new completeness/disjointness pair
  (`test/metadata.test.ts:237-244`) requires the union of both maps to equal the
  skills on disk, so a directory and its manifest entry land together or the suite
  is red. Until it merges, a 28th skill directory is impossible.
- **DO-NOW-2 is not a prerequisite.** Decision D2 pins every fork-authored skill
  to `everything` regardless of how the lean/full review resolves the 27 imported
  ones, so this item's tier no longer waits on it.

## Proposed approach

Both shapes carry the same substance and differ only in where it lives: one
committed `docs/moe/plans/<project>-MANIFEST.md` beside the plans it names, one
entry per plan (`id`, `plan` path, `depends_on: [ids]`, `status:
pending|running|done|blocked`), and one extensionless Node executable `plan-set`
with three verbs — `next` (print every id whose deps are all `done`),
`done <id> <base>..<head>`, `check` (unique ids, plan files exist, deps resolve,
no cycle, no plan listed twice).

**Option A — a real skill, `sequencing-plans`.** Its own directory, frontmatter
description, `scripts/plan-set`, and a short SKILL.md whose loop is: read the
manifest → `next` → dispatch SDD on that plan → `done` → repeat.
*Trade-off:* one description line loaded in every session, a tier to assign, and
a directory to register in the fork-authored set.

**Option B — script plus prose in skills that already exist** (`plan-set` into
`subagent-driven-development/scripts/`, one sentence added at
`writing-plans:23`'s Scope Check, one section at SDD's Finish). *Trade-off:*
edits less and adds nothing to any session's permanent context — but it has no
trigger of its own.

**Recommendation: A, the skill — and, per the decision above, the hook alongside it.**
What follows is the case for the skill half; the hook half is argued in the
Debate-review block. Not because a skill is now permitted, but
because B fails at the one moment this feature exists for. `using-moe/SKILL.md`
makes the frontmatter `description` the entire routing mechanism — "Invoke
relevant or requested skills BEFORE any response or action." B's entry points are
`writing-plans` (fires when there is a spec for a multi-step task) and SDD's
Finish (fires when you are already executing a plan). Neither fires on *"new
session, four plans exist, which are done?"* — and that cold mid-project start is
precisely the context-reset case the manifest is built to survive. B is
undiscoverable exactly when it is needed. A skill's description sentence is the
trigger, and there is no other way to get one.

I argued B on the merits last revision — reuses more, edits less — and those
merits are real but they are efficiency, not capability. With the assertions gone
they no longer outweigh a missing trigger.

Borrow exactly two things from moe-core: the frontmatter vocabulary
(`depends_on`, `status`, `blocked`) and the algorithm shape (Kahn's, cycle as a
hard error naming the nodes, blocked propagating transitively and diamond-safe).
It already paid for those edge cases and names them in comments.

### Tier: `everything`, per decision D2

Register under `authored:` as `tier: everything`, `from: moe`, with a `why:` over
40 characters (the suite applies the same rationale bar to both maps).
`skill-tiers.yaml:306-310` states the policy: "a fork-authored skill is `tier:
everything` only… This is REVERSIBLE and deliberately so: it exists to make the
first core-tier authored skill a conversation someone has on purpose rather than
a default nobody chose."

Complying. With the SessionStart hook now owning the cold-start case, the
ergonomic half of the core-tier argument is largely answered and should not force
that conversation early. What follows is a different, structural reason to have it.

### The hook and D2 collide, and nothing in the suite catches it

Verified on the refactor branch: `scripts/mint-plugins.mjs:167` tier-filters
**only** the skills component — `if (component === "skills" && keep)` — and `:176`
`copyInto(src, path.join(dest, component))` copies every other component, `hooks`
included, into **both** plugins unfiltered.

So `plan-set-notice` ships in `moe-core` *and* `moe-everything`, while
`sequencing-plans` — everything-tier under D2 — ships in only one. A lean user
gets a deterministic session-start notice pointing at a skill they do not have,
and at `skills/sequencing-plans/scripts/plan-set`, a path the tier filter removed
from their plugin. That is structurally the dead end the closure rule exists to
prevent, and the closure rule cannot see it: it scans `**REQUIRED SUB-SKILL:**`
markers in markdown only, never hooks.

**Design consequence, not optional: `plan-set` lives in `packages/core/hooks/`,
not inside the skill.** Hooks stage unfiltered, so the CLI then exists in both
plugins. The hook announces the manifest and prints a runnable `plan-set next`
command naming no skill; a lean user gets notice plus a working query and drives
SDD per plan by hand, which is what they do today. The skill stays the ergonomic
wrapper that carries the loop. This keeps the hook announce-only, as the
debate-review requires, and it is the only arrangement satisfying both D2 and the
hook.

One oddity to name: every other skill here keeps its scripts under its own
directory. Splitting them is a consequence of the tier filter, not a preference,
and the script's head comment should say so.

**This is the stronger input to D2's reversal conversation** — a structural defect
rather than a preference. Flipping this skill to `core` would let the script sit
inside it like every other one, and is a one-line change to `keeps the lean tier
lean` (`toBe(13)` → `toBe(14)`). The arrangement above is correct until that
decision is taken.

### Name

`sequencing-plans` follows the house gerund-first convention (19 of 27 skills
match it) and stays clear of `executing-plans`, the existing no-subagents
fallback — `executing-a-plan-set` beside `executing-plans` is a confusable pair.
It sequences; SDD executes. Provisional: `tiered-workflow-naming` owns final
naming.

### Two calls worth stating rather than asking

- **`next` returns a set; v1 takes the first of it.** The set is simply the seam
  a later cross-plan scheduler would read. Nothing here needs the write-ban lifted.
- **`blocked` is terminal and propagates.** moe-core's #2830 is the proof: a plan
  that stops by design still writes a completion record, so a naive "artifact
  exists = done" reader hands the agent a plan whose foundation was never built.
  Twenty lines, and without them the CLI's answer is not trustworthy.

## Sequencing with `parallel-execution-option`

Neither depends on the other. That slug computes intra-plan waves from data
already inside one plan file (`writing-plans:86-95`) and needs no cross-plan
manifest; this one schedules one plan at a time and needs no ban lifted. What
they share is a wave/readiness record format and the same files, which is
`conflicts_with` — different waves, and whichever lands first defines the record.
Recommend this one first: no written rule to lift. Latent edge for the
orchestrator: if `parallel-execution-option` keeps a *cross-plan* scope, that half
consumes this doc's ready set and must follow it.

## Scope boundary

**In:** the `sequencing-plans` skill directory and SKILL.md; the manifest schema;
`plan-set` in `packages/core/hooks/` with `next`/`done`/`check`; cycle detection;
transitive blocked propagation; the `authored:` entry in `skill-tiers.yaml`; a
plain conditional mention at `writing-plans:23` (not a REQUIRED marker — the
closure rule forbids core→everything); two test-allowlist lines; vitest coverage;
**the `SessionStart`
entry in `packages/core/hooks/hooks.json` and the extensionless `plan-set-notice`
hook that announces an incomplete plan set.**

**Out:**
- Lifting the parallel-write ban, or dispatching the ready set concurrently —
  `parallel-execution-option`.
- Redesigning the fidelity assertions, and enforcing D2's `tier`/`from` rules in
  code — `skill-set-fidelity-refactor`.
- Extending `hooks.json` beyond the one entry this item adds —
  `verification-split-and-firing-rate` (W03) and `tc-governance-integration` (W07).
- Final naming and tier vocabulary — `tiered-workflow-naming`.
- Lifting code or templates out of `~/.claude/moe-core` — `gsd-core-skill-import`.
- Everything the `iterative-development` cluster owns: requirements extraction,
  behavior scenarios, the evidence corpus, PAR gates, the audit loop — none of
  those six skills or their nine CLIs are touched.
- Milestones, velocity metrics, a `STATE.md`-style digest, a `.planning/`
  contract, decimal phase insertions.
- **Greenfield spec work.** `packages/backstory/README.md:3-7` is "Recover a
  behavioral spec from a codebase that never had one" — brownfield archaeology.
  Its upstream repo was *named* `greenfield`; it does no project management, and
  the word in the idea is a false friend.
- A general-purpose workflow engine, a scheduler daemon, graph visualization.

## Open questions for Zak

One, and it is a decision rather than a question: **should `sequencing-plans` be
core-tier after all?** D2 says everything-tier for now and explicitly invites the
conversation. The hook/tier collision above is the concrete reason to have it,
because the compliant workaround splits a skill from its own script. Reversing D2
for this skill is one line (`toBe(13)` → `toBe(14)`) and needs nothing else, since
the `writing-plans` mention is already non-REQUIRED. **Not blocking** — the item
ships correctly either way.

#34 is settled above, and the A-vs-B-vs-hook re-price the debate review demanded
was answered on 2026-08-31: **both**, recorded at the top of this doc with its
four consequences. The name is provisional pending `tiered-workflow-naming`; the
manifest location, the three-verb CLI surface, and `blocked` semantics are calls
made above.

## Effort

| Step | Time |
|---|---|
| `sequencing-plans/SKILL.md` + manifest schema | 2-2.5 h |
| `hooks/plan-set`: three verbs, Kahn, cycle error, blocked propagation | 1.5-2 h |
| Vitest fixtures + the two allowlist lines | 1-1.5 h |
| `authored:` entry + conditional mention at `writing-plans:23` | 0.5 h |
| `plan-set-notice` hook + `hooks.json` `SessionStart` entry + its test | 1 h |
| Dry run on a real three-plan project | 1 h |

**7-9 h** — 6-8 h for the skill plus 1 h for the hook. The skill half sits between
the two earlier figures: 9 h assumed a methodology-sized skill and a tier argued
from scratch; 4-6 h assumed no skill at all. This is a focused ~120-line skill
plus a three-key manifest entry, with `skill-set-fidelity-refactor` absorbing the
assertion work and D2 removing the tier debate. Faster because the algorithm is
~40 lines with a reference implementation to read; slower if the dry run finds the
manifest wants a field the schema lacks.

## Verification

1. `pnpm --filter @bubstack/moe-core test` green with `sequencing-plans` in
   `authored:` — specifically the completeness/disjointness pair
   (`metadata.test.ts:237-244`), the untouched `imported:` drop-detectors, and the
   closure rule, which passes because the `writing-plans` mention is not REQUIRED.
2. `grep -c 'from: moe' packages/core/skill-tiers.yaml` returns 1, up from 0 —
   `skill-set-fidelity-refactor`'s own gate value, claimed by this item.
3. **`plugins/moe-core/hooks/plan-set` exists after `pnpm mint`**, alongside
   `plugins/moe-everything/hooks/plan-set` — the assertion that the lean plugin's
   hook is not pointing at a filtered-out script. `plugins/moe-core/skills/` must
   NOT contain `sequencing-plans`, per the existing core-tier emission assertion.
4. New vitest suite for `plan-set`, one fixture manifest per case: `next` on a
   diamond returns both middle ids once the root is `done`; a cycle exits
   non-zero naming the nodes; a `blocked` node's transitive dependents never
   appear in `next`; `check` fails on a duplicate id, an unresolvable dep, and a
   missing `plan:` file.
5. `plan-set` and `plan-set-notice` appear in both hardcoded allowlists (execute
   bit, `node --check`) — path lists, not on-disk discovery, so a new script is
   uncovered until added.
6. For the dry-run project, after `plan-set done` on plan 1 a fresh session with
   no prior context runs `plan-set next` and gets plan 2 — the context-reset
   claim tested as a command rather than asserted in prose.
7. A fresh session in a project with an incomplete `docs/moe/plans/*-MANIFEST.md`
   prints the hook's notice; the same session in a project with no manifest, and in one
   where every entry is `done`, prints nothing. The hook exits 0 in all three, and also
   when `plan-set` is missing or non-executable — a broken notice must never fail a
   session start.
8. `pnpm lint` and `pnpm build` green.

Sources: [A harness for every task: dynamic workflows in Claude Code](https://claude.com/blog/a-harness-for-every-task-dynamic-workflows-in-claude-code)
