# Parallel Worktree Acceptance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove one three-task wave can execute concurrently in pairwise-unique linked worktrees created from one recorded base and merge without conflict.

**Architecture:** The controller commits this plan, records that commit as the dispatch base, and creates three linked worktrees from it. Each worker owns one disjoint evidence file and records facts from its own tree. The controller merges all three branches, validates the evidence as one ledger, and runs the integrated repository gate.

**Tech Stack:** Git worktrees, Markdown evidence, shell validation

**Spec:** `.planning/backlog/W02P04 - parallel-execution-option.md`

## Global Constraints

- Every worker branches from the one base SHA passed by the controller.
- Every worker must validate `--git-dir` differs from `--git-common-dir`.
- The three resolved `--git-dir` values must be pairwise unique.
- Workers may modify only their assigned evidence file and must not revert concurrent work.
- Cross-worker evidence cites commands and SHAs, never line numbers.

## Open Decisions

None.

## Not Yet Specified

None.

## Out of Scope

- Product behavior changes; this plan validates the execution substrate itself.
- Unisolated parallel writes; failure to create or validate any worktree serializes the whole wave.
- Removing acceptance worktrees or branches; cleanup requires a separate explicit decision.

---

### Task 1: Alpha Worker Evidence

**Files:**
- Create: `.planning/parallel-uat/alpha.md`

**Interfaces:**
- Consumes: None
- Produces: None

- [x] **Step 1:** Confirm `git rev-parse HEAD` equals the controller-supplied base SHA.
- [x] **Step 2:** Resolve `git rev-parse --path-format=absolute --git-dir` and `git rev-parse --path-format=absolute --git-common-dir`; fail if equal.
- [x] **Step 3:** Create `alpha.md` containing worker name, base SHA, resolved worktree path, Git directory, common directory, and validation result `linked-worktree: pass`.
- [x] **Step 4:** Run `git diff --check` and verify the evidence file contains the exact base and both resolved Git paths.
- [x] **Step 5:** Commit only `alpha.md` with message `test(parallel): record alpha worktree evidence`.

### Task 2: Beta Worker Evidence

**Files:**
- Create: `.planning/parallel-uat/beta.md`

**Interfaces:**
- Consumes: None
- Produces: None

- [x] **Step 1:** Confirm `git rev-parse HEAD` equals the controller-supplied base SHA.
- [x] **Step 2:** Resolve `git rev-parse --path-format=absolute --git-dir` and `git rev-parse --path-format=absolute --git-common-dir`; fail if equal.
- [x] **Step 3:** Create `beta.md` containing worker name, base SHA, resolved worktree path, Git directory, common directory, and validation result `linked-worktree: pass`.
- [x] **Step 4:** Run `git diff --check` and verify the evidence file contains the exact base and both resolved Git paths.
- [x] **Step 5:** Commit only `beta.md` with message `test(parallel): record beta worktree evidence`.

### Task 3: Gamma Worker Evidence

**Files:**
- Create: `.planning/parallel-uat/gamma.md`

**Interfaces:**
- Consumes: None
- Produces: None

- [x] **Step 1:** Confirm `git rev-parse HEAD` equals the controller-supplied base SHA.
- [x] **Step 2:** Resolve `git rev-parse --path-format=absolute --git-dir` and `git rev-parse --path-format=absolute --git-common-dir`; fail if equal.
- [x] **Step 3:** Create `gamma.md` containing worker name, base SHA, resolved worktree path, Git directory, common directory, and validation result `linked-worktree: pass`.
- [x] **Step 4:** Run `git diff --check` and verify the evidence file contains the exact base and both resolved Git paths.
- [x] **Step 5:** Commit only `gamma.md` with message `test(parallel): record gamma worktree evidence`.

## Integration

1. Verify every worker reports the recorded base SHA before comparing findings.
2. Verify all three Git directories are pairwise unique and each differs from the shared common directory.
3. Merge all three worker branches into the controller branch.
4. Confirm all three evidence files exist and contain `linked-worktree: pass`.
5. Run `pnpm check` in the integrated tree.
6. Record worker commits, merge commits, validation results, and the integrated gate in `.planning/parallel-execution-acceptance-2026-09-01.md`.
