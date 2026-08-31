# Wave 2 Execution Status

## Base
Base: main@695bb103 — 4 items attempted, 0 ship, 4 iterate, 0 block, 0 skipped.
Report source: /Users/zakkeown/Code/tools/moe/.planning/wave2-execution-report.md (report base c404a39c). Worktrees under: /Users/zakkeown/Code/tools/moe/.claude/worktrees/wave2
Baseline main suite: green. Baseline on main@695bb103 is green. `pnpm --filter @bubstack/moe-core test` passed 51/51 tests across 3 files (ci-config, house-voice, metadata) in 1.83s. `pnpm mint:check` regenerated all 6 plu

## Ready to merge

_None met the strict "ship + all gates green" bar. See Iterate — three items are verify-verdict `ship` but failed at least one gate (each failure is a gate-command or environmental defect, not an implementation defect; details per item)._

## Iterate

### deterministic-task-dag
Branch: wave2/deterministic-task-dag (commit: 3dce5302)
What went right: Adds the first fork-authored skill `sequencing-plans` (everything-tier), a Node CLI `packages/core/hooks/plan-set` (Kahn ready-set with next/done/check plus transitive blocked-closure), and a bash SessionStart hook `plan-set-notice` that always exits 0. Extends the extensionless-shebang router with a `node` branch and mirrors the floor; fills the load-bearing `{}` under `authored:`; regenerates plugins deterministically. All 16 gates green (test/lint/build/mint/mint:check plus manual invariants).
What needs another pass:
- Five W##P## prefix citations were reintroduced in new files — `packages/core/skill-tiers.yaml:343`, `packages/core/test/metadata.test.ts:513`, `packages/core/test/metadata.test.ts:587`, `packages/core/hooks/plan-set-notice:15`, and `packages/core/hooks/plan-set:38`. WAVES.md forbids the prefix; four of the five also mis-spell the filename as `W02P02-deterministic-task-dag.md` when the real file is `W02P02 - deterministic-task-dag.md`, so the paths are broken at write time. `skill-tiers.yaml` even carries a nearby comment (~L207-209) documenting the same failure from a previous re-wave. (severity: medium)
- `plan-set-notice` globs `MANIFESTS=("$CWD"/docs/moe/plans/*-MANIFEST.md)` and immediately probes `${MANIFESTS[0]}` under `set -u`. If the invoking shell has `shopt -s nullglob` inherited from a user's rc, the array is empty and the script errors with "unbound variable" before the `-f` guard fires. (severity: low)

Suggested next step: strip the `W02P02 ` prefix from all five citations (or drop the paths entirely and cite by slug in prose), and guard the manifest glob with `if [ ${#MANIFESTS[@]} -eq 0 ] || [ ! -f "${MANIFESTS[0]}" ]; then exit 0; fi`.

### mattpocock-skills-import
Branch: wave2/mattpocock-skills-import (commit: 94a1b65f)
What went right: Imports four mattpocock/skills (codebase-design, improve-codebase-architecture, domain-modeling, prototype) into `packages/core/skills/` and mirrors to `plugins/moe-everything/`; adds two companion references (fowler-smells under requesting-code-review, writing-for-agents renamed to skill-typography/skill-mechanics under writing-skills). Strips `disable-model-invocation`, rewrites `grilling` → `brainstorming`, lands `mattpocock-skills.MIT.LICENSE`, updates PARITY.md at 6654f6b, and threads the 27→31 count through ARCHITECTURE.md, `skill-tiers.yaml`, and `metadata.test.ts` (with a copyright substring assertion). @bubstack/moe-core 51/51 pass; `pnpm mint:check` clean.
What needs another pass:
- Failed gate `pnpm check` — `@bubstack/moe-glass` test suite red because Chrome/Chromium is not installed on this runner and a markdown-cap test times out. Reproduces on the base SHA with the branch stashed, so it is pre-existing environmental, not a regression.
  ```
  @bubstack/moe-glass:test:  FAIL test/lib/chrome-process.test.mjs > startChrome > rejects with an actionable error when the launched Chrome process exits before responding
  @bubstack/moe-glass:test: (Chrome not found. Searched: /Applications/Google Chrome.app/Contents/MacOS/Google Chrome, /Applications/Chromium.app/Contents/MacOS/Chromium)
  @bubstack/moe-glass:test:  FAIL test/lib/page-scripts/markdown.test.mjs > page-scripts/markdown > caps output at 50000 chars
  ```
- `domain-modeling/CONTEXT-FORMAT.md` dodges the relative-link resolver by stripping the `./` prefix from three illustrative links (`src/ordering/CONTEXT.md` etc). Test satisfied; the links still read as links but resolve to nothing on a reader's disk. (severity: low)

