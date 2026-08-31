# Wave 2 execution report

## Base
Base: main@c404a39cd35c0310b1c3f05f0d982f1d517e5bd8 — planned 4 ready items, 0 in-branch, 0 merged.

## Ready to execute

### deterministic-task-dag

Summary: Add a fork-authored `sequencing-plans` skill plus an unfiltered `hooks/plan-set` Node CLI and a `plan-set-notice` SessionStart hook, so a multi-plan project keeps a committed manifest that tells any fresh session which plan is runnable next.

Approach: Ship the `sequencing-plans` SKILL.md alongside a Node CLI (`hooks/plan-set` with `next`/`done`/`check` verbs implementing Kahn topological ready-set logic) and a bash SessionStart hook (`hooks/plan-set-notice`) that never fails a session start. Manifest lives at `docs/moe/plans/<project>-MANIFEST.md` as fenced YAML. Register the SessionStart entry in `hooks.json`, add the skill under `authored:` in `skill-tiers.yaml` with `tier: everything`, and update `metadata.test.ts` to accept both SessionStart+Stop keys, allowlist the two new hook binaries, and add a new `describe("plan-set")` block with vitest fixtures for the diamond/cycle/blocked/duplicate/missing-dep/missing-plan cases. Add a non-REQUIRED prose reference in writing-plans' Scope Check.

Files (write):
- packages/core/skills/sequencing-plans/SKILL.md
- packages/core/hooks/plan-set
- packages/core/hooks/plan-set-notice
- packages/core/hooks/hooks.json
- packages/core/skill-tiers.yaml
- packages/core/test/metadata.test.ts
- packages/core/test/fixtures/plan-set/diamond-MANIFEST.md
- packages/core/test/fixtures/plan-set/cycle-MANIFEST.md
- packages/core/test/fixtures/plan-set/blocked-MANIFEST.md
- packages/core/test/fixtures/plan-set/duplicate-MANIFEST.md
- packages/core/test/fixtures/plan-set/missing-dep-MANIFEST.md
- packages/core/test/fixtures/plan-set/missing-plan-MANIFEST.md
- packages/core/skills/writing-plans/SKILL.md

Contended files:
- packages/core/skill-tiers.yaml — GUARDED — checkMarketplace agrees on paths, completeness/disjointness pair asserts union of imported+authored equals skills on disk, keeps-lean-tier-lean pins LEAN_TIER_COUNT=13. Adding `sequencing-plans:` under `authored:` is required by the disjointness pair the moment skills/sequencing-plans/ exists. My write is disjoint from every other Wave 2 writer's write at the map level. — parallel-execution-option, mattpocock-skills-import, codegraph-context-layer
- packages/core/test/metadata.test.ts — GUARDED — self-guarding suite. My edits: relax `registers exactly the Stop hook` from `toEqual(["Stop"])` to `toEqual(["SessionStart","Stop"])`; append `hooks/plan-set` and `hooks/plan-set-notice` to X_BIT_ALLOWLIST at L381-400; add a `describe("plan-set")` block. Textual overlap with mattpocock-skills-import and parallel-execution-option (both also write here). `verification-split-and-firing-rate` (W01) also adds a Stop hook and edits X_BIT_ALLOWLIST — if it merges first, rebase and merge on top of its Stop-hook changes. — parallel-execution-option, mattpocock-skills-import
- packages/core/skills/writing-plans/SKILL.md — Unguarded prose. Overlap with parallel-execution-option's rewrite of the parallel-implementation ban. My edit is one conditional sentence in the Scope Check section (~L21-23); parallel-execution-option rewrites the execution-options block (~L157-163). Different paragraphs, low physical collision risk, but a textual merge cannot verify prose intent — cross-check that neither edit clobbers the other. — parallel-execution-option
- packages/core/hooks/hooks.json — Unguarded JSON structure. Currently declares a single `Stop` entry. My edit adds a SessionStart entry alongside it. `verification-split-and-firing-rate` (W01) also adds a Stop entry (moe-completion-evidence); `tc-governance-integration` (W03) also adds a SessionStart entry (tc-governance-check). Assume W01 has landed by Wave 2; if it hasn't, rebase and merge the additional Stop entry beside my SessionStart entry — they are in different Object keys and different array positions and do not physically collide. — (no Wave 2 partners)

