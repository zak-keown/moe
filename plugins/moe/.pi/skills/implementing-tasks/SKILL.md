---
name: implementing-tasks
description: Use when executing a batch of TDD-sized tasks inside a running-an-iteration call — dispatches an implementer subagent per task following red-green-refactor discipline and returns per-task completion status.
---

# Implementing Tasks

## Overview

Takes an in-memory batch of TDD-sized tasks and executes each through: implementer subagent (TDD) → PAR spec-compliance review → fix loop → PAR code-quality review with boxing-in check → fix loop → mark complete. This is a fork of `subagent-driven-development` — a sibling skill in this same plugin — with the plan-file reading phase stripped and the final end-of-plan reviewer removed. Reach for `subagent-driven-development` when you have a written plan file to execute; this skill is only invoked by `running-an-iteration`, which holds its task batch in memory.

## When to Use

Invoked by `running-an-iteration` with a list of tasks. Tasks are passed in memory, not via a file.

## Validate the batch

Before dispatching anything, validate every in-memory task has a non-empty
`Files:` field, an `Interfaces:` field, and explicit `Consumes:` and `Produces:`
entries. `None` is the explicit value when no interface edge exists. Missing
any field fails batch validation and returns the batch to the caller; do not
infer metadata from prose or execute the malformed task sequentially.

For a valid batch, use exactly two execution rungs:

1. worktree-isolated parallel dispatch when files are pairwise disjoint, there
   is no in-wave `Consumes:` → `Produces:` edge, and every worker has a
   pairwise-unique linked Git directory;
2. sequential dispatch of the whole group when the gate does not hold or any
   worktree cannot be created or validated.

There is no unisolated-parallel rung. Create and validate every worktree before
dispatching any worker so a failed setup cannot produce a partially parallel
group.

## Per-Task Cycle

For each task in the provided list:

### 1. Dispatch implementer

Using the template in `implementer-subagent-prompt.md`, dispatch a single implementer subagent with:
- The full task description and context
- The proof obligations for each observable AC in the task's stories
- The list of existing scenarios that may be impacted

The implementer MUST complete a pre-flight mapping (AC → proof seam → scenario) before writing code. If the implementer skips the pre-flight, re-dispatch with explicit instructions to complete it first.

### 2. Handle implementer status

- **DONE:** proceed to spec-compliance review (step 3). Verify the implementer's report includes pre-flight mapping and scenario updates.
- **DONE_WITH_CONCERNS:** read the concerns. If about correctness/scope, address before review. If observations, note and proceed.
- **NEEDS_CONTEXT:** provide the missing context and re-dispatch
- **BLOCKED:** assess: context problem → re-dispatch with context; too hard → re-dispatch with more capable model; task too large → break into smaller pieces; plan wrong → escalate to caller

### 3. PAR spec-compliance review (Stage 1)

Following `${CLAUDE_PLUGIN_ROOT}/skills/_shared/parallel-adversarial-review.md`:

1. Build spec-compliance prompt using `spec-compliance-reviewer-prompt.md`
   - Include the proof obligations and the implementer's evidence claims
2. Wrap in PAR competitive framing from `${CLAUDE_PLUGIN_ROOT}/skills/_shared/par-reviewer-wrapper.md`
3. Dispatch TWO spec-compliance reviewers in parallel
4. Aggregate findings (PAR rules: union of findings, severity = take worst)
5. If ❌ issues found:
   - Send aggregated issues back to the implementer subagent (same subagent, via continuation message)
   - Implementer fixes
   - Re-dispatch fresh PAR spec-compliance pair
   - Repeat until ✅ spec compliant with adequate evidence
6. Only proceed to Stage 2 after Stage 1 is ✅

### 4. PAR code-quality review (Stage 2)

Following `${CLAUDE_PLUGIN_ROOT}/skills/_shared/parallel-adversarial-review.md`:

1. Build code-quality prompt using `code-quality-reviewer-prompt.md`
   - Include the next 3 pending roadmap iterations for the boxing-in check
   - Include the implementer's corpus contribution for quality review
2. Wrap in PAR competitive framing
3. Dispatch TWO code-quality reviewers in parallel
4. Aggregate findings
5. If ❌ changes needed:
   - Send aggregated issues back to the implementer
   - Implementer fixes
   - Re-dispatch fresh PAR code-quality pair
   - Repeat until ✅ approved

### 5. Mark task complete

Record the task as done. Move to the next task.

After all tasks complete, return a per-task result list to the caller, including:
- Per-task status
- Scenarios added or updated per task
- Evidence commands per task

## Model Selection

Use the least powerful model that can handle each role:

| Role | Signal → Model |
|---|---|
| Implementer (mechanical: 1-2 files, clear spec) | Cheap/fast model |
| Implementer (integration: multi-file, judgment) | Standard model |
| Spec-compliance reviewer | Standard model |
| Code-quality reviewer | Most capable model |

## Quick Reference

| Per task | Subagents dispatched |
|---|---|
| Implementer | 1 (sequential, TDD) |
| Spec-compliance review (PAR) | 2 in parallel |
| Code-quality review (PAR) | 2 in parallel |
| **Minimum per task** | **5** (before re-review loops) |

## Red Flags

- **Never** start code-quality review before spec compliance is ✅
- **Never** skip the re-review after fixes (reviewer found issues = implementer fixes = review again)
- **Do not** dispatch multiple implementers concurrently unless the batch's
  tasks pass rung one of the worktree gate: disjoint `Files:` blocks, no
  `Consumes:` → `Produces:` edge inside the concurrent group, and a validated,
  pairwise-unique linked Git directory per worker (see
  `dispatching-parallel-agents` for the full gate and `using-git-worktrees`
  Step 1d). File/dependency conflicts or any worktree setup failure select rung
  two for the whole group: sequential dispatch. Never dispatch in parallel
  without isolation.
- **Never** accept "close enough" on spec compliance
- **Never** let implementer self-review replace the two-stage review

## References

- `implementer-subagent-prompt.md` — implementer dispatch template
- `spec-compliance-reviewer-prompt.md` — Stage 1 review template
- `code-quality-reviewer-prompt.md` — Stage 2 review template (includes boxing-in)
- `${CLAUDE_PLUGIN_ROOT}/skills/_shared/parallel-adversarial-review.md` — PAR methodology
- `${CLAUDE_PLUGIN_ROOT}/skills/_shared/par-reviewer-wrapper.md` — competitive framing wrapper
