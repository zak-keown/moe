---
name: fixing-a-code-review
description: Use when a review report already exists and its findings need working off — a CODEBASE-REVIEW.md, an inherited audit, or any list of defects someone else wrote that now has to become commits
---

# Fixing A Code Review

## Overview

**The fixing is not the hard part. The record is.**

Measured, not assumed. Six baseline runs worked findings off a review report
under time, authority and exhaustion pressure combined. All six verified each
finding against current code before touching it, committed one finding per
commit, and refused to bundle. Their own reasoning was better than any rule
worth writing: *"a directory is a unit of filesystem layout, not a unit of
change"*, and — on a finding whose cited line had vanished in a refactor —
*"the cited line changed is not the defect is gone; a refactor can carry a bug
to a new line just as easily as delete it."*

Then three of them wrote the outcome three different ways: `**Status:**`,
`**Resolution:**`, `**Status: STALE**`. One updated the report's frontmatter and
two did not. None recorded which commit fixed which finding. **A second run over
any of those reports could not tell what had already been done**, which is the
one thing this skill exists to make possible.

So the contract below is the skill. The loop above it is a reminder, not a
lecture.

**REQUIRED BACKGROUND:** You MUST understand `test-driven-development`. This
skill assumes the red-green cycle rather than restating it.

## The loop, per finding

The per-finding discipline is fixed; the dispatch model is not.

### Subagent-driven flow (preferred)

Bucket findings by directory (see **Waves** below). Dispatch one subagent per
bucket, each in its own git worktree, so they run concurrently without
conflicting on the index. Every subagent follows the same red-green-commit
cycle and stamps its own dispositions inside its worktree's copy of the report.

When a subagent finishes its bucket, it pushes its worktree branch. The
coordinator merges each bucket branch in severity order, re-running `pnpm check`
after each merge. If a merge conflicts on a source file, the coordinator
resolves it (the stamp commits never conflict because they touch disjoint
`CR-###` blocks). If `pnpm check` fails after a merge, stop and fix forward
before merging the next bucket.

Use `subagent-driven-development` for the dispatch mechanics. The subagent
prompt includes: the bucket's finding IDs and their full text, the branch name,
and the instruction to follow this skill's per-finding loop below.

### Serial fallback

When subagents or worktrees are unavailable — session policy, runtime limits, a
harness without subagents — work findings one at a time on one branch, in
severity order.

### Per-finding cycle (both flows)

1. **Re-read the cited code.** The report is a snapshot; the tree has moved.
2. **Decide whether the defect is still real** — and prove it, don't infer it.
   A vanished line number is not a fix. Grep for the symbol. If a refactor
   renamed the function, the defect moved with it.
3. **Red.** A test that fails *because of this defect*. A compile or import
   error is not red.
4. **Green.** The smallest change that passes it.
5. **Commit**, source and test together, one finding per commit:
   `fix(review): CR-### — <title>`
   Use `moe jig commit review-fix <CR-ID> <title>` to commit staged changes
   with the correct format. If `moe-jig` is not on PATH, format the commit
   manually as `git commit -m "fix(review): CR-### — <title>"`.
6. **Stamp the disposition** into the report, as its own commit, before
   starting the next finding. Create the stamp commit with
   `moe jig review stamp <CR-ID> <fixing-sha>`. The command validates the
   CR-ID format, confirms the fixing commit is on the current branch, and
   produces the correctly formatted empty commit. If `moe-jig` is not on PATH,
   create the stamp manually:
   `git commit --allow-empty -m "fix(review): CR-### — addressed by <sha>"`.

**The stamp is always a separate commit, and it is always per finding.** It
records the sha of the commit that fixed the finding, and no commit can contain
its own sha — one GREEN run tried folding it in with `--amend` and produced a
stamp citing a sha that no longer existed. Batching every stamp into one record
commit at the end is the other tempting answer and it is worse: a run
interrupted mid-batch leaves fixes committed with nothing mapping them to
findings, which is the unresumable state this skill exists to prevent. One
stamp per finding means a crash loses at most one record.