Gates:
```bash
pnpm --filter @bubstack/moe-core test
pnpm --filter @bubstack/moe-core test metadata
pnpm lint
pnpm build
pnpm mint
pnpm mint:check
grep -c 'from: moe' packages/core/skill-tiers.yaml  # expect 1
test -x plugins/moe-core/hooks/plan-set && test -x plugins/moe-core/hooks/plan-set-notice
test -x plugins/moe-everything/hooks/plan-set && test -x plugins/moe-everything/hooks/plan-set-notice
test ! -d plugins/moe-core/skills/sequencing-plans  # lean tier must NOT contain the everything-tier skill
test -d plugins/moe-everything/skills/sequencing-plans
bash -n packages/core/hooks/plan-set-notice
node --check packages/core/hooks/plan-set
echo '{}' | packages/core/hooks/plan-set-notice  # exits 0 with no manifest present
packages/core/hooks/plan-set check --manifest packages/core/test/fixtures/plan-set/diamond-MANIFEST.md  # exits 0
packages/core/hooks/plan-set check --manifest packages/core/test/fixtures/plan-set/cycle-MANIFEST.md  # exits non-zero, names cycle nodes on stderr
Dry-run assertion: on a project with docs/moe/plans/foo-MANIFEST.md listing plans A,B,C (B depends A, C depends B), `plan-set done A abc..def` then a fresh terminal session runs `plan-set next` and prints exactly `B`.
SessionStart assertion: launching a session in a project with an incomplete manifest prints the plan-set-notice's additionalContext; sessions in a project with no manifest or an all-done manifest print nothing to the transcript; the hook exits 0 in all cases including when plan-set is deleted.
```

Drift:
- metadata.test.ts:237-244 requires the union of both maps to equal the skills on disk → That completeness/disjointness pair is the test `accounts for every skill on disk in exactly one of the two maps` and is now at lines 257-280 of packages/core/test/metadata.test.ts. The `describe("skill inventory")` block extends to L281.
- skill-tiers.yaml:212-217 is `everything`-tier iterative-development → iterative-development is defined at packages/core/skill-tiers.yaml lines 261-267. Line 212 currently sits inside the writing-clearly-and-concisely block.
- `skill-tiers.yaml:316-317` — `authored:` is `{}` → `authored:` is at line 327 and the load-bearing `{}` is at line 328 of packages/core/skill-tiers.yaml.
- `skill-tiers.yaml:306-310` states the D2 policy → The D2 policy comment block is at lines 310-315 of packages/core/skill-tiers.yaml. The quoted phrase appears verbatim there.
- Flipping this skill to `core` would let the script sit inside it… and is a one-line change to `keeps the lean tier lean` (`toBe(13)` → `toBe(14)`) → The assertion at metadata.test.ts L719-724 reads `expect(core.length, ...).toBe(LEAN_TIER_COUNT)`. The constant `LEAN_TIER_COUNT = 13` is at L143. A promotion to core is a one-line diff to L143, not an inline `toBe(13)` change.
- The committed 7-wave schedule is still valid → WAVES.md is now a 4-wave schedule. `deterministic-task-dag` is W02, `tc-governance-integration` is W03, and `verification-split-and-firing-rate` is W01.
- `verification-split-and-firing-rate` (W03) and `tc-governance-integration` (W07) both extend hooks.json → Both slugs still extend `packages/core/hooks/hooks.json`, but their wave numbers are W01 and W03 respectively; `verification-split-and-firing-rate` is Wave 1, so its hooks.json edit likely lands BEFORE this item.
- test/metadata.test.ts asserts fork-authored skills are `tier: everything` → Confirmed — the `keeps every fork-authored skill in the everything tier` test is at lines 676-694. The doc does not mention that adding an entry with any other tier fails there.
- Adding a SessionStart hook lands here without other consequences beyond hooks.json → The existing test `registers exactly the Stop hook` at L556-562 asserts `expect(Object.keys(hooks.hooks)).toEqual(["Stop"])`. Adding SessionStart here fails that test — the doc's Verification section 7 does not name this required edit.

Lens verdicts: correctness: risky · integration-risk: risky

