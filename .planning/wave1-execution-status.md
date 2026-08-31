# Wave 1 Execution Status

## Base
Base: main@6b0e28c7 — 6 items attempted, 1 ship, 4 iterate, 0 block, 1 skipped.
Report source: /Users/zakkeown/Code/tools/moe/.planning/wave1-execution-report.md (report base 6b0e28c7). Worktrees under: /Users/zakkeown/Code/tools/moe/.claude/worktrees/wave1
Baseline main suite: green. Ran both baseline gates from /Users/zakkeown/Code/tools/moe on main@6b0e28c7. `pnpm --filter @bubstack/moe-core test` — 3 files, 51/51 tests pass (metadata 37, house-voice

## Ready to merge

### native-renderers
Branch: wave1/native-renderers
Commit: 064a7dc7 — wave1/native-renderers: add shared four-rung native-rendering ladder with grep-based guards
Files: 12 files
Gates: 6/6 green
```bash
✓ pnpm --filter @bubstack/moe-core test
✓ pnpm --filter @bubstack/moe-core test:brainstorm
✓ pnpm --filter @bubstack/moe-core lint
✓ test $(wc -l < packages/core/skills/_shared/native-rendering.md) -lt 100
✓ test -f packages/core/skills/_shared/native-rendering.md
✓ grep -q 'native-rendering.md' packages/core/skills/brainstorming/SKILL.md packages/core/skills/writing-plans/SKILL.md packages/core/skills/finding-duplicate-functions/SKILL.md
```
Verify diff summary: Adds `packages/core/skills/_shared/native-rendering.md` (73 lines) documenting a four-rung ladder (Claude Artifact / brainstorm companion / local HTML / markdown file) with a `MOE_ARTIFACT_SHARING` opt-in mirrored on `MOE_LATTE_ENABLED`. Adds ladder pointers to `brainstorming/SKILL.md`, `writing-plans/SKILL.md`, `finding-duplicate-functions/SKILL.md`, and all seven `using-moe/references/*-tools.md` files. Adds a new `describe("native rendering")` block in `metadata.test.ts` with three assertions: (a) any owned markdown mentioning `Artifact tool` / `publish an artifact` also references `native-rendering.md`, (b) the ladder exists and is referenced elsewhere, (c) the ladder documents `MOE_ARTIFACT_SHARING` as default-off within ~240 chars of the name. No mint/flight/marketplace changes; no line-number anchors in prose.
Merge command (do NOT auto-run):
```bash
git -C /Users/zakkeown/Code/tools/moe merge --no-ff wave1/native-renderers
```
Nits:
- MOE_ARTIFACT_SHARING is prose-only — no hook or adapter reads it, so default-off is doc-enforced, not machine-enforced. Fix: track a follow-up to wire it through the same reader that gates MOE_LATTE_ENABLED.
- Guard regex matches only exact `Artifact tool` / `publish an artifact`. Inflections like `publishes an artifact`, `publishing an artifact`, `Artifacts tool` will slip past. Fix: broaden the regex or add an authoring lint.

## Iterate

### installer-hq-dx
Branch: wave1/installer-hq-dx (commit: cf189963)
What went right: Adds two dependency-free ESM CLIs at repo root (bin/moe-doctor and bin/moe-install) plus supporting libs, flips marketplace.json entries for moe-memory and moe-glass to `{"source":"npm",…}`, generalises the install-doc adapters to emit real commands for non-github hosts, wires the doctor smoke suite into `pnpm test` via a new `test:bin` script, adds INSTALL.md and an ARCHITECTURE.md §6 pointer.
What needs another pass:
- Plan-defined gate `pnpm test` is red at exit 1. Failing suites: `@bubstack/moe-glass` — `test/lib/chrome-process.test.mjs` and `test/lib/page-scripts/markdown.test.mjs > caps output at 50000 chars` (5s timeout). Verifier confirmed both reproduce at base 6b0e28c and the diff does not touch packages/glass; failures are Chrome-absent + timing-sensitive. Still red per the plan's gate list.
- `bin/moe-install`'s `doAction()` carries two vestigial parameters (`planFn`, `scope`) silenced via `void s; void planFn` inside the loop — a half-completed refactor.
- Per-plugin install docs (`plugins/moe-*/docs/install/claude-code.md`) still print `/plugin install <name>@<name>-dev`, drifting from the deployed marketplace name `moe` used in `.claude-plugin/marketplace.json` and `moe-install`.
Suggested next step: Re-scope the failing gate to `pnpm --filter @bubstack/moe-mint test && pnpm test:bin` (or run it on a host with Chrome), delete `planFn`/`scope` from `doAction`, and set `marketplace.name: moe` in each plugin's `moe-mint.yaml` so the per-plugin docs render `@moe`.

### runtime-pruning
Branch: wave1/runtime-pruning (commit: 437b3a88)
What went right: Deletes packages/mint/src/adapters/gemini.ts and its test; removes gemini from ADAPTER_NAMES, the registry, docs-emit tables and both bootstrap-comment lists; strips grok from agents-marketplace, docs-emit and run-checks.sh; drops @google/gemini-cli and @xai-official/grok from the container image; regenerates snapshot; recounts 11→10 across ARCHITECTURE.md, PARITY.md, moe-core/README.md, mint/README.md, mint/docs/BROCHURE.md, mint/docs/CONFIG.md, moe-{core,everything}.yaml; test rewrites are semantic (cli.test.ts uses opencode as the prune subject, config.test.ts uses codex for the non-hook-emitting probe, opencode.test.ts asserts kimi→opencode→pi); prunes gemini-extension.json/GEMINI.md/install-doc/moe-backstory toml commands from all six plugin trees with matching manifest sha256 updates.
What needs another pass:
- Plan-defined gate `pnpm mint:check` is red — source configs `packages/core/mint/moe-{core,everything}.yaml` were recounted to "10 harness adapters" but the mirrored generated copies at `plugins/moe-{core,everything}/moe-mint.yaml` still say "11". The other plugin regenerations landed correctly; only those two files drift.
- Plan-defined leak gate `rg -i 'gemini|grok' packages/mint/src packages/mint/checks packages/mint/test infra/container` still hits three lines in `packages/mint/test/dogfood.test.ts` (a two-line explanatory comment and the two `HAND_MAINTAINED_PATHS` strings). The implementer's note argues this is semantically justified (pinned superpowers snapshot still ships those files), but the gate as written does not know that.
- `packages/mint/docs/BROCHURE.md` still contains legacy `eleven` / `Generated 32 files` claims in the `## Using it` transcript and footer, papered over with a new "one refresh away" caveat instead of a real re-record.
Suggested next step: Run `pnpm mint` in the worktree and commit the two `plugins/moe-{core,everything}/moe-mint.yaml` deltas; extend the leak-gate command with a third `grep -v` (or replace the two `HAND_MAINTAINED_PATHS` strings with a dynamic strip) and record the exclusion; re-record the BROCHURE transcript against the current CLI.

### tc-standards-conformance
Branch: wave1/tc-standards-conformance (commit: d9978a04)
What went right: Adds `packages/core/skills/_shared/tc-conventions.md` with a provenance manifest, rewrites Option 2 of `finishing-a-development-branch` and the GitHub-thread section of `receiving-code-review` to MR-first GitLab vocabulary, adds a `sc-{card}/{slug}` branch-name step to `using-git-worktrees`, sweeps "PR"/"pull request" out of `verification-before-completion`/`writing-clearly-and-concisely`/`writing-skills`/`codex-tools.md`, adds `CODEOWNERS`, `.gitlab/merge_request_templates/Default.md`, and a schedule-only `tc-conventions-drift` job. Deliberately did not touch `skill-tiers.yaml` or `metadata.test.ts`.
What needs another pass:
- Plan-defined gate `pnpm mint:check` is red — `pnpm mint` regenerates 13 `plugins/**/SKILL.md` files and adds 2 `plugins/**/_shared/tc-conventions.md` files that were not committed. WAVES.md's "regenerate last" note is a merge-order rule, not a license to ship a stale generated tree.
- Plan-defined gate `pnpm test` red — `@bubstack/moe-glass` `chrome-process.test.mjs` (Chrome not found) and `page-scripts/markdown.test.mjs > caps output at 50000 chars` (5s timeout). Diff does not touch packages/glass; likely environmental, verify on a fresh host.
- Scope reduction vs plan: the plan called for porting 17 tc-* skills into `packages/core/skills/`, adding 17 rows to `skill-tiers.yaml`, and bumping `LEAN_TIER_COUNT`. The implementer skipped all of it (defensibly — the plan-verify pass had flagged four hard problems including gitlab.tcdevops.com access), but the wave item is narrower than the backlog contract.
- Both provenance-manifest SHAs are `<TC-BOOTSTRAP-PENDING>` sentinels; the drift job soft-passes them, so the guard the manifest exists to provide is switched off.
Suggested next step: Run `pnpm mint` and commit the 13 SKILL.md + 2 tc-conventions.md regenerations; confirm with the wave owner whether overlay-only satisfies the backlog item or a follow-up slot is needed for the 17-skill port; fill both TC SHAs from an authenticated machine before merge.

### verification-split-and-firing-rate
Branch: wave1/verification-split-and-firing-rate (commit: 50d4d6f8)
What went right: Adds a default-ON Node Stop hook `moe-completion-evidence` registered as `Stop[0].hooks[1]` that parses the transcript JSONL, matches Bash `tool_use.input.command` against a verify-command allowlist, captures exit + 4KB output tail, counts Skill `tool_use` entries, and writes `<session>-<turn>.json` + `<session>-firing.json` into `$HOME/.claude/moe/audit/<repo-basename>/` (with `MOE_EVIDENCE_HERE=1` opting back into repo-local `.audit/`). Adds a Goal-Backward Verification section and fixture; extends the extensionless-shebang router in `metadata.test.ts` (node floor 4→5) with four new assertions. Mirrors hook + hooks.json into both plugin trees; `pnpm mint:check` passes clean.
What needs another pass:
- Plan-defined gate `pnpm check` is red at exit 1. Failing suites: `@bubstack/moe-glass` `chrome-process.test.mjs > startChrome rejects when the spawned proc emits error` (Chrome absent → auto-detect fails before the injected spawn-error path) and `page-scripts/markdown.test.mjs > caps output at 50000 chars` (5s timeout). Diff does not touch packages/glass; likely pre-existing, but the plan enumerated `pnpm check` as a gate.
- Warning semantics don't match the implementation: the code walks the entire transcript, so `evidence` and `skillsFired` are session-wide totals — the "no matching verification command this turn" stderr fires only when the session has never seen one, not per-turn as the wording implies. Per-turn output files also carry cumulative counts.
- Completion-claim regex includes `\b(?:done|complete|finished|ready|all\s+set)\b` — matches large amounts of normal assistant prose. Combined with the session-wide gate, false positives are rare but early-session mentions can emit spurious warnings.
- `pnpm --filter @bubstack/moe-core lint` shows 4 new biome warnings on `metadata.test.ts` (`Unexpected template string placeholder`) around `expect(cmd).toContain('node "${CLAUDE_PLUGIN_ROOT}/…"')`. Non-blocking (exit 0) but pollutes the warning count.
Suggested next step: Confirm the two glass failures pre-exist at base on the same host (Chrome-absent + timeout) and either scope the gate or mark those tests skipped; either filter for the last user→assistant boundary before building `evidence`/`skillsFired` or rename the warning to "this session"; tighten or drop the last two completion-claim patterns; add `biome-ignore` directives on the four new expects.

## Skipped
- gsd-core-skill-import — implementer decided no changes were needed. Note: precondition unmet: the `.moe-references/` snapshot directory does not exist at the convention this repo enforces. PARITY.md, ARCHITECTURE.md §3, and every packages/*/READM

## Integration reminders (copy verbatim from WAVES.md)
- A worker's findings are scoped to the tree it read; its report names the SHA.
- Reviewers compare SHAs before comparing claims.
- Cross-boundary citations use a test name, symbol or quoted sentence — never a line number.
- Cite backlog items by slug — the W##P## prefix drifts and rots cross-references.
