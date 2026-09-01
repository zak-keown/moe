# Verify-holes status

## Base
- Verified 6 of the 11 flagged holes: 4 closed, 0 still open, 2 partially closed.
- No holes skipped in this pass.

## Hole 1 — retroactive re-gate of merged waves
- Verdict: closed
- Finding: Re-ran every automated gate from both merged branches' execution reports against current main. Wave 1 native-renderers gates 1-6 (core test suite: 58 tests pass, brainstorm test suite: 24 pass, core lint: clean, wc-check on _shared/native-rendering.md, file exists, grep of native-rendering.md reference in three consumer SKILL.mds) all pass. Wave 3 tiered-workflow-naming gates 1-8 (core test, lint, typecheck, REQUIRED SUB-SKILL count of 4, no skill-tiers.yaml drift, LEAN_TIER_COUNT=13 pin, authored:{} pin, skill-tiers.yaml byte-identical to main) all pass. The only skipped gates are the manual smoke tests (macOS interactive brainstorming/writing-plans/finding-duplicate-functions confirmation, Windows Git Bash start-server smoke, and human read-through of brainstorming/SKILL.md) — none are runnable in a subagent shell and none are tool-missing skips. No automated gate that should pass on merged main fails, so the buggy-gate-cd worry on wave1/native-renderers did not leave verifiable breakage on main.
- Evidence:
  - wave1/native-renderers gate 1: passed — pnpm --filter @bubstack/moe-core test (58 tests passed in 3 files)
  - wave1/native-renderers gate 2: passed — pnpm --filter @bubstack/moe-core test:brainstorm (13+4+7 tests, all pass)
  - wave1/native-renderers gate 3: passed — pnpm --filter @bubstack/moe-core lint (0 errors, 3 pre-existing warnings, exit 0)
  - wave1/native-renderers gate 4: passed — test $(wc -l < packages/core/skills/_shared/native-rendering.md) -lt 100
  - wave1/native-renderers gate 5: passed — test -f packages/core/skills/_shared/native-rendering.md
  - wave1/native-renderers gate 6: passed — grep -q 'native-rendering.md' across brainstorming/writing-plans/finding-duplicate-functions SKILL.md
  - wave1/native-renderers gates 7-8: not-run — manual macOS and Windows Git Bash smoke tests, not automatable here
  - wave3/tiered-workflow-naming gate 1: passed — pnpm --filter @bubstack/moe-core test (58 tests pass)
  - wave3/tiered-workflow-naming gate 2: passed — pnpm --filter @bubstack/moe-core lint (exit 0)
  - wave3/tiered-workflow-naming gate 3: passed — pnpm --filter @bubstack/moe-core typecheck (tsc -p tsconfig.tests.json --pretty, exit 0)
  - wave3/tiered-workflow-naming gate 4: passed — REQUIRED SUB-SKILL awk sum == 4 across writing-plans, executing-plans, subagent-driven-development
  - wave3/tiered-workflow-naming gate 5: passed — git diff --name-only main does not include packages/core/skill-tiers.yaml
  - wave3/tiered-workflow-naming gate 6: passed — 'LEAN_TIER_COUNT = 13' present at metadata.test.ts:143
  - wave3/tiered-workflow-naming gate 7: passed — 'authored: {}' pin present in skill-tiers.yaml
  - wave3/tiered-workflow-naming gate 8: passed — skill-tiers.yaml byte-identical to main:packages/core/skill-tiers.yaml
  - wave3/tiered-workflow-naming gate 9: not-run — manual read-through of brainstorming/SKILL.md, requires human judgment

