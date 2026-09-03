---
name: writing-plans
description: Use when you have a spec or requirements for a multi-step task, before touching code
triggers: >-
  Load when you have approved requirements or a design and need to
  produce a multi-task implementation plan before coding. Do NOT load
  for: initial exploration or design (use `brainstorming` first),
  single-file changes, bug fixes, or when a plan document already
  exists and needs execution (`subagent-driven-development`).
---

# Writing Plans

## Overview

Write comprehensive implementation plans assuming the engineer has zero context for our codebase and questionable taste. Document everything they need to know: which files to touch for each task, code, testing, docs they might need to check, how to test it. Give them the whole plan as bite-sized tasks. DRY. YAGNI. TDD. Frequent commits.

Assume they are a skilled developer, but know almost nothing about our toolset or problem domain. Assume they don't know good test design very well.

**Announce at start:** "I'm using the writing-plans skill to create the implementation plan."

**At this depth:** `writing-plans` fires only at the `feature` depth
defined in `brainstorming` (patch / change / feature). A `patch` or a
`change` never produces a plan document — the design lives in chat and
the code follows directly.

**Context:** If working in an isolated worktree, it should have been created via the `using-git-worktrees` skill at execution time.

**Save plans to:** `docs/moe/plans/YYYY-MM-DD-<feature-name>.md`
- (User preferences for plan location override this default)

## Scope Check

If the spec covers multiple independent subsystems, it should have been broken into sub-project specs during brainstorming. If it wasn't, suggest breaking this into separate plans — one per subsystem. Each plan should produce working, testable software on its own.

When you do split into more than one plan, record the ordering in a committed
`docs/moe/plans/<project>-MANIFEST.md` so a fresh session on a partly-finished
project can read which plan is runnable next instead of guessing. The
`sequencing-plans` skill covers the manifest format and the `plan-set` CLI.

## File Structure

Before defining tasks, map out which files will be created or modified and what each one is responsible for. This is where decomposition decisions get locked in.

- Design units with clear boundaries and well-defined interfaces. Each file should have one clear responsibility.
- You reason best about code you can hold in context at once, and your edits are more reliable when files are focused. Prefer smaller, focused files over large ones that do too much.
- Files that change together should live together. Split by responsibility, not by technical layer.
- In existing codebases, follow established patterns. If the codebase uses large files, don't unilaterally restructure - but if a file you're modifying has grown unwieldy, including a split in the plan is reasonable.

This structure informs the task decomposition. Each task should produce self-contained changes that make sense independently.

## Task Right-Sizing

A task is the smallest unit that carries its own test cycle and is worth a
fresh reviewer's gate. When drawing task boundaries: fold setup,
configuration, scaffolding, and documentation steps into the task whose
deliverable needs them; split only where a reviewer could meaningfully
reject one task while approving its neighbor. Each task ends with an
independently testable deliverable.

## Bite-Sized Task Granularity

**Each step is one action (2-5 minutes):**
- "Write the failing test" - step
- "Run it to make sure it fails" - step
- "Implement the minimal code to make the test pass" - step
- "Run the tests and make sure they pass" - step
- "Commit" - step

## Plan Document Header

**Every plan MUST start with this header:**

```markdown
# [Feature Name] Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** [One sentence describing what this builds]

**Architecture:** [2-3 sentences about approach]

**Tech Stack:** [Key technologies/libraries]

**Spec:** [path to the spec/design doc this plan implements — the plan
argues from the spec, so the spec travels with it; executors read both]

## Global Constraints

[The spec's project-wide requirements — version floors, dependency limits,
naming and copy rules, platform requirements — one line each, with exact
values copied verbatim from the spec. Every task's requirements implicitly
include this section.]

## Open Decisions

[Questions this plan does NOT answer. A decision is not a work item: what it
produces is an answer, not a slice of the build. Delete this section only when
it is genuinely empty — an empty section and a missing one read differently to
an executor.]

- **D1 — [short name]** · `research` | `prototype` | `conversation` | `task` · HITL | AFK
  - **Question:** [the decision, stated precisely]
  - **Options:** [a] / [b]
  - **Recommendation:** [a], because [reason]
  - **Blocked by:** [other decision ids, or —]
  - **Blocks:** Task 3, Task 7
  - **Resolution:** [one line, filled in when answered]

## Not Yet Specified

[In-scope questions you can see coming but cannot yet phrase sharply. Write
them as loosely as the view allows; this doubles as a signpost for whoever
reads where the work is headed. Each patch graduates into one or more
decisions — or none — once an earlier answer makes it specifiable.]

## Out of Scope

[Work consciously ruled beyond the Goal. One line each, with why. Nothing here
graduates: if the Goal is redrawn, that is a fresh plan, not a resumption.]

---
```

