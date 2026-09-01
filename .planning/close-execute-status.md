> **Superseded 2026-09-01.** Every branch this document names has been merged and
> deleted. It is kept as a point-in-time record of that run, so its "Ready to
> merge" and "Iterate" sections describe branches that no longer exist — do not
> try to check them out. For final state see `.planning/backlog/WAVES.md`.

# Wave close-execute status

## Base

Base: main@d7f4b7c1 — 2 items executed, 2 ship, 0 iterate, 0 block, 0 skipped.

## Ready to merge

### wave1/tc-standards-conformance

Branch: wave1/tc-standards-conformance (new tip: b73dc028, was: d9978a04)

Commits on top of main:
- fc72b74 wave1/tc-standards-conformance: MR-first vocabulary + drift-check for TC skills
- fa695b7 wave1/tc-standards-conformance: renumber parallel-worker section 1c -> 1d
- b73dc02 wave1/tc-standards-conformance: pnpm mint — regenerate after rebase

Conflicts resolved:
- packages/core/skills/using-git-worktrees/SKILL.md — git's 3-way merge auto-succeeded (branch's `1b. Branch Name` insertion and main's appended `1c. One Worktree Per Parallel Worker` were byte-disjoint) but left two sections labelled `### 1c.`. Applied the plan's coherent-doc fix as follow-up commit fa695b7: renumber main's section 1c→1d, update its inline `(Step 1b)` reference to `(Step 1c)`, add a Quick Reference row for `Parallel worker dispatch | One worktree per worker (Step 1d)`. — matched plan
- .gitlab-ci.yml — auto-merged cleanly; main's `bin:` job and branch's `tc-conventions-drift:` job are non-overlapping and both present in coherent order. — matched plan
- packages/core/skills/using-moe/references/codex-tools.md — auto-merged cleanly; main's new `## Native rendering ladder` section and branch's two PR→MR tweaks are non-overlapping. One new `PR` occurrence introduced by main (`cannot branch/push/PR from sandbox`) was outside the branch's original sweep target list and left as-is per rebase scope. — matched plan

What changed: 26 files, +670 / -74 vs main@d7f4b7c. Adds CODEOWNERS (+31), .gitlab/merge_request_templates/Default.md (+31), .gitlab-ci.yml `tc-conventions-drift` job (+66), packages/core/skills/_shared/tc-conventions.md (+94), MR-vocabulary sweep across finishing-a-development-branch, receiving-code-review, using-git-worktrees, using-moe/references/codex-tools.md, verification-before-completion, writing-clearly-and-concisely, writing-skills; coherent 1a/1b/1c/1d ordering in using-git-worktrees/SKILL.md; and matching mint regeneration into plugins/moe-core and plugins/moe-everything.

Gate scope change: Two gates (pnpm lint, pnpm typecheck) name pre-existing environmental reds introduced onto main by wave2 merge 3285c68 — same test-assertion-not-updated pattern the user's MEMORY.md flags. Both failures reproduce on main tree at d7f4b7c and the branch does not touch metadata.test.ts. A third gate (pnpm test) fails downstream on moe-glass Chrome-absent tests that AGENTS.md explicitly declares out-of-CI and on a markdown 5s timeout — both reproduce on main. Substituted per-package moe-core and moe-mint runs (both PASS). Added the verifier's PR/pull-request sweep gate over the five swept SKILL.md files (zero matches).

Gates:
```bash
FAIL pnpm lint  # pre-existing red on main: formatter diagnostic on packages/core/test/metadata.test.ts (from 3285c68)
FAIL pnpm typecheck  # pre-existing red on main: TS2339 'matcher' on metadata.test.ts:668 (from 3285c68)
OK   pnpm --filter @bubstack/moe-core test  # 72/72 (3 files)
OK   pnpm mint  # 6 plugins regenerated
OK   pnpm mint:check  # byte-identical
OK   pnpm --filter @bubstack/moe-mint test  # 421 passed, 8 skipped
SKIP pnpm test  # pre-existing environmental: moe-glass Chrome + markdown timeout, both reproduce on main
OK   grep -q 'ai/skills@' packages/core/skills/_shared/tc-conventions.md
OK   grep -q 'ai/claude-code-platform-plugin@' packages/core/skills/_shared/tc-conventions.md
OK   grep -rq 'skills/_shared/tc-conventions.md' packages/core/skills/{finishing-a-development-branch,using-git-worktrees,receiving-code-review}
OK   test -f CODEOWNERS && test -f .gitlab/merge_request_templates/Default.md
OK   grep -rn -E '\b(PR|pull request)\b' <5 swept SKILL.md files>  # zero matches (exit 1 = documented pass)
```

