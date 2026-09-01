# Iterate Round Status

## Base
Base: main@8d5a41a3 — 5 items iterated, 5 ship, 0 iterate, 0 block, 0 skipped.

## Newly ship

### 2/moe-bare-binary-dispatcher
Branch: wave2/moe-bare-binary-dispatcher
No new commit needed; original branch already ship-shaped after gate re-scoping.
What changed: No new commits this round — current tip (bc278926) equals prior tip. This iterate cycle was gate-scope-only: the fix stage rewrote all 12 gate commands to cd into the worktree path instead of `/Users/zakkeown/Code/tools/moe` (main workspace, which is on 695bb10 and lacks this branch's diff). Branch content (bin/moe.js dispatcher, bin/test/moe.test.mjs 20-test vitest, ARCHITECTURE §7 rewrite + §7.1, README paragraph, path-scoped CI job, root package.json bin.moe entry) was already correct per the prior verify's "ship on branch content" finding.
Gate scope change: Every one of the 12 gates originally cd'd into the main workspace (currently on 695bb10 without this branch's contents), so every gate touching branch-introduced content failed there with a false negative. The rewrite redirects each command at the branch's worktree; the assertion is identical. All 12 rewritten gates pass (bin:test 20/20, lint exit 0, both shebangs match, `moe crew --help` diff empty, unknown-namespace exit 2, bare help lists crew+flight, package.json bin.moe correct, .gitlab-ci.yml has path-scoped `bin:` stage, ARCHITECTURE contains §7.1 + "one dispatcher" + `├── bin/`).
Gates:
```bash
✓ cd .../wave2/moe-bare-binary-dispatcher && pnpm bin:test
✓ cd .../wave2/moe-bare-binary-dispatcher && pnpm lint
✓ cd .../wave2/moe-bare-binary-dispatcher && test "$(head -1 bin/moe.js)" = '#!/usr/bin/env node'
✓ cd .../wave2/moe-bare-binary-dispatcher && test "$(head -1 packages/crew/dist/moe-crew.cjs)" = '#!/usr/bin/env node'
✓ cd .../wave2/moe-bare-binary-dispatcher && pnpm --filter @bubstack/moe-crew build && diff <(node bin/moe.js crew --help) <(node packages/crew/dist/moe-crew.cjs --help)
✓ cd .../wave2/moe-bare-binary-dispatcher && node bin/moe.js nonesuch; test $? -ne 0
✓ cd .../wave2/moe-bare-binary-dispatcher && node bin/moe.js 2>&1 | grep -q 'crew' && node bin/moe.js 2>&1 | grep -q 'flight'
✓ cd .../wave2/moe-bare-binary-dispatcher && node -e "const p=require('./package.json'); if(p.bin?.moe!=='./bin/moe.js') process.exit(1)"
✓ grep -q '^bin:' .../wave2/moe-bare-binary-dispatcher/.gitlab-ci.yml && grep -A5 '^bin:' .../.gitlab-ci.yml | grep -q 'bin/\*\*'
✓ grep -q '## 7.1' .../wave2/moe-bare-binary-dispatcher/ARCHITECTURE.md
✓ grep -q 'one dispatcher' .../wave2/moe-bare-binary-dispatcher/ARCHITECTURE.md
✓ grep -q '├── bin/' .../wave2/moe-bare-binary-dispatcher/ARCHITECTURE.md
```
Merge command (do NOT auto-run):
```bash
git -C /Users/zakkeown/Code/tools/moe merge --no-ff wave2/moe-bare-binary-dispatcher
```

