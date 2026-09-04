---
name: merge-discipline
description: >-
  Use when merging, rebasing, cherry-picking, or otherwise integrating one
  line of work into another — before treating the operation as done, verify
  the result and own any lint or test failure it surfaces, whether or not
  the failure traces to your own changes
---

# Merge Discipline

## Overview

**Core principle: merging is an implicit promise that the result works.**

`moe-discipline` governs scope during your own task: notice a side effect
you did not cause while doing independent or parallel work, and the correct
move is to name it and leave it alone — "that's not mine, I'm not touching
it." That instinct is right there.

It is wrong here. The moment you are the one merging, rebasing, or
integrating branches, the task itself is "produce a working result." A lint
or test failure the merge surfaces is inside that task by definition,
whoever wrote the line that broke it and whenever it broke.

## The Rules

1. **Verify the merged result, not just your own branch.** Tests passing
   before you merge proves nothing about what merging produces. Run the
   project's checks — tests, and lint/typecheck where the project gates on
   them — against the branch *after* integration, not only before it.

2. **Ownership follows the operation, not the diff.** If the result fails,
   fix it before calling the merge done. It does not matter whether the
   breaking line is in your changeset, the other side's, or predates both.
   You picked up the branch; you own the state you leave it in.

3. **Fix it, or stop and ask — never ship it broken silently.** Most
   failures a merge surfaces are mechanical and yours to fix outright. If
   the fix genuinely needs a judgment call only a human can make — a real
   design conflict, ambiguous intent — stop and ask explicitly. Walking
   away and leaving the branch broken because the fix "isn't your
   changeset" is not an option.

4. **This is not scope creep.** `moe-discipline`'s "scope stays where it
   started" rule governs independent work. Merging redefines scope for the
   duration of the operation: "produce a working branch" *is* the task, not
   an addition to it.

## Red Flags

| Thought | Reality |
|---|---|
| "That test was already failing on main" | Doesn't matter once you're merging — you're the one shipping it broken now. |
| "It's not part of my diff" | Correct instinct for independent work (see `moe-discipline`). Wrong instinct here — merging is the diff. |
| "The conflict resolved cleanly, so I'm done" | Conflict-free is not test-clean. Verify before calling it done. |
| "I'll flag it in my summary and move on" | Naming a gap is right for out-of-scope work; here the gap is in scope. Fix it or ask. |
| "Fixing it means touching code outside my task" | The task is the merge. Its output is the boundary, not the original changeset. |

## Common Rationalizations

| Excuse | Reality |
|---|---|
| "Not my changes" | True and irrelevant — you are the one integrating them. |
| "It'll get caught in CI anyway" | CI catching it after you shipped a broken merge is the failure, not a safety net. |
| "The task didn't ask me to fix unrelated bugs" | The task asked you to merge. A merge that doesn't work isn't a smaller version of that task — it's a different, wrong one. |

## See Also

- `moe-discipline` — the scope-containment rule this skill deliberately
  overrides for the duration of a merge, and the source of the "not my
  changes" instinct that is correct everywhere else.
- `finishing-a-development-branch` — the branch-integration flow; its local
  merge step defers to this skill's verification requirement.
- `resolving-merge-conflicts` — the conflict-resolution flow; its own
  Verify step defers to this skill for why the fix is not optional.