## Task Structure

````markdown
### Task N: [Component Name]

**depends_on:** [task numbers this task depends on, or []]

**Blocked by:** D1  *(omit this line entirely when no decision blocks the task)*

**Files:**
- Create: `exact/path/to/file.py`
- Modify: `exact/path/to/existing.py:123-145`
- Test: `tests/exact/path/to/test.py`

**Interfaces:**
- Consumes: [what this task uses from earlier tasks — exact signatures, or `None`]
- Produces: [what later tasks rely on — exact function names, parameter
  and return types. A task's implementer sees only their own task; this
  block is how they learn the names and types neighboring tasks use. Use
  `None` when the task has no produced interface.]

- [ ] **Step 1: Write the failing test**

```python
def test_specific_behavior():
    result = function(input)
    assert result == expected
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/path/test.py::test_name -v`
Expected: FAIL with "function not defined"

- [ ] **Step 3: Write minimal implementation**

```python
def function(input):
    return expected
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/path/test.py::test_name -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/path/test.py src/path/file.py
git commit -m "feat: add specific feature"
```
````

## Decisions Are Not Tasks

A task delivers a slice of the Goal. A decision resolves a question, and what
it produces is an answer. The two need separate ledgers because a plan that
buries an unmade decision inside a step hands the executor an invented answer
with no record that anyone chose it.

**The four kinds of decision.** Each is either **HITL** — worked live with your
human partner, who speaks for themselves — or **AFK**, which you drive alone.
You never stand in for the human side of a HITL decision.

- **research** (AFK) — a fact from outside this working tree decides it.
  Dispatch a subagent to go and find it.
- **prototype** (HITL) — "how should it look?" or "how should it behave?" is
  the real question. Raise the fidelity of the discussion: build the cheapest
  rough artifact that makes the choice concrete, link it from the decision, and
  get a reaction to it.
- **conversation** (HITL) — the default. A judgement only your human partner can
  make. Put it to them with your recommendation, and wait.
- **task** (HITL or AFK) — manual work that must happen before a decision can be
  made at all: provisioning access, moving data so its shape is visible, signing
  up for a service so its API can be judged. This is the one kind that *does*
  rather than decides, and it earns its place by unblocking a decision, not by
  delivering the Goal. Its resolution records what was done plus any facts later
  decisions depend on.

**Decision or fog?** The test is whether you can state the question precisely
now — *not* whether you can answer it now.

- **A decision** when the question is already sharp, even if it is blocked and
  you cannot act on it yet.
- **Not Yet Specified** when you cannot yet phrase it that sharply. Do not
  pre-slice fog into decision-sized pieces: it is coarser than a decision, and
  one patch may graduate into several, or none.

**The rules:**

- **A gap you can state precisely is a decision, not a missing task.** Inventing
  an answer and writing it into a step is a placeholder wearing a code block —
  the same failure the next section names, and harder to spot.
- **A plan with unresolved decisions is not runnable.** Resolve them with your
  human partner before dispatching any executor. Filling in **Resolution** is
  what makes the plan dispatchable; until then, say so when you hand it over.
- **Work the frontier, not the list.** The frontier is the open decisions whose
  own **Blocked by** entries are all resolved — the ones answerable now.
  Resolving one pushes the frontier outward: it unblocks what depended on it,
  and may graduate a patch of **Not Yet Specified** into a fresh decision.