Suggested next step: treat the branch as mergeable and file the Chrome/Chromium check gap as a separate infrastructure ticket; if you want the domain-modeling example tightened, either drop the parentheses so the paths render as plain names, or fence the block with an explicit "for illustration only" note.

### moe-bare-binary-dispatcher
Branch: wave2/moe-bare-binary-dispatcher (commit: bc278926)
What went right: Adds `bin/moe.js` — a Node-stdlib-only ESM dispatcher for `moe <ns> [args...]` across the seven namespace bins with sibling → PATH → checkout-fallback resolution (uv for proof, `moe-tab.exe` on win32, dist bundles for the five Node bins). Detects WSL, refuses `moe crew` on native Windows with a WSL2 message, forwards SIGINT/SIGTERM, and exposes a pure `resolve()` for testing. Ships a 20-test vitest at `bin/test/moe.test.mjs` that never spawns real bins. Rewrites ARCHITECTURE §7 Binaries, adds §7.1 (claimants table), inserts `bin/` into §3's target tree, adds a README "On the command line" section, a path-scoped `bin:` GitLab job with `rules: changes bin/**/*`, and root `package.json` entries for `bin.moe` + `bin:test`.
What needs another pass:
- Seven of the plan gates failed because the harness ran them in `/Users/zakkeown/Code/tools/moe` (main workspace on 695bb10, no branch applied) instead of the worktree. Re-executed inside the worktree, every one of them passes.
  ```
  cd /Users/zakkeown/Code/tools/moe && pnpm bin:test
    → [ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL] Command "bin:test" not found (main has no bin: script)
  cd /Users/zakkeown/Code/tools/moe && test "$(head -1 bin/moe.js)" = '#!/usr/bin/env node'
    → head: bin/moe.js: No such file or directory
  grep -q '## 7.1' /Users/zakkeown/Code/tools/moe/ARCHITECTURE.md
    → (main ARCHITECTURE.md has ## 1..## 8 only; §7.1 lives in the worktree)
  grep -q '^bin:' /Users/zakkeown/Code/tools/moe/.gitlab-ci.yml
    → (main .gitlab-ci.yml has no bin: stage; branch adds it)
  ```
- No defect in the diff itself; verify verdict is `ship` on the branch content.

Suggested next step: fix the workflow to execute gate commands inside the branch worktree (or apply the branch to the main workspace) before evaluating, then treat the branch as mergeable — no code change needed on this branch.

### parallel-execution-option
Branch: wave2/parallel-execution-option (commit: d5fcb0c0)
What went right: Replaces the blanket "never dispatch multiple implementers in parallel" bans in `subagent-driven-development` and `implementing-tasks` with a portable worktree-gated dispatch rule defined once in `dispatching-parallel-agents` (three-part gate, degradation ladder, divergent-tree rule). SDD gains Wave-grouping preflight and Integrate-the-wave steps; `using-git-worktrees` adds Step 1c (one worktree per worker); `writing-plans` extends Execution Handoff. `metadata.test.ts` adds an invariant asserting every parallel-dispatch skill names a sequential fallback (8-entry allowlist, 52/52 pass). The crew fan-out example now branches each worker from a recorded base SHA into its own worktree. Plugins/ regenerated deterministically.
What needs another pass:
- Failed gate `pnpm --filter @bubstack/moe-core run mint:check` — the script does not exist inside the `@bubstack/moe-core` workspace; `mint:check` is a repo-root script. `pnpm run mint:check` at the repo root succeeds and the plugins tree is reproducible.
  ```
  pnpm --filter @bubstack/moe-core run mint:check
    → [ERR_PNPM_RECURSIVE_RUN_NO_SCRIPT] None of the selected packages has a "mint:check" script
  ```
- `skill-tiers.yaml`'s new `why:` for `dispatching-parallel-agents` cites `PARITY.md:90` — a line-number citation into unguarded prose, in the same commit that teaches (in the new divergent-tree section) that cross-boundary citations should use a symbol or quoted sentence, never a line number. Correct today, likely to drift. (severity: low)
- The parallel-dispatch invariant uses a hand-enumerated 8-skill allowlist; a future ninth parallel-dispatch skill would silently escape the check. Acknowledged trade-off; flagged as a v1 property to revisit. (severity: low)

Suggested next step: fix the plan gate to `pnpm run mint:check` (no `--filter`); rewrite the PARITY citation to reference the `dispatching-parallel-agents` row by subject rather than line 90; treat the branch as mergeable.

## Integration reminders (copy verbatim from WAVES.md)
- A worker's findings are scoped to the tree it read; its report names the SHA.
- Reviewers compare SHAs before comparing claims.
- Cross-boundary citations use a test name, symbol or quoted sentence — never a line number.
- Cite backlog items by slug — the W##P## prefix drifts and rots cross-references.