## Hole 4 — broad main suite after ships + regen
- Verdict: closed
- Finding: Ran all three broad suites from the repo root. `pnpm check` (lint+typecheck+test across every workspace) exited 1, but the only test failures are the two named environmental-known glass reds: `test/lib/chrome-process.test.mjs > startChrome rejects when the spawned proc emits error` (Chrome binary absent on host) and `test/lib/page-scripts/markdown.test.mjs > caps output at 50000 chars` (5s timeout). Every other workspace suite came back green (moe-crew 41 files, moe-memory 40 files, moe-flight 129 files, moe-tab 2 files, moe-mint 28 files). A companion `@bubstack/moe-mint:test: [ELIFECYCLE] Test failed` line appeared in the turbo output, but that was turbo signalling termination after the glass task failed — running `pnpm --filter @bubstack/moe-mint test` in isolation exits 0 with 421 passed / 8 skipped. `pnpm build` exited 0 (FULL TURBO, 8/8 cached tasks green). `pnpm mint:check` exited 0 — `turbo run mint:generate --force` regenerated all 6 plugins and `git diff --exit-code -- plugins` produced no drift. Ship merges + plugins regen produced no downstream regressions.
- Evidence:
  - pnpm check EXIT_CODE=1; only failing task is @bubstack/moe-glass#test — `Failed: @bubstack/moe-glass#test`, `Tasks: 24 successful, 26 total`
  - moe-glass test summary: `Test Files 2 failed | 46 passed (48)` / `Tests 2 failed | 508 passed (510)` — the 2 failed are chrome-process.test.mjs (`Chrome not found. Searched: /Applications/Google Chrome.app/...`) and page-scripts/markdown.test.mjs (`Test timed out in 5000ms` on `caps output at 50000 chars`), both on the environmental-known-red list
  - Other workspace test summaries all green: `moe-crew: Test Files 41 passed (41)`, `moe-memory: Test Files 40 passed (40)`, `moe-flight: Test Files 129 passed (129)`, `moe-tab: Test Files 2 passed (2)`
  - moe-mint spurious ELIFECYCLE line from turbo signalling after glass failure — isolated re-run `pnpm --filter @bubstack/moe-mint test` EXIT_CODE=0, `Test Files 28 passed | 1 skipped (29)`, `Tests 421 passed | 8 skipped (429)`
  - pnpm build EXIT_CODE=0: `Tasks: 8 successful, 8 total` / `Cached: 8 cached, 8 total` / `Time: 102ms >>> FULL TURBO`
  - pnpm mint:check EXIT_CODE=0: `turbo run mint:generate --force` regenerated 6 plugins (moe-core, moe-everything, moe-backstory, moe-memory, moe-glass, moe-crew) and `git diff --exit-code -- plugins` produced no drift; `Tasks: 2 successful, 2 total`

