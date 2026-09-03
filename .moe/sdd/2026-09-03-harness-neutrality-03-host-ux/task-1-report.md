# Task 1 report: crew harness resolution and neutral state

## Status

Implemented against base `235656d8dbdf95d1232c6fc47c02c482a55c0613`.

- Added one typed harness resolver with precedence `worker > command > pack > environment > sole installed`.
- Made launch, pack launch/send, pack stop, and per-worker command routing use resolved or persisted worker harnesses without a Claude fallback for persisted state.
- Added executable detection for `claude`, `codex`, and `pi` using each driver's configured executable, with injectable environment and probe functions.
- Moved consent to `$XDG_STATE_HOME/moe/crew/consent`, falling back to `~/.local/state/moe/crew/consent`; the legacy Claude consent file is neither read nor migrated.
- Replaced the generic plugin-root override with `MOE_CREW_PLUGIN_ROOT`, then the bundle-relative fallback. Claude Code hook-owned `CLAUDE_PLUGIN_ROOT` references remain in the Claude hook manifest.
- Kept Claude transcript path construction in the Claude driver and its driver tests.
- Updated CLI/skill/marketplace language for Claude Code, Codex, and Pi and added a focused test tying the root marketplace description to the mint source.
- Regenerated all changed `plugins/moe-crew/**` artifacts exclusively with `pnpm mint`.

## TDD evidence

### Primary RED

Command:

```text
mise exec -- corepack pnpm --filter @bubstack/moe-crew exec vitest run test/harness-resolution.test.ts test/consent.test.ts test/paths.test.ts test/claude-driver.test.ts test/packs.test.ts test/cli.test.ts --reporter verbose
```

Result: **RED** — 5 files failed, 1 passed; 17 tests failed and 77 passed. The failures demonstrated the missing resolver, Claude-owned consent/default behavior, absent pack `defaultHarness`, missing neutral plugin-root API, uncontrolled corrupt-state handling, and ambiguous detection reaching the consent path instead of returning exit 2 before launch.

### Primary GREEN

The same focused six-file command after implementation passed: **6 files, 100 tests**.

### Mixed-fleet mutation proof

The mixed `pack-stop` test was deliberately run against a temporary shared-driver mutation:

```text
mise exec -- corepack pnpm --filter @bubstack/moe-crew exec vitest run test/packs.test.ts -t "stops a mixed pack" --reporter verbose
```

Result: **RED** — the Codex worker received Claude's `/exit` instead of Codex's `/quit`. Restoring per-worker driver routing made the same test **GREEN** — 1 passed.

### XDG empty-value edge case

Focused consent/CLI run after adding the empty-XDG test: **RED** — 1 failed, 49 passed; an empty value produced relative `moe/crew/consent`. After treating empty as unset, the same command was **GREEN** — 2 files, 50 tests.

## Final verification

- `mise exec -- pnpm --filter @bubstack/moe-crew build` — PASS. Run before the final integration suite; CJS/ESM bundles built successfully.
- `mise exec -- pnpm --filter @bubstack/moe-crew test` — PASS: 46 files, 491 tests, including all 12 real-tmux Claude/Codex/Pi integration tests.
- `mise exec -- pnpm --filter @bubstack/moe-crew typecheck` — PASS.
- `mise exec -- pnpm --filter @bubstack/moe-crew lint` — PASS with 31 existing warning-level diagnostics and 1 informational diagnostic; no error-level findings.
- `mise exec -- pnpm mint` — PASS; six plugins regenerated and only `plugins/moe-crew/**` changed.
- `mise exec -- pnpm mint:check` — PASS after the atomic commit; forced regeneration left `plugins/` byte-identical to committed `HEAD`.
- `git diff --check` — PASS.

The first `mint` attempt through `mise exec -- corepack pnpm` exposed a nested Turbo shim at pnpm 11.20.0 and was rejected by the repository's pnpm 11.23.0 requirement. Re-running through the Mise-pinned direct `pnpm` executable used 11.23.0 and passed. A pre-commit `mint:check` regenerated successfully, then failed only its expected `git diff --exit-code -- plugins` step because the new generated artifacts were not yet committed.

## Baseline lint hygiene

The crew lint gate initially had error-level Biome formatting/import-order failures already present at the base SHA. With parent approval, I applied formatting-only/import-order changes to:

- `packages/crew/src/commands/stop.ts`
- `packages/crew/src/core/runs.ts`
- `packages/crew/src/core/worktree.ts`
- `packages/crew/test/runs.test.ts`
- `packages/crew/test/worktree.test.ts`

No behavior was changed in those files. Their covering tests and the full crew suite pass.

## Self-review

- Confirmed every present higher-precedence value is validated rather than bypassed; unknown or unreadable persisted worker values return a controlled exit-2 diagnostic naming valid harness IDs.
- Confirmed zero installed harnesses and multiple installed harnesses return exit 2; ambiguous launch/pack resolution occurs before tmux or worker-state mutation.
- Confirmed per-worker pack values override command, pack, environment, and install defaults; mixed pack launch/send/stop use each worker's driver.
- Confirmed generic source no longer constructs Claude transcript paths or reads `CLAUDE_PLUGIN_ROOT`; remaining live `CLAUDE_PLUGIN_ROOT` use is confined to Claude Code hooks.
- Confirmed the legacy `~/.claude/.moe-crew-consent` path appears only in the explicit legacy-ignore test and historical documents.
- Confirmed the root marketplace retains registry name/source consistency and its harness-neutral description exactly matches the crew mint source.
- Confirmed generated plugin files were not hand-edited.

## Concerns

No task-blocking concerns. The existing crew lint warnings and tsup's existing unused-import warnings for the generated Pi extension bundle remain non-failing baseline diagnostics.
