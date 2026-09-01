---
slug: tiered-workflow-naming
title: Workflow Depth Levels And Their Names
idea: |
  - Examine GSD-core for skills to import
      - Explore tiered workflows with better naming, GSD uses fast, quick, and default. The idea is tier 1 is a fix that needs no more tracking or planning than the git commit. Tier 2 adds planning but does not verify/review. Tier 3 is the full monte.
status: done
size: M
estimate: 4-6 h
depends_on: [DO-NOW-1, DO-NOW-2, DO-NOW-3, skill-set-fidelity-refactor, verification-split-and-firing-rate]
blocks: [contributing-flow-docs]
conflicts_with: [verification-split-and-firing-rate, native-renderers, moe-tone-and-branding, parallel-execution-option, gsd-core-skill-import, tc-standards-conformance]
touches:
  - packages/core/skills/brainstorming/SKILL.md
  - packages/core/skills/writing-plans/SKILL.md
  - packages/core/skills/subagent-driven-development/SKILL.md
  - packages/core/skills/executing-plans/SKILL.md
  - packages/core/skills/using-moe/SKILL.md
  - packages/core/test/metadata.test.ts
decision_needed: no
---

# Workflow Depth Levels And Their Names

## The idea

> Explore tiered workflows with better naming, GSD uses fast, quick, and default. The idea is tier 1 is a fix that needs no more tracking or planning than the git commit. Tier 2 adds planning but does not verify/review. Tier 3 is the full monte.

The spec is already unambiguous, so the work is not deciding what the three levels
are — it is mapping them onto the skill chain that exists, naming them so a reader
can tell them apart, and keeping the word "tier" out of it. Two facts reshape the
idea once you look at the repo: `brainstorming` already ships a three-way classifier
this should extend rather than duplicate, and "tier" is already spoken for three
times over, so a fourth meaning is a naming defect whatever the levels get called.

## Debate-review decisions (2026-08-31)

- **Depth no longer has to relax `verification-before-completion`.** The
  "Consequence for implementation" line — `patch` and `change` drop from *a pass*
  to *inline evidence* — was the price of scaling ceremony. It is no longer
  needed: `verification-split-and-firing-rate` Part A puts the mechanical
  evidence floor in a `Stop` hook, which costs nothing to leave on at every
  depth. Only the prose half scales. Depth and model tier are different axes and
  this keeps them from being conflated.
- **The `dispatching-parallel-agents` row changes.** It stays `tier: everything`
  — the promotion in `parallel-execution-option` is rejected — so it is no longer
  true that "every reader will have it." The row stays (it is real at `feature`
  depth) but the parenthetical justifying it by decision #6 does not.
- **One line each on failure polarity is worth adding to the depth table.**
  Gold-plating is the `patch`-depth risk; stub-and-declare is the `feature`-depth
  risk. Both catches already ship — anti-stub at `writing-plans:131-138`,
  anti-over-engineering at `receiving-code-review:88-97` — so this is labelling,
  not new content. ARCHITECTURE.md §2 records why this maps onto depth rather
  than onto model tier.

## Why it matters

The tier-3 chain below is ten skills deep, and today it is the only documented path.
For a one-line config fix the reader either runs all ten or silently runs none — and
"silently runs none" is what actually happens, which is how a fork of a process
library ends up with a process nobody follows. Naming a legitimate shallow path turns
undocumented corner-cutting into a declared choice a reviewer can see. For ~20 people
sharing one skill set that visibility is the point: "this was `patch` depth" is a
reviewable claim, "I skipped the plan" is not.

## Current state

### The tier-3 spine exists and chains cleanly

Read in the core worktree (`.claude/worktrees/wf_238bb49d-362-13/packages/core/`;
`packages/core/` on `main` is a stub for this package). The chain, with the edges
that make it a chain rather than a list:

