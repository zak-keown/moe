# Task 1 report — normalize existing Core Node helpers

Base: `0d949d1`. Branch: `feature-skill-backend-runtime`.

## Summary

Normalized all existing Core Node skill helpers to the approved runtime
boundary: dependency-free Node 24 ESM `.mjs`, mode 0644, no shebang,
`node:` built-in imports only, `execFileSync`/`spawnSync` with argument
arrays (no shell), and symlink-safe `isDirectEntry()` guards.

## Changes

### CJS→ESM conversions
- `update_docs.cjs` → `scripts/update_docs.mjs`: named exports
  `getClaudeCodeUrls`/`fetchAndSaveDoc`, `isDirectEntry()` guard,
  `{ agent: false }` on HTTP requests (prevents Node 24 keep-alive
  from blocking process exit), preserved `process.exit(1)` on fatal
  error (original CJS behavior).
- `render-graphs.mjs` → `scripts/render-graphs.mjs`: moved into
  `scripts/` subdirectory, added named pure exports, `isDirectEntry()`
  guard, sanitized `skillName` to DOT-safe characters (`/[^\w]/g`).

### Review/docs helper normalization
- `docs-verify-report.mjs`, `compact-resolved.mjs`,
  `stamp-disposition.mjs`, `review-check.mjs`, `review-merge.mjs`,
  `review-scope.mjs`, `review-verify-record.mjs`,
  `review-verify-scope.mjs`: removed shebangs, switched from
  `#!/usr/bin/env node` to dependency-free ESM with `node:` imports,
  mode 0644. `compact-resolved.mjs` had 0755 (corrected to 0644).

### Test suites
- `test/update-docs.test.ts` (5 tests): URL extraction, dedup/sort,
  redirect + UTF-8 split, filename safety, nonzero exit on failure.
  Spawn test uses connection-refused URL (not test server) to avoid
  spawnSync deadlock with event-loop-blocking.
- `test/render-graphs.test.ts` (3 tests): missing Graphviz error,
  diagram rendering via fake `dot`, symlink + `--combine` with
  command-injection-safe directory name.
- `test/docs-verify-report.test.ts` (3 tests): multi-finding merge,
  clean report, severity ordering.
- `test/codebase-review-scripts.test.ts`: 40 lines of new assertions
  added for normalized scripts.

### Infrastructure
- `vitest.config.ts`: added `pool: "forks"` (prevents Node 24
  keep-alive hang in default threads pool).
- `tsconfig.tests.json`: added `allowJs: true` (enables type-checking
  of `.mjs` imports from test files).
- `test/house-voice.test.ts`: removed now-unnecessary `@ts-expect-error`
  on `.mjs` import (resolved by `allowJs`).
- `metadata.test.ts`: updated `X_BIT_ALLOWLIST` — no new entries needed;
  `compact-resolved.mjs` removed its execute bit.
- Deleted `test/shell/test-render-graphs.sh` (replaced by Vitest suite).
- Deleted `docs-verify-report.test.mjs` (replaced by Vitest suite).

### Active references
- `working-with-claude-code/SKILL.md`: `.cjs` → `.mjs` path.
- `writing-skills/SKILL.md`: bare script → `node .../scripts/` path.

## Evidence

- 406/406 Core Vitest tests pass (20 files).
- Core typecheck clean (tsconfig.tests.json).
- Biome check clean on touched files.
- No plugins directory changes.
- All `.mjs` files at mode 0644, no shebangs.
- No `exec`/`execSync`/`shell:true` in normalized scripts.

## Deviations from brief

- Added `pool: "forks"` to vitest.config.ts — not in original brief
  but required to prevent Node 24 HTTP keep-alive from hanging the
  test runner. This is a known vitest 3.x + Node 24 issue.
- Added `allowJs: true` to tsconfig.tests.json — required for
  TypeScript to accept `.mjs` imports from test files without
  declaration files.
- Moved spawnSync exit test outside the `describe("update_docs")`
  block and changed its URL from `${origin}/failure` to a
  connection-refused address — `spawnSync` blocks the event loop,
  so the test server cannot respond (deadlock).

## Concerns

None blocking. The `pool: "forks"` setting may affect other packages'
test configurations if they also hit the Node 24 keep-alive issue;
this is scoped to Core only.