Open concerns:
- (correctness, high) Plan step 2 asserts an extensionless `hooks/plan-set` with `#!/usr/bin/env node` shebang is picked up by the extensionless-shebang router in metadata.test.ts and gets `node --check`. Verified false: metadata.test.ts:514 is `if (/^#!.*\b(bash|sh)\b/.test(first)) bash.push(rel);` — only bash/sh shebangs are routed. So the plan-set CLI falls through both routes and gets NEITHER `bash -n` nor `node --check` in vitest. Fix by renaming the CLI to `plan-set.mjs` (or `.cjs`), OR extend the router with an `else if (/^#!.*\bnode\b/.test(first))` branch plus adjust the floor list.

### mattpocock-skills-import

Summary: Import 4 mattpocock/skills as new packages/core/skills/ directories plus 2 sibling references, add PARITY row and licence file at rev 6654f6b, and bump the metadata.test.ts imported-count and expected-list from 27 to 31 across the new mattpocock-skills provenance.

Approach: Copy four upstream skills (`codebase-design`, `improve-codebase-architecture`, `domain-modeling`, `prototype`) from the on-disk clone at `/Users/zakkeown/Code/.moe-references/mattpocock-skills` at `6654f6b`, dropping upstream `agents/` subdirs and stripping the `disable-model-invocation` frontmatter key. Rewrite the `grilling` cross-ref in improve-codebase-architecture to `brainstorming`. Add two sibling references (Fowler smells extract, writing-for-agents pair as skill-typography/skill-mechanics), tier all four as `everything`, bump `metadata.test.ts` imported count 27→31, expected-list, and UPSTREAM array; add PARITY row, ARCHITECTURE mention, and MIT licence file. Rerun `pnpm mint`.

Files (write):
- PARITY.md
- ARCHITECTURE.md
- packages/core/skill-tiers.yaml
- packages/core/test/metadata.test.ts
- packages/core/licenses/mattpocock-skills.MIT.LICENSE
- packages/core/skills/codebase-design/SKILL.md
- packages/core/skills/codebase-design/DEEPENING.md
- packages/core/skills/codebase-design/DESIGN-IT-TWICE.md
- packages/core/skills/improve-codebase-architecture/SKILL.md
- packages/core/skills/improve-codebase-architecture/HTML-REPORT.md
- packages/core/skills/domain-modeling/SKILL.md
- packages/core/skills/domain-modeling/CONTEXT-FORMAT.md
- packages/core/skills/domain-modeling/ADR-FORMAT.md
- packages/core/skills/prototype/SKILL.md
- packages/core/skills/prototype/LOGIC.md
- packages/core/skills/prototype/UI.md
- packages/core/skills/requesting-code-review/references/fowler-smells.md
- packages/core/skills/writing-skills/references/skill-typography.md
- packages/core/skills/writing-skills/references/skill-mechanics.md
- plugins/moe-everything/skills/codebase-design/
- plugins/moe-everything/skills/improve-codebase-architecture/
- plugins/moe-everything/skills/domain-modeling/
- plugins/moe-everything/skills/prototype/

Contended files:
- packages/core/skill-tiers.yaml — GUARDED — 'every skill directory needs an entry in exactly one map; lean membership pinned'. Test enforces via `Object.keys(registry).sort()).toEqual([...skillNames].sort())`. Merge conflicts fail loudly. — codegraph-context-layer, deterministic-task-dag, parallel-execution-option
- packages/core/test/metadata.test.ts — GUARDED — self-guarding via 'accounts for every skill on disk in exactly one of the two maps' plus LEAN_TIER_COUNT. Mutates three specific numeric/enumerated constants; merge conflict caught by test. — deterministic-task-dag, parallel-execution-option
- ARCHITECTURE.md — UNGUARDED prose. Silent failure mode: a stale line-numbered citation surviving a text merge. Mitigation is cite-by-name per WAVES.md integration protocol. — moe-bare-binary-dispatcher

Gates:
```bash
pnpm install
pnpm --filter @bubstack/moe-core test
pnpm mint
pnpm mint:check
pnpm check
test -z "$(grep -rn 'mattpocock\|matt-pocock\|ask-matt\|setup-matt-pocock-skills' packages/core/skills/)"
grep -rniE 'deep module|shallow module|deletion test|design it twice' packages/core/skills/codebase-design/ packages/core/skills/improve-codebase-architecture/
test -f packages/core/licenses/mattpocock-skills.MIT.LICENSE
grep -q '`mattpocock-skills`' PARITY.md
git -C /Users/zakkeown/Code/.moe-references/mattpocock-skills rev-parse --short HEAD | grep -qx 6654f6b
```