| Step | Skill | Edge that pulls it in |
|---|---|---|
| 0 | `using-moe` | bootstrap; `moe-mint.yaml` `bootstrap: { skill: using-moe }` |
| 1 | `brainstorming` | its own description: "You MUST use this before any creative work" |
| 2 | `writing-plans` | `brainstorming/SKILL.md:44-48` — architectural path ends in it |
| 3 | `using-git-worktrees` | step 0 of both execution paths: `executing-plans/SKILL.md:19`, `subagent-driven-development/SKILL.md:127` |
| 4 | `subagent-driven-development` *or* `executing-plans` | `writing-plans/SKILL.md:166,170` — two REQUIRED SUB-SKILLs, exactly two options |
| 5 | `test-driven-development` | inside each implementer task |
| 6 | `requesting-code-review` | `subagent-driven-development/SKILL.md:88,117,118` — per-task review and a final whole-branch review |
| 7 | `receiving-code-review` | fires on findings arriving; no skill names it |
| 8 | `verification-before-completion` | fires on its own trigger; the only chain edge is `systematic-debugging/SKILL.md:189` |
| 9 | `finishing-a-development-branch` | `executing-plans/SKILL.md:37` REQUIRED SUB-SKILL; `subagent-driven-development/SKILL.md:487` |

All ten are lean-tier (`skill-tiers.yaml`), so every reader with the lean plugin has
the whole spine installed. There is no shallower path documented anywhere.

### `brainstorming` already classifies — by work shape