- **A decision that turns out to sit past the Goal is not resolved — it is ruled
  out.** Move it to **Out of Scope** with one line on why, and unblock the tasks
  that were waiting on it or delete them.

## No Placeholders

Every step must contain the actual content an engineer needs. These are **plan failures** — never write them:
- "TBD", "TODO", "implement later", "fill in details"
- "Add appropriate error handling" / "add validation" / "handle edge cases"
- "Write tests for the above" (without actual test code)
- "Similar to Task N" (repeat the code — the engineer may be reading tasks out of order)
- Steps that describe what to do without showing how (code blocks required for code steps)
- References to types, functions, or methods not defined in any task

## Self-Review

After writing the complete plan, look at the spec with fresh eyes and check the plan against it. This is a checklist you run yourself — not a subagent dispatch.

**1. Spec coverage:** Skim each section/requirement in the spec. Can you point to a task that implements it? List any gaps.

**2. Placeholder scan:** Search your plan for red flags — any of the patterns from the "No Placeholders" section above. Fix them.

**3. Type consistency:** Do the types, method signatures, and property names you used in later tasks match what you defined in earlier tasks? A function called `clearLayers()` in Task 3 but `clearFullLayers()` in Task 7 is a bug.

**4. Decision vs task:** Take every gap you listed in check 1 and sort it — is
it a missing task, or an unmade decision? A decision belongs in **Open
Decisions** with the tasks it blocks, never in a step as an invented answer.
Then check the edges resolve: every `**Blocked by:**` id names a decision that
exists, and every decision's **Blocks** list names tasks that exist.

**5. Execution metadata:** Validate every task has a `depends_on:` field (or
omits it, meaning []), a non-empty `Files:` block, an `Interfaces:` block,
and explicit `Consumes:` and `Produces:` entries. Resolve
[skills/subagent-driven-development/scripts/task-set.mjs](../subagent-driven-development/scripts/task-set.mjs) relative to
this loaded document and invoke it as `node <resolved-task-set.mjs> check <plan.md>` to validate
structural integrity — cycles, unresolvable deps, missing blocks.

If you find issues, fix them inline. No need to re-review — just fix and move on. If you find a spec requirement with no task, add the task — unless the task cannot be written until something is decided, in which case add the decision.

## Presenting the plan

The plan file on disk is already rung 4 (markdown) of the shared
native-rendering ladder in [skills/_shared/native-rendering.md](../_shared/native-rendering.md),
resolved relative to this loaded document.
Every executor path ends up reading that file, so no other rung is
required for the workflow to work.

When your human partner asks to review the plan visually — a browseable
table of tasks, a rendered dependency diagram — walk the ladder from
the top:

Rung 1 (the Claude Code `Artifact` tool) is not exposed — start at
rung 2 (the brainstorm browser companion) and drop to rung 3 (local
HTML file) or rung 4 (markdown file) when a browser is unavailable.


Never gate execution on the browseable form; the markdown
file is the source of truth.

## Execution Handoff

After saving the plan, use ask in the terminal to offer the execution choice:

**"Plan complete and saved to `docs/moe/plans/<filename>.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?"**

**If Subagent-Driven chosen:**
- **REQUIRED SUB-SKILL:** Use `subagent-driven-development`
- Fresh subagent per task + two-stage review

**If Inline Execution chosen:**
- **REQUIRED SUB-SKILL:** Use `executing-plans`
- Batch execution with checkpoints for review

**Either option uses the same two-rung execution ladder.** First use
worktree-isolated parallel dispatch when the gate holds: tasks' `Files:` blocks
are pairwise-disjoint, they share no `Consumes:` → `Produces:` edge, and every
worker has a pairwise-unique linked Git directory branched from one recorded
base SHA. If any worktree cannot be created or validated, dispatch the whole
wave sequentially. There is no unisolated-parallel rung.

`subagent-driven-development` (Wave grouping, Integrate the wave) and
`dispatching-parallel-agents` (Validate the plan before applying the gate, The
gate, The divergent-tree rule) define the mechanics. A plan missing `Files:`,
`Interfaces:`, `Consumes:`, or `Produces:` fails validation before either
execution option starts.