Drift:
- 'Verify shallow clone at ../.moe-references/mattpocock-skills/ matches 6654f6b' → From repo root, '../.moe-references/' resolves to /Users/zakkeown/Code/tools/.moe-references/, which does not exist. The real clone is at /Users/zakkeown/Code/.moe-references/mattpocock-skills (two levels up); HEAD is 6654f6b as claimed.
- '4 lines to metadata.test.ts:156-192's enumeration' → Lines 156-192 hold the 'pins IMPORTED skill set at exactly 27' assertion. The actual imported: enumeration is the 'accounts for every skill the six upstream sources shipped' test at lines 212-255.
- 'metadata.test.ts:156-192's imported: count assertion updated by exactly 4' → The count assertion is at line 174: `expect(Object.keys(imported).length).toBe(27);`. Must bump to 31.
- 'improve-codebase-architecture/{SKILL.md, HTML-REPORT.md}' — no mention of frontmatter cleanup → It carries `disable-model-invocation: true` in frontmatter, which the 'uses only frontmatter keys Claude Code recognises' test rejects. Must be stripped.
- 'strip Matt-specific ask-matt / repo-router language' → The concrete edit needed is at improve-codebase-architecture/SKILL.md:64, which calls the Skill tool with 'grilling' — a skill the doc says stays out of scope; must be rewritten to brainstorming or removed.
- ARCHITECTURE.md §3 tree comment reads `core/ # 27 skills + hooks`; not called out in the backlog's touches list but must update to stay honest.
- 'The `writing-skills/` (+ one companion) sibling reference' target directory implied to exist → packages/core/skills/writing-skills/ has no references/ subdirectory today; must be created. Same for requesting-code-review/references/.

Lens verdicts: correctness: risky · integration-risk: risky

Open concerns:
- (correctness, high) domain-modeling/CONTEXT-FORMAT.md carries three illustrative relative links `./src/*/CONTEXT.md` at lines 43-45. The `every relative markdown link inside skills/ resolves on disk` test at metadata.test.ts:350 asserts offenders.toEqual([]). Copying verbatim without excision or rewrite fails that test. Plan makes no mention of these links.
- (correctness, high) writing-for-agents/SKILL.md contains TWO `SKILL-MECHANICS.md` links — line 8 AND line 59. Plan states only one rewrite; line 59 becomes a dangling link failing the relative-link test.
- (correctness, high) writing-for-agents/SKILL-MECHANICS.md line 3 opens with a back-link `[writing-for-agents](SKILL.md)`. After the rename, this becomes a dangling `SKILL.md` link. Plan doesn't mention rewriting the reciprocal link.

### moe-bare-binary-dispatcher

Summary: Add a portable `bin/moe.js` Node dispatcher that resolves `moe <ns> [args...]` to the seven `moe-<ns>` bins, plus its vitest, a path-scoped CI job, an ARCHITECTURE §7 rewrite with a new §7.1 for the three claimants and a `bin/` entry in §3's tree, a README paragraph, and the `bin: { moe }` declaration on root `package.json`.

Approach: Ship a self-contained ESM Node file at `bin/moe.js` (Node stdlib only) that owns a namespace table for the seven `moe-<ns>` bins with resolution order sibling → PATH → workspace-fallback (using `uv run --project py/proof` for proof). Copy the grammar from `packages/flight/src/cli.ts`. Handle WSL detection via `/microsoft/i.test(os.release())`, refuse crew on bare win32 with a WSL2 message, forward SIGINT/SIGTERM. Test via vitest at `bin/test/moe.test.mjs`. Rewrite ARCHITECTURE §7 with a new §7.1 recording the three claimants of the bare `moe` name, add a `bin/` line to §3 tree, add README paragraph and `.gitlab-ci.yml` job scoped to `bin/**/*`. Declare `bin: { moe }` on root package.json.

