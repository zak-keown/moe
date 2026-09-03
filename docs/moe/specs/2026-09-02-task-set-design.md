# Intra-Plan Task DAG (`task-set`)

Deterministic task scheduling within a single plan: wave grouping,
ready-set computation, and structural validation — the same thing
`plan-set` does across plans, done one level down.

**Status:** Design. Implementation has not started.

**Scope:** One CLI (`task-set`), one format addition to the plan task
structure (`depends_on:`), test coverage, and a wiring update to
`subagent-driven-development`. Does not touch inter-plan sequencing
(`plan-set`), plan authorship (`writing-plans` gets a one-line format
change), or SDD's dispatch/review/integration loop.

**Evidence baseline:** The scoping conversation examined `plan-set`
(445 lines, `packages/core/hooks/plan-set`), the `sequencing-plans`
skill, the `writing-plans` task structure, `subagent-driven-development`'s
wave-grouping logic, `dispatching-parallel-agents`' gate definition,
and real `Consumes:`/`Produces:` data in the moe-memory plan set.

## Problem

`plan-set` solved the inter-plan ordering problem: a fresh session runs
`plan-set next` and gets the runnable plan instead of re-deriving order
from prose. The same problem exists one level down.

Inside a plan, SDD groups tasks into waves by having the LLM read every
task's `Files:`, `Consumes:`, and `Produces:` blocks, mentally compute
which tasks share no edges or file overlaps, and produce a wave table.
This is Kahn's algorithm done in the model's head, re-derived on every
context reset. It is the exact failure mode `plan-set` was built to
fix — "on a context reset the agent re-derives the order from prose,
which is the single most expensive failure observed."

## Decision

Add an explicit `depends_on:` field to the plan task structure. The
machine reads edges from `depends_on:`; the `Consumes:`/`Produces:`
prose stays for human readability.

The alternative — parsing symbol names out of natural-language
`Consumes:`/`Produces:` lines — was rejected. The prose is not
structured enough for reliable edge detection, and false negatives
(missed dependency leading to unsafe parallel dispatch) are worse than
false positives (unnecessary serialization). The same design reasoning
produced `plan-set`'s manifest: explicit `depends_on:` lists, not
inference from plan prose.

## Format change

One new optional field in the task structure defined by `writing-plans`:

```markdown
### Task N: [Component Name]

**depends_on:** [2, 3]

**Files:**
- Create: `exact/path/to/file.py`
...

**Interfaces:**
- Consumes: [prose, unchanged]
- Produces: [prose, unchanged]
```

Rules:

- `depends_on:` is a bracket-delimited list of task numbers: `[2, 3]`
  or `[]`. Integers only, referring to task N in the same plan.
- Omitting the field is equivalent to `[]` (no dependencies). Existing
  plans without `depends_on:` are valid — every task is independent,
  forming one wave.
- The field is derived from `Consumes:`/`Produces:` at plan-writing
  time. If Task B consumes an interface Task A produces, B's
  `depends_on:` includes A's number.
- `Blocked by:` (decision blocks) remains separate and unchanged. A
  task blocked by an unresolved decision is not in the DAG at all — it
  is excluded from wave computation until the decision resolves.
- `depends_on:` sits above `Files:` and below the task heading, on the
  same line as `Blocked by:` when both are present.

Example from the moe-memory-01 plan, annotated:

```
Task 1: Narrow the Public Library Contract    depends_on: []
Task 2: Pin and Resolve Native Assets         depends_on: []
Task 3: Port the Store to DatabaseSync        depends_on: [2]
Task 4: Make Transactions Exception-Safe      depends_on: [3]
Task 5: Add Cross-Process Database Leases     depends_on: [3]
```

Tasks 1 and 2 have no deps → Wave 1 (if `Files:` are disjoint).
Task 3 depends on 2 → Wave 2.
Tasks 4 and 5 both depend on 3 → Wave 3 (if `Files:` are disjoint).

## The `task-set` CLI

A single extensionless Node script at `packages/core/hooks/task-set`,
sibling to `plan-set`. Same constraints: Node built-ins only, no
dependencies, ships as a plugin hook.

### Verbs

**`task-set check <plan.md>`**

Validate structural integrity:

- Every `depends_on:` reference resolves to a task number that exists.
- No cycles (Kahn's algorithm).
- Every task has a `Files:` block.
- Every task has `Consumes:` and `Produces:` entries.
- No duplicate task numbers.

Exits non-zero on any failure. A cycle names its tasks on stderr.

**`task-set waves <plan.md>`**

Compute and print the wave assignment. A wave is a maximal set of
tasks where:

1. No task in the set depends on another in the set (no
   `depends_on:` edge within the wave).
2. No two tasks in the set share a path in their `Files:` blocks
   (disjoint files).

Output format, one line per wave:

```
wave 1: 1, 2
wave 2: 3
wave 3: 4, 5
```

Tasks within a wave are listed in plan order. A task whose `Blocked
by:` names an unresolved decision is excluded from wave output with a
note on stderr.

**`task-set next <plan.md>`**

Print the ready set: task numbers whose dependencies are all complete
and whose own steps are not all checked. Reads checkbox state from the
plan file (`- [x]` vs `- [ ]`).

A task is complete when every step checkbox in that task is checked. A
task is ready when all tasks in its `depends_on:` are complete and at
least one of its own checkboxes is unchecked.

Output: one task number per line. Empty output means either all tasks
are done or nothing is unblocked.

### Completion model

`task-set` reads checkbox state directly from the plan markdown.
`plan-set` uses a `done` verb that mutates the manifest; `task-set`
does not need one because the plan file's checkboxes are already the
mutation surface — SDD and `executing-plans` both check boxes as they
go.

This means `task-set next` is always consistent with the plan file on
disk. No separate state file, no ledger to sync.

## Integration with SDD

SDD's "Produce the wave list from the scan table" step becomes:

```bash
node "${CLAUDE_PLUGIN_ROOT}/hooks/task-set" waves "$PLAN_PATH"
```

The LLM no longer manually computes wave assignments. It reads the
output, validates it against its own understanding (a sanity check, not
a gate), and dispatches accordingly.

SDD's `task-set next` call replaces the manual "which tasks are ready"
scan on context reset.

The dispatch, review, and integration steps remain unchanged — `task-set`
answers "what's ready," SDD handles "how to run it."

## What this does not cover

- **Cross-manifest chaining.** Two manifests depending on each other is
  a separate problem (prose-only today). Not addressed.
- **Parallel dispatch mechanics.** `task-set waves` computes which
  tasks *could* run in parallel. Actually dispatching them in parallel
  remains gated on `parallel-execution-option` and the worktree
  machinery in `dispatching-parallel-agents`.
- **Progress metrics.** No velocity, estimates, or time tracking.
- **Graph visualization.** Possible future work but not in scope.
- **Backfilling `depends_on:` into existing plans.** Existing plans
  without `depends_on:` are valid (all tasks independent). Backfill is
  optional and manual.

## Constraints

- Node built-ins only. The CLI ships as a plugin hook.
- Plan markdown format is the parser's input. The parser must tolerate
  the full range of plan content (code blocks, nested lists, arbitrary
  prose) without false positives on task-header detection.
- `depends_on:` is the machine-readable edge. `Consumes:`/`Produces:`
  remains human documentation. The two are not cross-validated — a
  `depends_on:` that contradicts `Consumes:` is a plan-authoring bug,
  not a `task-set` bug.
