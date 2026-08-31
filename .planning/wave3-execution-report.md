# Wave 3 Execution Report

## Base
Base: main@73ec19ac1a5d8c5bba2b42b3c8b3affa9ed30c02 — planned 1 ready items, 0 in-branch, 0 merged.

## Ready to execute

### tiered-workflow-naming

Summary: Rename the workflow-depth axis to `patch`/`change`/`feature` inside `brainstorming` (superseding spike/bounded/architectural), add short per-depth notes to `writing-plans`, `executing-plans`, `subagent-driven-development`, and `using-moe`, and add metadata.test.ts assertions that catch a fourth meaning of 'tier' and any half-renamed depth vocabulary.

Approach: Work in a worktree branched from main; all edits confined to `packages/core/`. Rewrite `brainstorming/SKILL.md`'s "Three Paths" section into "Three Depths: patch / change / feature", carrying the `<HARD-GATE>` unchanged, and add per-depth rows plus failure-polarity rows for gold-plating (`patch`) and stub-and-declare (`feature`). Insert short "At this depth" notes at the top of `writing-plans`, `executing-plans`, `subagent-driven-development`, and under `using-moe`'s Skill Priority; leave the model-tier prose in SDD untouched. Sweep remaining `spike`/`bounded`/`architectural` hits — rename or annotate the adjective sense in `systematic-debugging`, `iterative-development`, and the review/plan prompt files — and add three metadata.test.ts assertions: a whitelisted grep for `\btier\b`, presence of the three depth names in the four SKILL.md files, and a pin on the REQUIRED SUB-SKILL count.

Files (write):
- packages/core/skills/brainstorming/SKILL.md
- packages/core/skills/writing-plans/SKILL.md
- packages/core/skills/subagent-driven-development/SKILL.md
- packages/core/skills/executing-plans/SKILL.md
- packages/core/skills/using-moe/SKILL.md
- packages/core/test/metadata.test.ts

Contended files:
- packages/core/test/metadata.test.ts — Self-guarded per WAVES.md: 'accounts for every skill on disk in exactly one of the two maps', plus LEAN_TIER_COUNT. Any bad edit fails vitest. New assertions added by this item are also self-guarding. (no other Wave 3 items)

Gates:
```bash
pnpm --filter @bubstack/moe-core test
pnpm --filter @bubstack/moe-core lint
pnpm --filter @bubstack/moe-core typecheck
grep -c 'REQUIRED SUB-SKILL' packages/core/skills/writing-plans/SKILL.md packages/core/skills/executing-plans/SKILL.md packages/core/skills/subagent-driven-development/SKILL.md | awk -F: 'BEGIN{s=0}{s+=$2}END{if(s!=4){exit 1}}'
git diff --name-only main | grep -q packages/core/skill-tiers.yaml && exit 1 || true
grep -n 'LEAN_TIER_COUNT = 13' packages/core/test/metadata.test.ts
grep -n '^authored:' packages/core/skill-tiers.yaml -A 2 | grep -q '{}'
diff <(git show main:packages/core/skill-tiers.yaml) packages/core/skill-tiers.yaml && echo 'skill-tiers.yaml unchanged'
Manual: read brainstorming/SKILL.md end to end, confirm no depth row contradicts the <HARD-GATE> at lines 14-20 or verification-before-completion's 'evidence before assertions always' contract
```