## Hole 5 — planner-prompt mint:check rule
- Verdict: closed
- Finding: The mint:check rule is present at line 163 of all four wave{1..4}-item.js files, using identical wording. It lives inside the "Rules for the plan text" block that immediately follows "Then return a plan matching the schema." — the prompt region the planner is explicitly told to obey. The wording is strong on every axis a planner LLM keys on: it uses "MUST include" (imperative, capitalized), names the trigger paths precisely ('packages/*/skills/' or 'packages/*/mint/'), names the exact gate command ('pnpm mint:check'), gives a one-sentence causal reason (mint sources drift; this gate is the only one that catches it), and preempts the obvious deference failure with "Add the gate even if the backlog doc does not list it." No hedging ("consider", "prefer", "if appropriate"), no ambiguity about scope, no burial in a long paragraph. A reasonable planner following the "Rules for the plan text" section would apply this rule whenever its files.write list matches. The read-and-grade approach is sufficient here; empirical test would only confirm what the wording already makes near-mechanical. Verdict: closed — no strengthening needed.
- Evidence:
  - grep hit: wave1-item.js:163, wave2-item.js:163, wave3-item.js:163, wave4-item.js:163 — same line number, same wording in all four files (they share the boilerplate)
  - Rule text (verbatim): "If files.write touches any path under 'packages/*/skills/' or 'packages/*/mint/', the gates MUST include 'pnpm mint:check' (or 'pnpm mint' followed by a check). Those directories are the mint sources — the executor will produce a branch whose plugins/ tree drifts from source, and mint:check is the only gate that catches it before merge. Add the gate even if the backlog doc does not list it."
  - Placement: inside the "Rules for the plan text" block (line 158 header), item 4 of 6 rules, directly under the schema instruction "Then return a plan matching the schema." — the prompt region the LLM treats as constraints on its output
  - Preemptive override clause: "Add the gate even if the backlog doc does not list it." closes the most likely failure mode (planner defers to the backlog file's explicit gate list)
  - Imperative marker: "MUST include" (capitalized), no softeners like "should" or "consider"

## Hole 7 — metadata.test.ts splice on the merge
- Verdict: closed
- Finding: The metadata.test.ts splice is arithmetically and structurally correct. Base (6b0e28c) has 37 it() tests; wave1/native-renderers (064a7dc7) adds 3 in describe("native rendering") for 40; wave3/tiered-workflow-naming (8701fc5b) adds 4 in describe("workflow depth vocabulary") for 41. Merged file on HEAD has exactly 37+3+4 = 44 it() tests, with both new describe blocks fully present (all 3 native-rendering it()s and all 4 workflow-depth it()s carry the exact same names and bodies as their source branches), placed between describe("the platform reference list") and describe("licensing") in that order. No duplicate it() names, no orphaned braces at lines 930-1105 — the two new describe blocks close cleanly at 987/988 and 1101/1102 respectively, and describe("licensing") opens at 1103 with its 2 unchanged it()s intact. Per-block counts in merged: skill inventory 8, cross-references 4, runtime paths 5, hooks 5, lean/full curation 8, rebrand 4, platform reference list 1, native rendering 3, workflow depth vocabulary 4, licensing 2 — sum 44. Vitest's 58/58 pass count includes tests from other files; the it() total for this file agrees with the arithmetic on the merge.
- Evidence:
  - merged.ts strict it() count: 44 (grep -cE '^\s+it\(' /tmp/merged.ts)
  - w1.ts strict it() count: 40; w3.ts: 41; base.ts: 37 — merge arithmetic 37+3+4 = 44 matches
  - merged describe blocks in order: skill inventory (152), cross-references (283), runtime paths (419), hooks (551), the lean/full curation (633), the rebrand (796), the platform reference list (918), native rendering (935), workflow depth vocabulary (989), licensing (1103)
  - w1 describe('native rendering') at 935-988 contains 3 it()s at relative 11/30/39 — all three appear in merged at 945/964/973 with identical names
  - w3 describe('workflow depth vocabulary') at 935-1048 contains 4 it()s at relative 16/30/62/96 — all four appear in merged at 1004/1018/1050/1084 with identical names
  - Structural read of merged lines 930-1105 shows clean `});` closures for platform reference list (933-934), native rendering (987-988), workflow depth vocabulary (1101-1102), and licensing opening at 1103 — no stray braces or orphan lines
  - Per-block it() counts in merged sum to 44: 8+4+5+5+8+4+1+3+4+2
  - No duplicated it() names — the 3 native-rendering and 4 workflow-depth names each appear exactly once in merged

## Hole 9 — stale status reports
- Verdict: partially-closed
- Finding: Ran base-SHA extraction and distance math for all nine planning docs, then cross-checked branch names against `git branch -a` and against merge commits in `git log`. Distances range from 1 to 15 commits behind HEAD (5ee75fc). Distance alone is not the problem — the four wave*-execution-report.md files are plan snapshots that are supposed to freeze, and iterate-round-status.md is only 1 commit behind and matches the newest commit message on main. The load-bearing staleness is in two "Ready to merge" sections: wave1-execution-status.md points readers at branch `wave1/native-renderers` and wave3-execution-status.md points at branch `wave3/tiered-workflow-naming` — both branches have been merged (commits 65be5f7 and 894f5c7 on main) AND deleted from the branch list. A fresh reader following those status docs verbatim would try to check out branches that no longer exist. The action they name has already been performed, so no work is lost, but the docs mislead about current state. Wave2 and Wave4 execution-status docs name Iterate branches that all still exist. Additionally, wave1-execution-status.md and wave2-execution-status.md list branches in their "Iterate" sections that iterate-round-status.md now records as "ship" — the wave docs contradict the newer iterate roll-up.
- Evidence:
  - /Users/zakkeown/Code/tools/moe/.planning/wave1-execution-report.md | 6b0e28c7 | 15 commits behind HEAD | historical plan snapshot, 'Ready to execute' section is planning-time content
  - /Users/zakkeown/Code/tools/moe/.planning/wave1-execution-status.md | 6b0e28c7 | 15 commits behind HEAD | STALE: 'Ready to merge' names Branch: wave1/native-renderers — branch deleted (merged as 65be5f7)
  - /Users/zakkeown/Code/tools/moe/.planning/wave2-execution-report.md | c404a39c | 13 commits behind HEAD | historical plan snapshot
  - /Users/zakkeown/Code/tools/moe/.planning/wave2-execution-status.md | 695bb103 | 12 commits behind HEAD | 'Iterate' branches wave2/deterministic-task-dag, wave2/mattpocock-skills-import, wave2/moe-bare-binary-dispatcher, wave2/parallel-execution-option all still present, but iterate-round-status now records them as ship
  - /Users/zakkeown/Code/tools/moe/.planning/wave3-execution-report.md | 73ec19ac | 11 commits behind HEAD | historical plan snapshot
  - /Users/zakkeown/Code/tools/moe/.planning/wave3-execution-status.md | 28b43228 | 10 commits behind HEAD | STALE: 'Ready to merge' names Branch: wave3/tiered-workflow-naming — branch deleted (merged as 894f5c7)
  - /Users/zakkeown/Code/tools/moe/.planning/wave4-execution-report.md | 98019e9e | 9 commits behind HEAD | historical plan snapshot
  - /Users/zakkeown/Code/tools/moe/.planning/wave4-execution-status.md | 22ea918a | 8 commits behind HEAD | 'Iterate' branch wave4/contributing-flow-docs still present
  - /Users/zakkeown/Code/tools/moe/.planning/iterate-round-status.md | 8d5a41a3 | 1 commit behind HEAD | fresh; matches HEAD commit message 'iterate: a 17-agent round at 8d5a41a3'; referenced branches (wave2/moe-bare-binary-dispatcher, wave1/*) still present
  - git log confirms merges: 65be5f7 'Merge wave1/native-renderers', 894f5c7 'Merge wave3/tiered-workflow-naming'; git branch -a shows neither branch
- Follow-ups:
  - In /Users/zakkeown/Code/tools/moe/.planning/wave1-execution-status.md, add a one-line header note like 'Superseded: wave1/native-renderers merged as 65be5f7; see iterate-round-status.md for current wave1 branch state' — the 'Ready to merge' section otherwise sends readers at a deleted branch.
  - In /Users/zakkeown/Code/tools/moe/.planning/wave3-execution-status.md, add the same superseded pointer noting wave3/tiered-workflow-naming merged as 894f5c7.
  - Optionally add a 'See also: iterate-round-status.md' pointer at the top of wave1-execution-status.md and wave2-execution-status.md so their 'Iterate' sections do not contradict the newer ship verdicts recorded in the iterate roll-up.
  - Consider a lightweight convention: rename status files to *-status-<sha>.md once superseded, or add a 'Superseded by:' front-matter line so drift is self-announcing.

## Hole 11 — memory audit
- Verdict: partially-closed
- Finding: Every factual claim inside project_wave2_codegraph_deferred.md checks out against current main: the metadata.test.ts:772-793 readdirSync(plugins/moe-core/skills) assertion range is real (line 773 does the readdir, line 780 asserts equality against the core-tier filter; the range also correctly encloses the second superset assertion at 784-792); packages/memory/agents/search-conversations.md line 14 uses the full mcp__plugin_moe-memory_moe-memory__... form; packages/core/scripts/mint-plugins.mjs is absent (only validate_skill.py lives there) and scripts/mint-plugins.mjs exists; metadata.test.ts:561 has verbatim `expect(Object.keys(hooks.hooks)).toEqual(["Stop"]);`; and both .planning/wave2-execution-report.md (## Blocked at :232, codegraph-context-layer heading at :234) and .planning/wave3-execution-report.md (## Blocked at :52, tc-governance-integration heading at :54) still contain the punch-list content the memory points to. The one imprecision is in MEMORY.md's one-line index entry, which lumps both defers under "same hook-assertion class of finding" — codegraph's blocking assertion is the readdirSync/mint-tier assertion, not a hook assertion; only tc-governance-integration is a hooks.json-shaped assertion. The memory file itself uses the looser and correct "same class of reason" framing.
- Evidence:
  - metadata.test.ts:772-793 → `it("emits exactly the core tier into the lean plugin, plus _shared", () => { const emitted = readdirSync(join(PKG, "../../plugins/moe-core/skills")).sort(); ... expect(emitted).toEqual(expected); });` at lines 772-781, plus the superset variant at 783-793 that also readdirs moe-core/skills
  - packages/memory/agents/search-conversations.md:14 → `tools: Read, mcp__plugin_moe-memory_moe-memory__search_conversations, mcp__plugin_moe-memory_moe-memory__read_conversation`
  - packages/core/scripts/mint-plugins.mjs absent → `ls packages/core/scripts/` returns only `validate_skill.py`
  - scripts/mint-plugins.mjs present → `ls scripts/mint-plugins.mjs` resolves
  - metadata.test.ts:561 → `expect(Object.keys(hooks.hooks)).toEqual(["Stop"]);` inside `it("registers exactly the Stop hook", () => { ... })` at line 556
  - .planning/wave2-execution-report.md:232 `## Blocked` → :234 `### codegraph-context-layer` with the same readdirSync/mint-order Reason and the same Suggested-fixes bullets the memory file paraphrases
  - .planning/wave3-execution-report.md:52 `## Blocked` → :54 `### tc-governance-integration` with the Reason quoting `expect(Object.keys(hooks.hooks)).toEqual(["Stop"]);` at :561
  - MISMATCH: MEMORY.md:1 characterizes both defers as `same hook-assertion class of finding` — codegraph's blocking assertion is a mint/tier readdirSync, not a hook assertion; the underlying memory file uses the accurate looser phrasing `same class of reason`
- Follow-ups:
  - Edit MEMORY.md's one-line entry for project_wave2_codegraph_deferred.md so it does not label both defers as `hook-assertion class`. Something like `both blocked 2026-08-31 by the same test-assertion-not-updated pattern (codegraph: mint/tier readdir; tc-governance: hooks.json keys); resume from each wave's report ## Blocked punch list.`

## Not verified in this pass
- Hole 2 (wave-iterate was untested): hindsight — the round has since run, so the pre-run worry no longer has a target to probe.
- Hole 3 (4 aging wave1 branches): needs a wave-iterate run against them; user's call whether to trigger that.
- Hole 6 (two ships landed without human diff review): human-only — only a human can close the diff-review loop.
- Hole 8 (workflow scripts are gitignored): organizational rather than workflow-shaped; not a probeable behavior.
- Hole 10 (wave1/gsd-core-skill-import worktree is dead space): one-off cleanup, not a workflow verification.

## Integration reminders (verbatim from WAVES.md)
- A worker's findings are scoped to the tree it read; its report names the SHA.
- Reviewers compare SHAs before comparing claims.
- Cross-boundary citations use a test name, symbol or quoted sentence — never a line number.
- Cite backlog items by slug — the W##P## prefix drifts and rots cross-references.
