## Base
- Base: main@2eddf40e — 5 attempted, 2 landed, 1 rolled back, 2 skipped.
- Preflight: working tree clean, baseline core tests 58/58 green, baseline `pnpm mint:check` regenerated 6 plugins across 11 harnesses with no diff.
- Final HEAD: 1d38d974. Test green. mint:check green.

## Landed

### 2/moe-bare-binary-dispatcher
Merge SHA: a1c5f21e
Conflicts: none
Tests: green
Merge command that ran:
```bash
git merge --no-ff wave2/moe-bare-binary-dispatcher -m "wave2: merge moe-bare-binary-dispatcher"
```

### 4/contributing-flow-docs
Merge SHA: 1d38d974
Conflicts: none
Tests: green
Merge command that ran:
```bash
git merge --no-ff wave4/contributing-flow-docs -m "wave4: merge contributing-flow-docs"
```

## Rolled back

### 2/deterministic-task-dag
Reason: Merge itself was clean (ort auto-merge, no conflicts) and `pnpm mint` produced no plugin diff, but `pnpm --filter @bubstack/moe-core test` failed on `test/metadata.test.ts > workflow depth vocabulary > does not name the workflow depth 'tier' in any SKILL.md that lacks a legitimate tier meaning`. The new `packages/core/skills/sequencing-plans/SKILL.md` uses "tier" three times (lines 86, 174, 175) in contexts the metadata guard rejects — the workflow-depth axis is patch/change/feature, not "tier". 1 failed | 70 passed of 71. Branch author needs to reword those three occurrences (or extend the guard's tolerated contexts) so plugin-tier meaning is unambiguous; "lean-tier" and "everything tier" are legitimate plugin-tier terms in this repo. Rollback confirmed HEAD returned to pre-merge SHA with clean working tree; no regen commit needed undoing.
Pre-merge SHA: 1d38d974

## Skipped
- 2/parallel-execution-option — Aborted after a prior failure (stop_on_fail=true) or preflight blocked.
- 2/mattpocock-skills-import — Aborted after a prior failure (stop_on_fail=true) or preflight blocked.

## Preflight
Working tree clean on main @ 2eddf40. All five requested branches (four wave2, one wave4) resolved to local tip SHAs. Baseline `pnpm --filter @bubstack/moe-core test` passed 58/58 tests in 1.71s; baseline `pnpm mint:check` regenerated 6 plugins across 11 harnesses with no plugins/ diff. Node engine warnings (want >=24, have 22.23.2) appear throughout but do not fail either check. Nothing blocks a merge run.
(baseline test/mint:check were green)

## Integration reminders (verbatim from WAVES.md)
- A worker's findings are scoped to the tree it read; its report names the SHA.
- Reviewers compare SHAs before comparing claims.
- Cross-boundary citations use a test name, symbol or quoted sentence — never a line number.
- Cite backlog items by slug — the W##P## prefix drifts and rots cross-references.