`brainstorming/SKILL.md:22-51` defines **Three Paths** — `spike` (feasibility
question, "anything you built stays labeled throwaway"), `bounded` ("a well-scoped
change to code that already exists in this repo... No spec file, no implementation
plan document"), `architectural` (full process, written spec, then `writing-plans`).
The reader must "say the classification out loud... so your human partner can override
it" (`:24-27`), and escalation is one-way (`:50-52`). What it does not cover is the
*execution* half: nothing in `bounded` says whether to dispatch a reviewer or run a
verification pass. That gap is exactly the idea's tier 2. Its Red Flags table at
`:66-73` is worth reading before choosing names — six of seven rows are a person
arguing about the label to get out of work.

### There is no machinery to hang tiers on

`grep -rE '\.planning|STATE\.md|moe-tools' packages/core/skills/` returns nothing: no
state file, no `.planning/` directory, no runtime shim. The only hook is an opt-in Stop
judge gated on `MOE_LATTE_ENABLED` (`hooks/claude-judge-continuation:14-19`), unrelated
to depth. And `moe-mint.yaml` states plainly: "This package has no `commands/`, no
`agents/` and no `.mcp.json`." So depth today can only be *which skills fire*, announced
in prose — no slash command, no tracking row, because neither exists yet.

### "tier" is already overloaded three ways

**Packaging** — `skill-tiers.yaml`'s `tier: core` / `tier: everything`, the lean/full
plugin split (13 of 27), enforced by the three tests under `describe("the lean/full
curation")` in `test/metadata.test.ts`, whose count lives in one constant,
`LEAN_TIER_BUDGET`. Cite that file by symbol name, not by line: it grew ~330 lines across
`skill-set-fidelity-refactor` and every line number in it has already moved once.
Checked and clean: that item added a second axis to the YAML — `imported:` (frozen, 27
entries) vs `authored:` (open, `{}`) — but that is *provenance*, orthogonal to both
packaging and depth, and it does not want the word.
**Model selection** — `subagent-driven-development/SKILL.md:199-214`, "small fix diffs
take a cheap-to-mid tier", "a model at least one tier above". **Auditor fan-out** —
`iterative-development/SKILL.md:59,163`, "three-tier: deep evidence + impacted
behavior + sentinel corpus". A fourth meaning makes the word useless, and
`brainstorming/SKILL.md:160` already says "architectural-path **depth**" in exactly
the sense this idea needs.

### What GSD actually ships

Three separate things are named Moe; the one relevant here is `~/.claude/moe-core`
(VERSION `0.0.1`), **not** `~/Code/moe` (this fork) and **not** `~/Code/tools/moe`.
Its GSD lineage is in the identifiers — `formatGsdSlash`, `commandsGsdDir`,
`dispatchGsdCommand` in `bin/lib/*.cjs` (camelCase `Gsd`, which is why a lowercase
`grep gsd` finds nothing). Its rebranded commands are the `moe-fast` / `moe-quick` /
`moe-autonomous` skills installed in this session.

`workflows/fast.md` (118 lines) is inline — no subagents, no `PLAN.md`, no research,
guardrail "If the task takes more than 3 file edits, STOP and redirect to /moe-quick",
then a commit and a `STATE.md` row. `workflows/quick.md` (780 lines) spawns
`moe-planner` + `moe-executor`, writes `.planning/quick/`, and skips discussion,
research, plan-checking and verification unless `--discuss` / `--research` /
`--validate` (or `--full`) add them back. There is no third command: GSD moved from
`gsd-build/get-shit-done` to [`open-gsd/gsd-core`](https://github.com/open-gsd/gsd-core)
(MIT), whose `commands/gsd/` holds `fast.md` and `quick.md` and **no `default.md`**, and
whose README documents a five-phase loop with no speed tiers at all.

**Judgment on `fast` / `quick` / default — three defects, all avoided by Zak's names.**
`fast` and `quick` are dictionary synonyms, so choosing between them means recalling a
convention rather than reading a name, and the distinction that actually matters —
*inline vs. subagent-planned* — is in neither word. The heaviest, most common level has
no name at all, so it cannot be asked for. And `quick --full` re-adds everything, so
levels 2 and 3 overlap through a flag and the boundary this idea wants is never drawn.
`patch`/`change`/`feature` are three distinguishable words for three named levels, which
is the whole fix.

## Prerequisites

**DO-NOW-1** — `core` is on `import/packages-core` in a worktree; every file this item
edits is in that package. **DO-NOW-2** — the lean/full decision changes which spine
skills a lean-plugin reader actually has: if `executing-plans` moves to `everything`,
`change` depth loses its cheap execution path. The depth table has to be written against
the settled edition split, not the proposal. **DO-NOW-3** — until `moe-mint` generates
`/plugins/`, edited skills reach nobody.

`gsd-core-skill-import` owns whether GSD text may be imported. This item imports none
— it is design and naming — but if that census finds `fast.md`/`quick.md` adaptable
verbatim, the approach here changes from "author" to "port", so let it land first.
One datum for it: upstream gsd-core is MIT.

`skill-set-fidelity-refactor` has landed in full (Part A `75dc87c`, Part B `796233e`,
HEAD `e3a4737`): `skill-tiers.yaml`'s `skills:` map is now `imported:` (frozen 27) plus
`authored:` (open, `{}`), the 27-name equality is re-aimed at `imported:` alone, and the
lean count is the named constant `LEAN_TIER_BUDGET`. This item adds no skill, so it does
not strictly need that — but the mechanism section below assumes adding one is
*permitted*, and the follow-on `commands/` item does need it.

`verification-split-and-firing-rate` (scheduled ahead of this item) is now a
**prerequisite rather than a collision**. Its Part A puts the mechanical evidence floor in
a `Stop` hook, which is what lets depth stop relaxing
`verification-before-completion` — so this item no longer edits that skill, and the
`touches` list above dropped it. What remains shared is `test/metadata.test.ts`, hence the
`conflicts_with` entry both docs carry. Its firing-rate counter is also the only way to
find out whether the depths get used once they ship, which is worth knowing before anyone
builds the `commands/` follow-on.

The false-rationale defect this doc flagged in `dispatching-parallel-agents`' `why:`
block — it claimed subagent-driven-development "already covers the parallel case" when
`subagent-driven-development/SKILL.md:282` forbids it outright — **has been fixed**, and
the rewritten block cites that exact line. Correcting my own earlier attribution: the fix
is commit `0b1571d`, "core: settle the lean/full tiering, and delete the rule whose
premise was false" — DO-NOW-2's landing — not `skill-set-fidelity-refactor`'s `75dc87c`,
which touched no entry body. Nothing left for this item to do there.

On the tier question, correcting an overstatement of mine: `0b1571d` did **not** settle
it. Its body says "Held at `everything` **for now** rather than promoted... moving the
tier now would move it twice", and the `why:` block says "HELD at everything for now, but
on a corrected and much weaker basis" and "Promotion to core is part of the
parallel-execution-option work." That is a provisional hold with a named revisit
condition, not a closed question, and the "for now" plus the forward pointer are load-
bearing — whoever edits that block should keep both rather than "state the settled
answer."

What closed it is later, and it is ratified in the repo rather than only in this doc:
`PARITY.md:90` on **main**, under `### Inherited skills, resolved` (`:77`), reads "**Keep
at `everything`** — which is `skill-tiers.yaml`'s own criterion. See
`parallel-execution-option`", and `parallel-execution-option`'s own doc says "**The tier
promotion is rejected.**", recorded against PARITY.md and ARCHITECTURE.md §2. So the yaml
block is stale — not because its hedging is leftover, as I first said, but because it
still advertises a promotion that has since been rejected. Net effect for this item is
unchanged (stays `everything`, lean count stays 13). The parallel *prohibition* remains
genuinely open and remains `parallel-execution-option`'s.

**Read authority documents on `main`, not in a worktree.** I first reported that PARITY.md
never mentions this skill, having grepped it inside the core worktree. That tree's
PARITY.md is 276 lines; main's is 315, and the `### Inherited skills, resolved` section
does not exist in the worktree at all. Worse, the surrounding line numbers agree while the
content differs completely — `:86-92` in the worktree is an unrelated licensing passage —
so a line-numbered citation into PARITY.md can resolve to real text and still be the wrong
text. `packages/core/**` in this doc is read from the core worktree deliberately, because
that is where the package lives; `PARITY.md` and `ARCHITECTURE.md` are read from `main`,
because that is where they live.

**Do not cite wave IDs in source files.** *(FIXED on main: `skill-tiers.yaml`'s
`dispatching-parallel-agents` `why:` block now cites the slug and carries this
rule inline, including why the original was not a typo. The line numbers below
are left as written because they were accurate in the tree this was drafted
against; on main the block is ~19 lines earlier, which is itself the argument.)*

`skill-tiers.yaml:204-205` said "See
`.planning/backlog/W01P01 - parallel-execution-option.md`", and `0b1571d`'s body says
".planning/backlog/W01P01 reopens exactly that prohibition". Neither is a typo: when that
commit was written, `W01P01` *was* `parallel-execution-option`. The orchestrator has since
re-planned — `W01P01` is now `skill-set-fidelity-refactor` and the slug moved to `W07P03`
— so a correct citation was invalidated from outside the file. Swapping `W01P01` for
`W07P03` restores it only until the next re-plan, and the plan has already renumbered once
mid-session. Cite the **slug** (`parallel-execution-option`), never the wave ID. Same
principle as citing `LEAN_TIER_BUDGET` by name instead of a line, and it is why this doc
names slugs throughout. `main:PARITY.md:90` already does it right — its pointer is the bare
slug. The same rot is visible one row up at `PARITY.md:89`, which cites
`metadata.test.ts:475` for the closure test; that test has moved to `:687` and `:475` is
now `it("every shell script and node script parses")` — a citation that still resolves, to
the wrong thing. Cite `it("no core-tier skill REQUIREs an everything-tier skill")` by name.
`parallel-execution-option` owns that fix.

Both numbers in that example are already provisional — they are `e3a4737`'s, and an earlier
draft of this paragraph had the closure test one line off. That is the argument, not an
aside: a line number is wrong the moment someone edits above it, and a reader cannot tell a
stale line number from a live one because both resolve to real code.

## Proposed approach

### Vocabulary: which concept gives up the word "tier"

**The workflow concept gives it up — it never takes it.** Call the axis **depth**.
`skill-tiers.yaml`'s packaging meaning is already in a file name, a YAML key and
three tests (`test/metadata.test.ts:452-495`); the workflow meaning has zero lines of
anything. The concept with zero rename cost should rename, and that is the one not
yet written. `brainstorming/SKILL.md:160` already uses "depth" this way, so it is a
continuation, not a coinage. Renaming `skill-tiers.yaml` to editions is defensible
but buys nothing extra and puts this item inside DO-NOW-2's file.

### The three level names — SETTLED

**`patch` / `change` / `feature`.** Zak's decision. `change` was chosen over his first
pick `task` specifically to avoid a fourth collision of the same class as "tier":
`task` is already the unit inside a plan (`writing-plans/SKILL.md:85-96` — `### Task N:`
with its Files / Interfaces / Consumes / Produces blocks) and it is most of a skill
name (`implementing-tasks`). Naming a depth `task` would have meant "task" denoting
both a whole workflow and one checkbox inside that workflow's plan.

Considered and declined: my recommendation of `commit-only` / `planned` / `reviewed`,
named for the artifact each level adds so the claim is falsifiable against the repo.
Zak's judgment is that work-shape labels read better here. Recording the trade-off he
accepted rather than re-arguing it: a work-shape name is negotiable in a way an
artifact name is not, so the Red Flags table at `brainstorming/SKILL.md:66-73` — six
rows of people arguing a work-shape label down to get out of work — is the failure
mode to watch, and it argues for adding a `patch`/`change`/`feature` row to that table
as part of this item.

The upside of his choice, which my scheme did not have: `patch`/`change`/`feature` are
work-shape nouns in the *same register* as `brainstorming`'s existing
spike/bounded/architectural. That makes them absorbable into the classifier that
already exists instead of sitting awkwardly beside it — see the mechanism section, and
the open question about whether they supersede those three or coexist with them.

### What each depth runs

| Spine step | `patch` | `change` | `feature` |
|---|---|---|---|
| `using-moe` | yes | yes | yes |
| `brainstorming` (classify + approval) | yes — design is 1-2 sentences in chat | yes | yes — written spec |
| `writing-plans` | no | yes | yes |
| `using-git-worktrees` | no — change in place | yes | yes |
| execution path | inline, no subagents | `executing-plans` | `subagent-driven-development` |
| `test-driven-development` | yes | yes | yes |
| `systematic-debugging` | fires on any bug, at every depth | " | " |
| `dispatching-parallel-agents` | no | no | when tasks are genuinely independent |
| `requesting-code-review` | no | no | yes |
| `receiving-code-review` | no | no | yes |
| `verification-before-completion` | mechanical floor at every depth (hook); prose judgment scales | " | " — plus the full prose pass |
| `finishing-a-development-branch` | no — commit lands where you are | yes | yes |
| **failure to watch for** | gold-plating a two-line fix | scope creep past the plan | stub-and-declare |
| **catch that already ships** | `receiving-code-review:88-97` YAGNI check | both | `writing-plans:131-138` No Placeholders |

`dispatching-parallel-agents` keeps its row because the behaviour is real at `feature`
depth, not because every reader will have the skill — the promotion to lean is **rejected**
and it stays `tier: everything` (`main:PARITY.md:90` and `parallel-execution-option`'s own
decision record — not `0b1571d`, which held it only provisionally). The row is narrow for a
second reason: the everyday flow bans parallel *implementation* subagents outright
(`subagent-driven-development/SKILL.md:282`), so it can only cover independent work
outside that ban. `parallel-execution-option` owns the wording.

The last two rows are labelling, not new behaviour. Depth predicts *which way* work fails:
at `patch` the risk is gold-plating a two-line fix, at `feature` it is stub-and-declare.
Both catches already ship — `receiving-code-review:88-97` is a YAGNI check that greps for
actual usage before "implementing properly", and `writing-plans:131-138` ("No
Placeholders") forbids "TBD", "add appropriate error handling" and steps that say what
without showing how. Naming the polarity per depth is the whole addition.

### The line depth must not cross — SETTLED

**Decision #25: the approval gate stays at every depth**, and the formulation below is
now backed by that decision rather than proposed by this doc.

**Depth scales artifacts and delegation, never gates.** At `change` depth nobody
dispatches a reviewer subagent and nobody runs a separate verification pass — but the
agent still gets approval before implementing and still runs the tests it claims pass.
That distinction is what makes this a depth system rather than a licence to skip.

The two gates it protects are written to be unscalable, so any depth row that
contradicted them would be contradicted right back by an installed skill in the same
session. `brainstorming/SKILL.md:14-20` is a `<HARD-GATE>`: "the ceremony scales with
the task; the approval gate never does." And `verification-before-completion`'s
description is "evidence before assertions always", with "Violating the letter of this
rule is violating the spirit of this rule" in its body.

Consequence for implementation: **nothing.** An earlier draft of this doc had `patch`
and `change` relax `verification-before-completion` from *a pass* to *inline evidence*.
That is withdrawn — `verification-split-and-firing-rate` Part A moves the mechanical
evidence floor into a `Stop` hook, which costs nothing to leave armed at every depth, so
only the prose judgment half scales. Depth stops needing to touch that skill at all,
which also keeps depth from being conflated with model tier. Nothing touches the approval
gate either. This item edits no gate.

### Mechanism, re-weighed after new skills were permitted

**What changed.** My earlier recommendation rested on two legs. The first was that
`test/metadata.test.ts` admitted exactly the 27 upstream skills — an equality assertion
on the name set, so any added skill failed it — which disqualified all three
skill-adding mechanisms outright. Zak decided new skills are permitted, and
`skill-set-fidelity-refactor` has since re-aimed that equality at `imported:` alone.
**That leg is gone and I am not going to pretend otherwise.**

The second leg was "cheaper, and avoids two classifiers that can disagree." On
inspection that leg is weaker than I framed it: it is an argument against adding a
*second classifier*, not against adding a *skill*. A new skill could be the single
authoritative classifier with `brainstorming` delegating to it. So neither original leg
carries the recommendation on its own now.

**The conclusion holds anyway, on a different argument.** Zak's names are the reason.
`patch`/`change`/`feature` are work-shape nouns, and `brainstorming` already classifies
by work shape into spike/bounded/architectural. Standing a second work-shape vocabulary
up in a separate skill means two near-parallel-but-unaligned classifications of the same
task at the same moment, announced out loud, each with its own ratchet. That is the
third instance of the collision class this item exists to fix — after "tier" (three
meanings) and "task" (avoided by picking `change`). The cheap way to not create it is
for the new names to land *inside* the existing classifier. So: **extend
`brainstorming`**, and `writing-plans` / `subagent-driven-development` /
`executing-plans` each gain a short "at this depth" note.

**Why the other two lose on their own merits, assertions aside.** *One skill with three
modes* is precisely the second classifier, and it collides on trigger for the same reason
three skills do — one description claiming "use when classifying how much process this
needs" against `brainstorming`'s existing claim on the same moment. *A router* adds that
same colliding description and still has nothing to route to but skills the model can
already reach; the GSD-lineage Moe carries three routers (`workflows/do.md`,
`smart-entry.md`, `next.md`) because it has ~70 commands and a `STATE.md` to route
against, and this fork has neither. Neither was ever held up only by the test wall.

**Retraction: my description-cost argument against three skills is dead.** I argued
three new descriptions would be ~+20% on a lean budget, citing `skill-tiers.yaml`'s ERR
SMALL rule. That rule was **deleted on 2026-08-31** with measurements
(`skill-tiers.yaml:24-33`): all 27 name+description pairs are 5,914 characters, ~1,480
tokens, and that is the entire resident cost because bodies load on demand. Shipping all
27 in the lean plugin costs ~1.5k tokens a session. Three more descriptions is on the
order of 80 tokens. The file's own words: "a rule that cites a cost it does not have will
keep producing demotions nobody can defend." Retracted — token cost is not an argument
against anything here.

**But its replacement rule is a much better argument, and it is the repo's own.**
`skill-tiers.yaml:35-42` installs **TRIGGER COLLISION** as the tiebreak: a skill goes to
`everything` "only if the skill's description claims a trigger a core-tier skill already
claims," because "Two skills asserting the same 'use when …' is what actually degrades
selection: the model picks one, and which one is not something the author controls."
Three skills named `patch`/`change`/`feature` would each claim a trigger — "use when the
work is a patch" — that `brainstorming` already claims, since classifying the work is
precisely what its Three Paths do. That is a textbook trigger collision under the rule
the fork just codified, and it is the same objection as "two classifiers that can
disagree", now stated as dispatch quality rather than my weaker cost framing.

**So three separate skills is deferred and reframed as three commands.**
`patch`/`change`/`feature` are addressable, imperative nouns; every one of the 27 existing
skills is a gerund phrase naming an activity. A skill named `feature` whose description
reads "Use when the work is a feature" is a classifier wearing a skill's clothes — and it
collides. Those are *command* names, which is exactly what GSD's `fast`/`quick` are, and
what makes a depth invocable by name (my earlier open question 3, answered: yes, and
Zak's naming choice is the evidence). Commands have no description competing in the skill
dispatcher, so the collision does not arise there. `moe-mint.yaml` records that this
package has no `commands/`, so that is the follow-on item, after DO-NOW-3 proves the mint
pipeline.

**Net: the recommendation did not move, but it is now a sequencing claim rather than a
prohibition.** Depth selection lands in `brainstorming` now; depth becomes invocable as
commands later. If Zak would rather do it once, the whole item should wait for the
`commands/` decision instead of being done twice.

## Scope boundary

**In:** the depth vocabulary and the three level names; the depth table above landed into
`brainstorming`, including its two failure-polarity rows; per-depth notes in
`writing-plans`, `executing-plans`, `subagent-driven-development`; a test asserting no
SKILL.md uses "tier" for workflow depth.

**Out:** importing or adapting any GSD file (`gsd-core-skill-import`); renaming
`skill-tiers.yaml`'s `tier:` key or moving any skill between editions (DO-NOW-2 and
`parallel-execution-option`); adding `commands/` to `packages/core` so
`patch`/`change`/`feature` become slash-invocable — that is the follow-on item, and the
place three separate skills becomes the right shape; authoring any fork-original skill
(`skill-set-fidelity-refactor` makes it possible, this item still does not do it); any
state file or depth-tracking artifact (`deterministic-task-dag` owns durable
multi-phase state); making the reviewer dispatch parallel or configurable
(`parallel-execution-option`); how the depth announcement is rendered to a human
(`native-renderers`); tone and voice of the new prose (`moe-tone-and-branding`); and
the end-to-end "what to run when" narrative (`contributing-flow-docs`, which is
blocked on these names existing).

## Open questions for Zak

Answered and closed: the names are `patch`/`change`/`feature`; the approval gate stays
at every depth (#25); new skills are permitted (#2); depth will be invocable by name,
as commands, in a follow-on item.

**ANSWERED 2026-08-31 (Zak): SUPERSEDE.** `patch`/`change`/`feature` becomes the one
work-shape classifier. `spike` survives as a modifier — "a spike is a `patch` whose
output you discard" — because its distinguishing property is that the output is thrown
away, which is orthogonal to depth and therefore does not collide.

Consequences this item now owns:

- **+1-1.5 h for a reference sweep.** Every citation of `spike`/`bounded`/
  `architectural` has to be found and updated. This is a rename of *inherited*
  behaviour, so the sweep is the deliverable, not a tidy-up: a half-renamed vocabulary
  is worse than either whole one, because both sets then appear live.
- **Sweep by name, not by line.** `brainstorming/SKILL.md:22-51` is the anchor today and
  will move. Cite the Three Paths section by its heading text.
- The rationale is the repo's own rule: two work-shape vocabularies in one skill is a
  TRIGGER COLLISION, and coexist would have produced nine cells nobody holds while
  re-creating the collision this item exists to remove.

*The original fork, kept because it is the reasoning the answer rests on:*

1. **Do `patch`/`change`/`feature` supersede `spike`/`bounded`/`architectural`, or sit
   beside them?** `brainstorming/SKILL.md:22-51` already classifies every task into
   three work shapes, out loud, with a one-way ratchet. The new names are the same kind
   of word doing a related job, and the two sets do not align cleanly: `bounded` ≈
   `change`, `architectural` ≈ `feature`, `patch` sits *below* `bounded` (a bounded task
   still gets a design in chat), and `spike` is orthogonal to all of it because its
   output is thrown away. Three ways to resolve it:
   - **Supersede** — `patch`/`change`/`feature` becomes the one classifier; `spike`
     survives as a modifier ("a spike is a `patch` whose output you discard"). Cleanest
     to read, but it renames an inherited concept, so anything citing spike/bounded/
     architectural has to be found and updated.
   - **Coexist** — two orthogonal axes, design shape × execution depth, nine cells.
     Honest about the two questions being different; nine cells is more than anyone
     will hold, and it re-creates the collision this item exists to remove.
   - **Map** — treat the new names as a rename of the old paths and accept the
     imperfect fit, adding `patch` as a fourth shallow path.

   My recommendation is **supersede**, because the coexist option puts two work-shape
   vocabularies in one skill and that is the defect pattern we have now hit three times.
   But it is a rename of inherited behaviour, so it is Zak's call, not mine.

## Effort

| Step | Time |
|---|---|
| Settle whether `patch`/`change`/`feature` supersede spike/bounded/architectural (the one open question) | 20-30 min |
| Depth section into `brainstorming/SKILL.md`, wired into the existing Three Paths rather than bolted beside them | 1-1.5 h |
| Per-depth notes in `writing-plans`, `executing-plans`, `subagent-driven-development` | 45 min |
| Failure-polarity rows, labelling the two catches that already ship | 20 min |
| Tests in `test/metadata.test.ts` (see below) | 45 min |
| Read-through for contradictions against the two hard gates | 30 min |

**Slower if:** DO-NOW-2 moves any of the ten spine skills between editions, which
invalidates the depth table's availability assumptions; or the open question resolves to
**supersede**, which adds a sweep for every reference to spike/bounded/architectural
across the 27 skills and the docs that cite them — call that another 1-1.5 h.

## Verification

- `pnpm --filter @bubstack/moe-core test` green, including a case that greps every
  `skills/*/SKILL.md` for `tier` and fails on any use that is not model selection
  (`subagent-driven-development`) or auditor fan-out (`iterative-development`) — the
  depth work introduced no fourth meaning.
- A second case asserting the three depth names appear in `brainstorming` and in each
  of `writing-plans`, `executing-plans`, `subagent-driven-development`, so a level
  cannot exist in one skill and be unknown to the next.
- `grep -c 'REQUIRED SUB-SKILL' skills/*/SKILL.md` unchanged from the counts at
  `writing-plans/SKILL.md:61,166,170` and `executing-plans/SKILL.md:37` — depth adds
  levels without cutting a chain edge, so no reader hits a dead end.
- This item's diff touches neither `imported:` in `skill-tiers.yaml` nor the pinned
  27-name literal that `it("pins the IMPORTED skill set at exactly 27")` compares against,
  leaves `authored:` as `{}`, and does not move `LEAN_TIER_BUDGET`. It edits inherited
  skills in place and authors none, so any of those moving means the mechanism was widened
  into adding a skill and the `commands/` follow-on was done early.
- Manual: read `brainstorming/SKILL.md` end to end, confirming no depth row
  contradicts the `<HARD-GATE>` at `:14-20`.