Drift:
- `test/metadata.test.ts:452-495 (three tests under describe("the lean/full curation"))` → The `describe("the lean/full curation")` block starts at line 633, not 452-495; the fidelity refactor moved every line in this file
- `the count lives in one constant, LEAN_TIER_BUDGET` → Constant is named LEAN_TIER_COUNT (line 143); commit 5a1b67a renamed BUDGET->COUNT because 'budget was the false premise'. The Verification section still says LEAN_TIER_BUDGET
- `subagent-driven-development/SKILL.md:127 — step 0 of both execution paths` → Line 127 is blank; the `Ensure the work happens in an isolated workspace: use` line is at 128 (heading `## Setup` at 126)
- `subagent-driven-development/SKILL.md:88,117,118 — per-task review and a final whole-branch review` → Lines 88, 117, 118 all reference the FINAL code reviewer inside the dot graph; the per-task review dispatch is at line 71
- `brainstorming/SKILL.md:44-48 — architectural path ends in writing-plans` → The architectural bullet closes at line 48, but starts at 45 not 44; line 44 is the end of the bounded bullet
- `brainstorming/SKILL.md:22-51 defines Three Paths` → The Three Paths section spans lines 22-52; line 51 is inside the closing paragraph and line 52 closes it

Lens verdicts: correctness: risky · integration-risk: risky

Open concerns:
- (integration-risk, high) Plan's enumerated `brainstorming/SKILL.md` rewrite stops at line 160 but leaves the `## After the Design (architectural path)` heading (around line 202) untouched. Neither Test 1 nor Test 2 catches an unretired heading using the retired depth-classifier vocabulary — precisely the half-renamed failure mode the plan calls out as worse than either whole one. Suggested: add a grep-test for `(spike|bounded|architectural)-?path|(depth|classification)` senses, and rewrite the heading citing it by quoted text.
- (integration-risk, high) Plan cites `subagent-driven-development/SKILL.md` by line numbers (128, 282) but `parallel-execution-option` (W02) restructures that file first — every line number will be stale post-merge, and WAVES.md §Integration protocol forbids line-number cross-references. Suggested: branch this worktree from main AFTER parallel-execution-option merges, and replace every line-number citation with a heading name or quoted sentence anchor. Also rephrase the depth-table row so it does not embed `subagent-driven-development/SKILL.md:282` as shipped prose.

## Blocked

### tc-governance-integration

Blocking lens: correctness

Reason: "The plan adds a SessionStart entry to packages/core/hooks/hooks.json but does NOT update the existing assertion at packages/core/test/metadata.test.ts:561 — `expect(Object.keys(hooks.hooks)).toEqual([\"Stop\"]);` — which will fail the moment a `SessionStart` key appears. The plan lists metadata.test.ts in `write`, but the approach describes ONLY the one-line X_BIT_ALLOWLIST append; it never names this specific assertion. Gate `pnpm --filter @bubstack/moe-core test` will therefore go red, and the plan's own `pnpm test` gate does too."

Suggested fixes:
- Expand the metadata.test.ts edit to append `hooks/tc-governance-check` to `X_BIT_ALLOWLIST`, update the assertion at :561 to accept `SessionStart` (or use a set-equality check), and rewrite the design comment at :556-560 that currently forbids a SessionStart entry in this file.
- Patch `packages/core/README.md`'s Layout entry at line 94 ('hooks.json — Stop + a SessionStart presence check ...') and the design paragraphs at lines 704-706 and 795 that describe hooks.json as Stop-only and the merged file as having exactly one SessionStart.
- Remove tc-governance-check's jq dependency — the presence-check has no stdin field it must parse; keep the check working on machines without jq.
- Tighten the mapping-table gate: assert each of §1..§11 appears as a row (e.g. `for n in 1..11; do grep -qE "^\| §${n}\b" ...`), not just that 11+ rows exist.
- Reframe the new bootstrap.test.ts case to read the exact wire shape from `packages/core/hooks/hooks.json` (via `join(__dirname, '../../core/hooks/hooks.json')` with an `existsSync` guard) so it verifies real-file compatibility, and assert Stop[0] survives byte-identically.
- Add `pnpm mint:check` as the final gate — it is what CI's `plugins:` job runs and catches an uncommitted `plugins/` tree.

## In-branch (skipped)

_(none)_

## Merged (skipped)

_(none)_

## Integration reminders
- A worker's findings are scoped to the tree it read; its report names the SHA.
- Reviewers compare SHAs before comparing claims.
- Cross-boundary citations use a test name, symbol or quoted sentence — never a line number.