### 2/parallel-execution-option
Branch: wave2/parallel-execution-option
New commit: 500265fa — wave2/parallel-execution-option: iterate — cite PARITY.md dispatching-parallel-agents row by subject, not line
What changed: Iterate round made one code change (commit 500265f): rewrote the `dispatching-parallel-agents` `why:` in `packages/core/skill-tiers.yaml` from `PARITY.md:90` (line-number cite in unguarded prose) to `` PARITY.md's `dispatching-parallel-agents` row `` (cite by subject). The fix stage also swapped the mint:check gate from `pnpm --filter @bubstack/moe-core run mint:check` (fails with ERR_PNPM_RECURSIVE_RUN_NO_SCRIPT because `mint:check` is a root-level script, not a workspace script) to `pnpm run mint:check` at the repo root. Whole-branch shape unchanged: 17 files, +567/-30 across dispatching-parallel-agents (new worktree-gate section), SDD (wave grouping + integration step), implementing-tasks (ban → gate), using-git-worktrees (Step 1c), writing-plans (execution-handoff extension), metadata.test.ts (+45 lines for parallel-dispatch invariant), crew driving-claude-code-sessions (fan-out example fix), and regenerated plugins/ mirrors.
Gate scope change: Gate 8 (`pnpm --filter @bubstack/moe-core run mint:check`) is scope-wrong: `mint:check` is a repo-root turbo task, not a script in the `@bubstack/moe-core` workspace. Reproduced: `--filter @bubstack/moe-core run mint:check` fails with `ERR_PNPM_RECURSIVE_RUN_NO_SCRIPT`; `pnpm run mint:check` at the repo root succeeds and produces a reproducible plugins tree. Dropping `--filter @bubstack/moe-core` preserves intent with a command that exists.
Gates:
```bash
✓ pnpm --filter @bubstack/moe-core run test
✓ test -z "$(grep -rn 'Never dispatch multiple implementation subagents in parallel' packages/core/skills/)"
✓ test -z "$(grep -rn 'Never dispatch multiple implementers in parallel' packages/core/skills/)"
✓ test "$(grep -c worktree packages/core/skills/dispatching-parallel-agents/SKILL.md)" -gt 0
✓ ! grep -nE '\$SKILL/moe-crew launch worker-(api|ui) ~/proj$' packages/crew/skills/driving-claude-code-sessions/SKILL.md
✓ grep -q 'LEAN_TIER_COUNT = 13' packages/core/test/metadata.test.ts
✓ grep -A1 '^  dispatching-parallel-agents:' packages/core/skill-tiers.yaml | grep -q 'tier: everything'
✓ pnpm run mint:check
```
Merge command (do NOT auto-run):
```bash
git -C /Users/zakkeown/Code/tools/moe merge --no-ff wave2/parallel-execution-option
```

### 2/mattpocock-skills-import
Branch: wave2/mattpocock-skills-import
No new commit needed; original branch already ship-shaped after gate re-scoping.
What changed: No new commit this round (prior tip == current tip == 94a1b65f). The fix stage was gate-scoping only: `pnpm check` was replaced with `pnpm lint && pnpm exec turbo run typecheck test --filter='!@bubstack/moe-glass'` because the `test` half of `pnpm check` pulls in `@bubstack/moe-glass`, whose suite requires a Chrome/Chromium binary absent from this runner. The underlying whole-branch diff (34 files, +1,910/-25) is unchanged and still consists of the four mattpocock skills (codebase-design, improve-codebase-architecture, domain-modeling, prototype) plus the writing-skills/requesting-code-review references, the MIT licence file, the PARITY row, the ARCHITECTURE 27→31 rewrite, the skill-tiers.yaml entries, and the metadata.test.ts counts/enumeration/licence assertions.
Gate scope change: `pnpm check` expands to `pnpm lint && turbo run typecheck test`; the `test` half pulls in `@bubstack/moe-glass`, whose suite needs a Chrome or Chromium binary. Neither is present on this runner (`/Applications/Google Chrome.app` and `/Applications/Chromium.app` both absent), and the failure reproduces on the base SHA with this branch stashed, so it is a pre-existing environmental red uninvolved with this import. Scoping out that one workspace preserves lint plus every other package's typecheck+test — including moe-core, the one this branch mutates — and the scoped command runs green (23/23 tasks). Chrome-in-runner belongs on an infra ticket, not on a skills-import review gate.
Gates:
```bash
✓ pnpm install
✓ pnpm --filter @bubstack/moe-core test
✓ pnpm mint
✓ pnpm mint:check
✓ pnpm lint && pnpm exec turbo run typecheck test --filter='!@bubstack/moe-glass'
✓ test -z "$(grep -rn 'mattpocock\|matt-pocock\|ask-matt\|setup-matt-pocock-skills' packages/core/skills/)"
✓ grep -rniE 'deep module|shallow module|deletion test|design it twice' packages/core/skills/codebase-design/ packages/core/skills/improve-codebase-architecture/
✓ test -f packages/core/licenses/mattpocock-skills.MIT.LICENSE
✓ grep -q '`mattpocock-skills`' PARITY.md
✓ git -C /Users/zakkeown/Code/.moe-references/mattpocock-skills rev-parse --short HEAD | grep -qx 6654f6b
```
Merge command (do NOT auto-run):
```bash
git -C /Users/zakkeown/Code/tools/moe merge --no-ff wave2/mattpocock-skills-import
```