Files (write):
- /Users/zakkeown/Code/tools/moe/bin/moe.js
- /Users/zakkeown/Code/tools/moe/bin/test/moe.test.mjs
- /Users/zakkeown/Code/tools/moe/ARCHITECTURE.md
- /Users/zakkeown/Code/tools/moe/README.md
- /Users/zakkeown/Code/tools/moe/.gitlab-ci.yml
- /Users/zakkeown/Code/tools/moe/package.json

Contended files:
- /Users/zakkeown/Code/tools/moe/ARCHITECTURE.md — Unguarded prose per WAVES.md 'Unguarded but inconsequential' table. Silent failure mode is a stale line-numbered citation surviving merge; mitigate by editing §7 and §3 by heading + quoted phrase, not by line number, and by anchoring the new §7.1 to '## 7. Naming' as the stable landmark. — mattpocock-skills-import

Gates:
```bash
cd /Users/zakkeown/Code/tools/moe && pnpm bin:test
cd /Users/zakkeown/Code/tools/moe && pnpm lint
cd /Users/zakkeown/Code/tools/moe && test "$(head -1 bin/moe.js)" = '#!/usr/bin/env node'
cd /Users/zakkeown/Code/tools/moe && test "$(head -1 packages/crew/dist/moe-crew.cjs)" = '#!/usr/bin/env node'
cd /Users/zakkeown/Code/tools/moe && pnpm --filter @bubstack/moe-crew build && diff <(node bin/moe.js crew --help) <(node packages/crew/dist/moe-crew.cjs --help)
cd /Users/zakkeown/Code/tools/moe && node bin/moe.js nonesuch; test $? -ne 0
cd /Users/zakkeown/Code/tools/moe && node bin/moe.js 2>&1 | grep -q 'crew' && node bin/moe.js 2>&1 | grep -q 'flight'
cd /Users/zakkeown/Code/tools/moe && node -e "const p=require('./package.json'); if(p.bin?.moe!=='./bin/moe.js') process.exit(1)"
grep -q '^bin:' /Users/zakkeown/Code/tools/moe/.gitlab-ci.yml && grep -A5 '^bin:' /Users/zakkeown/Code/tools/moe/.gitlab-ci.yml | grep -q 'bin/\*\*'
grep -q '## 7.1' /Users/zakkeown/Code/tools/moe/ARCHITECTURE.md
grep -q 'one dispatcher' /Users/zakkeown/Code/tools/moe/ARCHITECTURE.md
grep -q '├── bin/' /Users/zakkeown/Code/tools/moe/ARCHITECTURE.md
```

Drift:
- ARCHITECTURE.md:280-281 — the Binaries listing → Same block is now at lines 371-372, under §7 (§7 heading at line 365). File is 455 lines.
- ARCHITECTURE.md:62-93 — §3's target tree → §3 'Target tree' is at lines 135-167; the tree fence spans 137-167.
- ARCHITECTURE.md:130-141 — L3 layer in the dependency diagram → §5 'Dependency layers' heading is at line 205; the layer diagram is lines 210-216.
- ARCHITECTURE.md:243-273 — §6 'Local prerequisites' is macOS-only → §6 is at lines 317-355 and already carries a 'Windows: WSL2, and that is the answer for now' subsection.
- packages/crew/tsup.config.ts:14-27 — the CJS tsup config needs a `banner` addition → The banner is already present at packages/crew/tsup.config.ts:41. Prerequisite is met.
- packages/flight/src/cli.ts (worktree `-15`, 105 lines) → File is on main at 102 lines. Structure matches; grammar reusable as claimed.
- packages/memory/package.json is on worktree `-14` and main is a stub → packages/memory is on main with full dist/. DO-NOW-1 has landed.
- moe-tone-and-branding is in conflicts_with → WAVES.md states moe-tone-and-branding is 'complete on a branch and awaiting merge'. Not a live parallel conflict — but its unmerged branch may still rewrite the same §7 sentence.

Lens verdicts: correctness: risky · integration-risk: risky

### parallel-execution-option

Summary: Replace the blanket bans on parallel implementers in subagent-driven-development and implementing-tasks with a portable worktree-gated dispatch rule stated in dispatching-parallel-agents, wire wave-grouping and inter-wave integration into SDD, add a worktree-per-worker step to using-git-worktrees, add a metadata.test.ts invariant that every parallel-dispatch skill names a sequential fallback, de-number the skill-tiers.yaml `why:` for dispatching-parallel-agents, and fix the crew fan-out example so each worker gets its own worktree.

