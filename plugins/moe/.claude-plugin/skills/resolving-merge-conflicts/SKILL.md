---
name: resolving-merge-conflicts
description: "Use when you need to resolve an in-progress git merge, rebase, or cherry-pick conflict — <<<<<<< markers are present, or git status shows unmerged paths."
---

# Resolving Merge Conflicts

Work through merge or rebase conflicts hunk by hunk, preserving both sides'
intent. Always resolve; never abort.

## 1. See the current state

```
git status                              # unmerged paths
git diff --name-only --diff-filter=U    # just the conflicting files
git log --merge --oneline               # commits involved in the conflict
```

Read the conflicting files. Understand the shape: how many files, how many
hunks, whether the conflicts are textual (overlapping edits) or structural
(file renamed on one side, edited on the other).

## 2. Research intent from primary sources

For each conflict, understand **why** each side made its change before touching
the markers. Read:

- The commit messages on both sides (`git log --merge -p`)
- PR/MR descriptions if available (`gh pr view`, `glab mr view`)
- The original issue or ticket if referenced

The goal is to know each side's *intent*, not just its *diff*. Two hunks that
look incompatible often serve the same goal from different starting points.

## 3. Resolve each hunk

- **Preserve both intents** where possible — most conflicts are additive, not
  contradictory.
- **When intents are incompatible**, pick the one that matches the merge's
  stated goal (the branch being merged into wins on convention; the feature
  branch wins on purpose). Note the trade-off in the commit message.
- **Do not invent new behaviour.** A conflict resolution combines or chooses;
  it does not redesign. If the resolution needs new code, that is a follow-up
  commit, not part of the merge.
- **`--ours` / `--theirs` shortcuts** — use `git checkout --ours <file>` or
  `git checkout --theirs <file>` only when one side's change is entirely
  superseded and you have confirmed this from the primary sources. Never use
  them to skip reading the conflict.

## 4. Verify

Run the project's automated checks in order: typecheck, then tests, then
format. Fix anything the merge broke — the merge resolution owns correctness,
not a follow-up.

## 5. Finish

```
git add <resolved files>
git merge --continue    # or: git rebase --continue
```

If rebasing, repeat from step 1 for each subsequent commit that conflicts until
the rebase completes.

## Common Rationalizations

| Thought | Reality |
|---------|---------|
| "Just take ours" | That silently drops the other side's intent. Read the source first. |
| "Just take theirs" | Same problem in reverse. |
| "I'll abort and start over" | The same conflict will reappear. Resolve it now. |
| "The conflict is too complex, let me rewrite this section" | A merge resolution combines or chooses. New code is a follow-up commit. |
| "The tests pass, so the resolution is correct" | Tests passing is necessary but not sufficient. The intent check (step 2) catches semantic regressions tests miss. |