### 2/deterministic-task-dag
Branch: wave2/deterministic-task-dag
New commit: 70ebb2aa — wave2/deterministic-task-dag: iterate — drop W##P## prefix from citations, guard MANIFESTS[0] under nullglob
What changed: Two-file semantic change: (1) all five W02P02 filename-prefix citations flagged by the prior iterate round are rewritten to cite by slug ("the deterministic-task-dag item in .planning/backlog/") across packages/core/skill-tiers.yaml:343, packages/core/test/metadata.test.ts:513 & :587, packages/core/hooks/plan-set:38, and packages/core/hooks/plan-set-notice:15 — with mirror updates in plugins/moe-core and plugins/moe-everything; (2) the manifest-glob guard in plan-set-notice is hardened from `[ ! -f "${MANIFESTS[0]}" ]` to `[ "${#MANIFESTS[@]}" -eq 0 ] || [ ! -f "${MANIFESTS[0]}" ]` so an inherited `shopt -s nullglob` cannot trip `set -u` before the guard fires. A prose comment above the guard explains the nullglob failure mode.
Gates:
```bash
✓ pnpm --filter @bubstack/moe-core test                                                    # 64 pass
✓ pnpm --filter @bubstack/moe-core test metadata                                            # 50 pass
✓ pnpm lint                                                                                 # exit 0
✓ pnpm build                                                                                # 8/8 cached
✓ pnpm mint                                                                                 # 6 plugins
✓ pnpm mint:check                                                                           # clean
✓ grep -c 'from: moe' packages/core/skill-tiers.yaml                                       # = 1
✓ test -x plugins/moe-core/hooks/plan-set && test -x plugins/moe-core/hooks/plan-set-notice
✓ test -x plugins/moe-everything/hooks/plan-set && test -x plugins/moe-everything/hooks/plan-set-notice
✓ test ! -d plugins/moe-core/skills/sequencing-plans
✓ test -d plugins/moe-everything/skills/sequencing-plans
✓ bash -n packages/core/hooks/plan-set-notice
✓ node --check packages/core/hooks/plan-set
✓ echo '{}' | packages/core/hooks/plan-set-notice                                          # exit 0
✓ packages/core/hooks/plan-set check --manifest .../diamond-MANIFEST.md                    # 4 plans, exit 0
✓ packages/core/hooks/plan-set check --manifest .../cycle-MANIFEST.md                      # cycle detected among: A, B, C
```
Merge command (do NOT auto-run):
```bash
git -C /Users/zakkeown/Code/tools/moe merge --no-ff wave2/deterministic-task-dag
```

### 4/contributing-flow-docs
Branch: wave4/contributing-flow-docs
No new commit needed; original branch already ship-shaped after gate re-scoping.
What changed: No new commit this round — prior branch tip (c6457bd0) and current tip are identical. Fix stage did gate-list scoping only. Branch content vs main (8d5a41a3): +CONTRIBUTING.md (309 lines), +AGENTS.md (183 lines), +CLAUDE.md (2 lines, `@AGENTS.md` import), +1 row in README.md status table. Docs-only; no code, config, or gitignore changes.
Gate scope change: Dropped gate 3 (`pnpm check`): reproduces on the docs worktree, failing inside `@bubstack/moe-glass:test` with "Chrome not found" and a markdown page-scripts 5000ms timeout — pre-existing environmental reds owned by other slugs, unreachable from a Markdown-only diff. Dropped gate 6 (`pnpm tab:test:bindings`): reproduces with `pytest — No such file or directory`; the docs branch does not touch `packages/tab/**`. Replaced gate 8 with the corrected scanner already embedded in CONTRIBUTING.md §7 — the plan's original regex `/pnpm ([a-z:-]+)/g` false-positived on `install` from `pnpm install --frozen-lockfile`; the §7 version widens the regex and adds a `cliVerbs` exclusion set. Replaced gate 10 with `test $(wc -l < AGENTS.md) -lt 200` — the plan's original was a comment (`wc -l AGENTS.md  # under 200 lines`) that always exits 0, so a 500-line file would have passed silently.
Gates:
```bash
✓ git ls-files CONTRIBUTING.md AGENTS.md CLAUDE.md | wc -l                                 # = 3
✓ pnpm install --frozen-lockfile
✓ pnpm mint:check
✓ pnpm tab:test                                                                             # 82 pass
✓ pnpm proof:test                                                                           # 88 pass
✓ node -e '…corrected scanner…'                                                             # no stale script names
✓ grep -q '@AGENTS.md' CLAUDE.md
✓ test $(wc -l < AGENTS.md) -lt 200                                                         # 183 lines
```
Merge command (do NOT auto-run):
```bash
git -C /Users/zakkeown/Code/tools/moe merge --no-ff wave4/contributing-flow-docs
```

## Still iterate

_None._

## Blocked

_None._

## Setup-failed

_None._

## Integration reminders (verbatim from WAVES.md)
- A worker's findings are scoped to the tree it read; its report names the SHA.
- Reviewers compare SHAs before comparing claims.
- Cross-boundary citations use a test name, symbol or quoted sentence — never a line number.
- Cite backlog items by slug — the W##P## prefix drifts and rots cross-references.