Approach: Prose-heavy skill-repair. Add a "Safe parallel implementation: the worktree gate" section to dispatching-parallel-agents with the three-part gate (Files disjoint, no Consumes/Produces edge, one worktree per worker) and the divergent-tree rule. Replace the SDD line 282 and implementing-tasks line 101 bans with inline gate wording and add a Wave-grouping step and Integrate-the-wave step to SDD. Add Step 1c to using-git-worktrees, extend writing-plans' Execution Handoff. Edit only the `why:` body of dispatching-parallel-agents in skill-tiers.yaml (no tier change, no map change). Add one new `it(...)` to the existing cross-references describe block asserting every parallel-dispatch skill names a sequential fallback. Fix crew fan-out to point each worker at its own worktree.

Files (write):
- packages/core/skills/writing-plans/SKILL.md
- packages/core/skills/subagent-driven-development/SKILL.md
- packages/core/skills/dispatching-parallel-agents/SKILL.md
- packages/core/skills/using-git-worktrees/SKILL.md
- packages/core/skills/implementing-tasks/SKILL.md
- packages/core/skill-tiers.yaml
- packages/core/test/metadata.test.ts
- packages/crew/skills/driving-claude-code-sessions/SKILL.md

Contended files:
- packages/core/skill-tiers.yaml — GUARDED — 'every skill directory needs an entry in exactly one map; lean membership pinned'. This item edits only the `why:` body of `dispatching-parallel-agents`; no `tier:`, no map membership change, no `authored:` change — the guards do not fire. — deterministic-task-dag, mattpocock-skills-import, codegraph-context-layer
- packages/core/test/metadata.test.ts — GUARDED — self-guarding. Appends ONE new `it(...)` case inside the existing `describe('cross-references', ...)` block and does not modify `LEAN_TIER_COUNT`. Merge with sibling Wave 2 edits is a textual append to different regions. — deterministic-task-dag, mattpocock-skills-import
- packages/core/skills/subagent-driven-development/SKILL.md — Unguarded prose but cited by other backlog items using line numbers. Cite by symbol/quoted sentence in any cross-item reference. — (no Wave 2 partners)
- packages/core/skills/implementing-tasks/SKILL.md — Unguarded prose. Backlog cites `:101` — do the edit in place; the durable anchor is the quoted 'Never dispatch multiple implementers in parallel' line. — (no Wave 2 partners)
- packages/core/skills/writing-plans/SKILL.md — Unguarded prose. `tiered-workflow-naming` (Wave 3) will rewrite the execution-handoff block. No Wave 2 collision. — (no Wave 2 partners)
- packages/core/skills/dispatching-parallel-agents/SKILL.md — Unguarded prose. Not touched by any other Wave 2 item. — (no Wave 2 partners)
- packages/core/skills/using-git-worktrees/SKILL.md — Unguarded prose. Not touched by any other Wave 2 item. — (no Wave 2 partners)
- packages/crew/skills/driving-claude-code-sessions/SKILL.md — Unguarded prose in `packages/crew`. Not touched by any other Wave 2 item. — (no Wave 2 partners)

Gates:
```bash
pnpm --filter @bubstack/moe-core run test
test -z "$(grep -rn 'Never dispatch multiple implementation subagents in parallel' packages/core/skills/)"
test -z "$(grep -rn 'Never dispatch multiple implementers in parallel' packages/core/skills/)"
test "$(grep -c worktree packages/core/skills/dispatching-parallel-agents/SKILL.md)" -gt 0
! grep -nE '\$SKILL/moe-crew launch worker-(api|ui) ~/proj$' packages/crew/skills/driving-claude-code-sessions/SKILL.md
grep -q 'LEAN_TIER_COUNT = 13' packages/core/test/metadata.test.ts
grep -A1 '^  dispatching-parallel-agents:' packages/core/skill-tiers.yaml | grep -q 'tier: everything'
pnpm --filter @bubstack/moe-core run mint:check
```

