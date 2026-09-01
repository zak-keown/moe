# Wave 3 Execution Status

> **Superseded:** `wave3/tiered-workflow-naming` merged as `894f5c7` (2026-08-31).
> Wave 3 has no remaining active work under this file; the blocked item
> `tc-governance-integration` sits in the deferred bucket per the project
> memory `project_wave2_codegraph_deferred.md`.

## Base

Base: main@28b43228 — 1 items attempted, 1 ship, 0 iterate, 0 block, 0 skipped.
Report source: /Users/zakkeown/Code/tools/moe/.planning/wave3-execution-report.md (report base 73ec19ac). Worktrees under: /Users/zakkeown/Code/tools/moe/.claude/worktrees/wave3
Baseline main suite: green. Baseline suite is green on current main HEAD (28b4322). `pnpm --filter @bubstack/moe-core test` ran 51 tests across 3 files (house-voice, ci-config, metadata) — all passed in ~1.3s. `pnpm mint:check` regenerated 6 plu

## Ready to merge

### tiered-workflow-naming

Branch: wave3/tiered-workflow-naming
Commit: 8701fc5b — wave3/tiered-workflow-naming: patch / change / feature, not a fourth tier
Files: 8 files
Gates: 8/8 green

```bash
✓ pnpm --filter @bubstack/moe-core test
✓ pnpm --filter @bubstack/moe-core lint
✓ pnpm --filter @bubstack/moe-core typecheck
✓ grep -c 'REQUIRED SUB-SKILL' packages/core/skills/writing-plans/SKILL.md packages/core/skills/executing-plans/SKILL.md packages/core/skills/subagent-driven-development/SKILL.md | awk -F: 'BEGIN{s=0}{s+=$2}END{if(s!=4){exit 1}}'
✓ git diff --name-only main | grep -q packages/core/skill-tiers.yaml && exit 1 || true
✓ grep -n 'LEAN_TIER_COUNT = 13' packages/core/test/metadata.test.ts
✓ grep -n '^authored:' packages/core/skill-tiers.yaml -A 2 | grep -q '{}'
✓ diff <(git show main:packages/core/skill-tiers.yaml) packages/core/skill-tiers.yaml && echo 'skill-tiers.yaml unchanged'
```

Verify diff summary: brainstorming/SKILL.md's "Three Paths" section is rewritten as "Three Depths: patch / change / feature", carrying the HARD-GATE and the classify-first-then-announce discipline unchanged; the depth-bound bullets, checklist headings, dot-graph node labels, "Terminal states are depth-bound" line, the anti-pattern table (with two new failure-polarity rows for gold-plating at `patch` and stub-and-declare at `feature`), the section-transition prose, and the `## After the Design` heading are all renamed consistently. writing-plans, executing-plans, and subagent-driven-development each gain an "At this depth" note pinning them to the `feature` depth; subagent-driven-development additionally flags that its remaining "tier" prose is the MODEL tier under Model Selection, not the workflow axis. using-moe's Skill Priority gains a "Workflow depth vocabulary" paragraph that names the three depths and points at the depth notes. iterative-development's "small, bounded projects" is retargeted to "a `patch` or a `change`"; systematic-debugging's "architectural problem" → "structural problem" where it referred to structure-of-code, not the discipline. metadata.test.ts gains four new assertions under a new "workflow depth vocabulary" describe: (1) all three depth names appear in each depth-guarded SKILL.md, (2) `\btier\b` outside four whitelisted areas fails, (3) the retired trigraph and per-depth compound phrases (`spike-path`, `bounded task`, `## Three Paths` heading) fail while the generic adjective senses survive, (4) REQUIRED SUB-SKILL count across the three implementation skills stays pinned at 4. skill-tiers.yaml is untouched. All 55 tests pass.

Merge command (do NOT auto-run):

```bash
git -C /Users/zakkeown/Code/tools/moe merge --no-ff wave3/tiered-workflow-naming
```

## Integration reminders (copy verbatim from WAVES.md)
- A worker's findings are scoped to the tree it read; its report names the SHA.
- Reviewers compare SHAs before comparing claims.
- Cross-boundary citations use a test name, symbol or quoted sentence — never a line number.
- Cite backlog items by slug — the W##P## prefix drifts and rots cross-references.