Merge command (do NOT auto-run):
```bash
git -C /Users/zakkeown/Code/tools/moe merge --no-ff wave1/tc-standards-conformance
```

### wave1/verification-split-and-firing-rate

Branch: wave1/verification-split-and-firing-rate (new tip: 27a3a71a, was: 50d4d6f8)

Commits on top of main:
- 27a3a71 wave1/verification-split-and-firing-rate: add matcher?: string to hooks.json type so main's SessionStart matcher test typechecks
- 9c33e51 wave1/verification-split-and-firing-rate: pnpm mint — regenerate after rebase
- 484db35 wave1/verification-split-and-firing-rate: per-turn evidence window, biome-ignore CLAUDE_PLUGIN_ROOT literals, drop loose done|ready claim regex
- ce8626d wave1/verification-split-and-firing-rate: default-on Stop evidence hook + Goal-Backward section

Conflicts resolved:
- packages/core/test/metadata.test.ts — X_BIT_ALLOWLIST unioned to include main's `hooks/plan-set`, `hooks/plan-set-notice` and branch's `hooks/moe-completion-evidence` (kept alphabetical). Node-routing block unioned into a single loop over `['hooks/plan-set', 'hooks/moe-completion-evidence']`. Node floor bumped 5→6 with an updated explanatory comment. — matched plan
- plugins/moe-core/.moe-mint/manifest.json — `checkout --theirs` to unblock rebase, then regenerated by pnpm mint in a separate commit. — matched plan
- plugins/moe-everything/.moe-mint/manifest.json — `checkout --theirs` to unblock rebase, then regenerated by pnpm mint in a separate commit. — matched plan
- packages/core/hooks/hooks.json — auto-merged; main's `SessionStart[0]=plan-set-notice` landed alongside branch's `Stop[0].hooks=[claude-judge-continuation, moe-completion-evidence]` without a marker. — matched plan
- .gitignore — auto-merged; main's `uv.lock` line and branch's `.audit/` block are non-overlapping. — matched plan

What changed: 19 files, +1300 / -13 vs main. Adds the default-on `moe-completion-evidence` Stop hook (`MOE_EVIDENCE_DISABLED=1` to opt out), the Goal-Backward section in verification-before-completion SKILL.md + fixture, wires the second `Stop[0]` entry in hooks/hooks.json (invoked directly via node, not run-hook.cmd), unions X_BIT_ALLOWLIST + bumps node floor 5→6 + extends node-routing loop in metadata.test.ts, adds `.audit/` to .gitignore, and regenerates the six plugins/moe-core + plugins/moe-everything mint outputs. Two collateral polish commits fix a pre-existing typecheck error inherited from main (`matcher?: string` on the hooks type union) and a pre-existing biome formatter error (`hasFallback` one-liner).

Gates:
```bash
OK pnpm --filter @bubstack/moe-core test  # 74/74 (3 files)
OK pnpm --filter @bubstack/moe-core lint  # 1 pre-existing noTemplateCurlyInString warning, no errors
OK pnpm --filter @bubstack/moe-core typecheck
OK pnpm mint:check
OK pnpm typecheck  # 12/12, FULL TURBO
OK node --check packages/core/hooks/moe-completion-evidence
OK test -x packages/core/hooks/moe-completion-evidence
OK git check-attr eol -- packages/core/hooks/moe-completion-evidence | grep -q 'eol: lf'
OK git ls-files --eol packages/core/hooks/moe-completion-evidence | grep -q 'w/lf'
OK grep -q '^\.audit/' .gitignore
OK printf '{"session_id":"t","transcript_path":""}' | MOE_EVIDENCE_DISABLED=1 node packages/core/hooks/moe-completion-evidence  # exit 0, empty stdout
```

Merge command (do NOT auto-run):
```bash
git -C /Users/zakkeown/Code/tools/moe merge --no-ff wave1/verification-split-and-firing-rate
```

## Still iterate

(none)

## Blocked

(none)

## Setup-failed

(none)

## Integration reminders (verbatim from WAVES.md)

- A worker's findings are scoped to the tree it read; its report names the SHA.
- Reviewers compare SHAs before comparing claims.
- Cross-boundary citations use a test name, symbol or quoted sentence — never a line number.
- Cite backlog items by slug — the W##P## prefix drifts and rots cross-references.