Drift:
- Doc references `LEAN_TIER_BUDGET` throughout Verification/Prerequisites → The constant on main is `LEAN_TIER_COUNT`, not `LEAN_TIER_BUDGET` (see metadata.test.ts:143 and commit 5a1b67a). Any grep/assertion must key on `LEAN_TIER_COUNT`.
- Doc says worktrees are gitignored at `.gitignore:25-27` → .gitignore line 25 is `.DS_Store`; worktrees are ignored via `.claude/` at line 32.
- Doc refers to `skill-tiers.yaml:306` for decision D2 → The D2 CURRENT POLICY comment is at line 310 of skill-tiers.yaml on main.
- 'W01P01 grows that file from ~595 to 925 lines' → metadata.test.ts on main is 964 lines.
- Doc cites items by W##P## prefix throughout → Per WAVES.md must cite by slug. `parallel-execution-option` is currently at W02P04, not W07P03.
- Doc verifies anchors on main today (SDD:282, implementing-tasks:101, dispatching-parallel-agents:66-77, writing-plans:157-163, crew:195-209, launch.ts:66-70) → Confirmed accurate; recorded so the executor knows these anchors hold.

Lens verdicts: correctness: risky · integration-risk: safe

## Blocked

### codegraph-context-layer

Blocking lens: correctness

Reason: "Gate ordering is wrong and will fail: metadata.test.ts:772-793 asserts `readdirSync(plugins/moe-core/skills)` equals the core-tier list, and a second assertion checks the everything plugin is a strict superset. With `retrieving-context: { tier: core }` added, both assertions fail until `pnpm mint` regenerates `plugins/moe-core/skills/` and `plugins/moe-everything/skills/`. The gates list `pnpm --filter @bubstack/moe-core test` and `pnpm check` FIRST and `pnpm mint` LAST — the tests will red before mint ever runs."

Suggested fixes:
- Reorder gates: `pnpm mint` (and `pnpm mint:check`) BEFORE `pnpm --filter @bubstack/moe-core test` and `pnpm check`, otherwise metadata.test.ts's two `emits ... plugin` assertions at :772-793 red on the first run.
- Specify the exact MCP tool identifier form (`mcp__<server>__<tool>`) for the two agents' `tools:` allowlists and derive the concrete prefix by inspecting `~/.claude.json` `mcpServers.codegraph` and `mcpServers.moedex`.
- Update the stale comment in `packages/core/mint/moe-everything.yaml:49` alongside `moe-core.yaml:61-64` and add the file to `files.write`.
- List the mint-emitted files as writes: `plugins/moe-core/skills/retrieving-context/**`, `plugins/moe-core/agents/search-{codegraph,moedex}.md`, and the `plugins/moe-everything/*` mirrors — they are committed generated output.
- Correct the `files.read` path from `packages/core/scripts/mint-plugins.mjs` (does not exist) to `scripts/mint-plugins.mjs`.
- Add a description-collision review step against the 13 core-tier `description:` lines before landing `tier: core`.
- Update `touches:` frontmatter to include `packages/core/test/metadata.test.ts` (contention with 3 other Wave 2 items).
- Mandate the narrow per-skill D2 assertion variant (name retrieving-context explicitly), not the broad `.toBeOneOf` widening — the surrounding comment's 'reversible by deliberate decision' clause is per-skill, not per-manifest.
- Promote the trigger-collision grep against every core-tier skill's `use when …` fragment from mitigation-note to formal gate before `pnpm --filter @bubstack/moe-core test`.
- Consider adding a metadata.test.ts assertion that every file in `packages/core/agents/` appears in both generated plugins post-mint.

Additional high-severity concerns:
- MCP tool identifiers in the agent `tools:` allowlist are almost certainly wrong. The working example in-repo (`packages/memory/agents/search-conversations.md:14`) uses the full `mcp__<server>__<tool>` form. The plan tells the executor to allowlist bare names, leaving the agent unable to call anything. The `grep -q '^tools:' ...` gate only checks the key exists, not that the tokens resolve.

## In-branch (skipped)

(none)

## Merged (skipped)

(none)

## Integration reminders
- A worker's findings are scoped to the tree it read; its report names the SHA.
- Reviewers compare SHAs before comparing claims.
- Cross-boundary citations use a test name, symbol or quoted sentence — never a line number.