If the tree is dirty when you finish a finding, you are not finished: commit it
or `git checkout --` it.

## The disposition contract

Every finding in `CODEBASE-REVIEW.md` gets these four lines appended to its
block. All four are REQUIRED, including on findings you did not fix — a finding
with no disposition is indistinguishable from one nobody reached.

```markdown
**Disposition:** fixed | stale | skipped | deferred
**Commit:** `abc1234`          <!-- or — when there is no commit -->
**Resolved:** 2026-09-01
**Note:** <required unless fixed>
```

| Disposition | Means | Commit |
|---|---|---|
| `fixed` | red test written, fix applied, test green, committed | the sha |
| `stale` | the defect is gone from the tree, and you proved it | `—`, and the Note names the superseding commit |
| `skipped` | attempted, not applied — the fix broke tests, or the code drifted past recognition | `—`, and every touched file reverted |
| `deferred` | not attempted — no test framework, documentation-only, environment blocked | `—`, nothing touched |

A `stale` finding still earns a record. It is the only one that produces no
commit, so dropping it silently leaves a report claiming eleven findings against
a log showing ten fixes, and the next reader cannot tell which.

Stamp it with the script rather than by hand — it also updates the frontmatter
counts, which is the half that gets forgotten:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/fixing-a-code-review/scripts/stamp-disposition.mjs" \
  --id CR-004 --disposition fixed --commit abc1234
```

## Waves

Bucket findings by the directory they touch and work the buckets in order of
their worst severity. Findings in one file share context, so working them
together is cheaper — but they still commit separately.

Re-running this skill on a stamped report skips anything already `fixed` or
`stale`, which is what makes an interrupted run safe to resume. That property
depends entirely on the contract above being complete.

## When the report is wrong

Reports are written by a reviewer that could not run the code, and they are
wrong often enough to plan for. In baseline testing every run that wrote a test
first caught a finding whose stated reproduction did not reproduce.

Fix the code, not the report's description of the code — then correct the report
in the same commit and say so in the Note. A finding whose repro is wrong is
still usually a real defect with a bad description; treat a failed reproduction
as a reason to look harder before it is a reason to mark `stale`.

## Session finalization — compacting fixed findings

When every finding in the current session has a disposition, compact the report
before the final commit. This keeps the document navigable as the fixed-issue
count grows across sessions — readers care about what is still open, not the
full prose of a defect that was resolved three sessions ago.

**What compaction does:**

1. Collect every finding whose disposition is `fixed` or `stale`.
2. Replace each finding's full block (heading through disposition lines) with a
   single summary line under the finding's severity section:
   `- **CR-###:** <title> — <disposition> (<commit>)`
3. Append the removed full blocks to a `## Resolved findings` section at the
   bottom of the document, below `## Checked and found sound` if it exists.
   Preserve severity ordering within that section.
4. Refresh the frontmatter counts (the stamp script already does this; the
   compaction commit updates the body only).

Run compaction with:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/fixing-a-code-review/scripts/compact-resolved.mjs" \
  --file CODEBASE-REVIEW.md
```

**The compaction is its own commit:** `chore(review): compact resolved findings`.
It touches only the report, never source, so it cannot break the tree.

Findings with disposition `skipped` or `deferred` stay in place — they still
need attention. `open` findings (no disposition) obviously stay. A re-run of
this skill skips the `## Resolved findings` section entirely and works only the
inline findings that remain.

## Red flags

- A commit message naming two finding IDs
- A finding marked `stale` because its line number moved
- A disposition with no `Commit` line, on a finding that produced a commit
- Frontmatter counts that disagree with the stamped dispositions
- Starting the next finding with the tree dirty
- A compaction that moved `skipped` or `deferred` findings to the resolved section
