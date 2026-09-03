# Core Skill Data Helpers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Core's ten shipped Python requirement/iteration helpers with behavior-compatible dependency-free Node 24 ESM and bring their behavioral tests into the normal Vitest gate.

**Architecture:** Each Python CLI becomes a same-basename `.mjs` entry point with named exports for pure transformations and a direct-entry guard for CLI execution. Vitest drives entry points through `process.execPath`, preserving user-observable output and exit codes while making these tests part of `pnpm check`; the repo-only `packages/core/scripts/validate_skill.py` remains outside this skill-backend migration.

**Tech Stack:** Node 24 ESM, Node standard library, TypeScript test files, Vitest

**Spec:** `docs/moe/specs/2026-09-03-skill-backend-runtime-standard-design.md`

## Global Constraints

- Every migrated helper lives at `packages/core/skills/<skill>/scripts/<name>.mjs` with mode `0644` and no shebang.
- Imports use only relative `.mjs` modules and `node:` built-ins.
- Preserve documented arguments, stdout, stderr, exit codes, deterministic sorting, and generated Markdown/JSON.
- Invoke helpers with `node "${CLAUDE_PLUGIN_ROOT}/skills/<skill>/scripts/<name>.mjs"`.
- Tests belong under `packages/core/test/` and must run in the normal Core Vitest project.
- Do not edit generated `/plugins/`; Plan 5 regenerates them once all migrations are complete.

## Open Decisions

None.

## Not Yet Specified

None.

## Out of Scope

- `packages/core/scripts/validate_skill.py`, which is neither shipped nor invoked by a skill.
- Shell/CommonJS/Core lifecycle helpers, owned by Plan 3.
- Historical documents under `packages/core/docs/history/`.

---

### Task 1: Establish a Vitest CLI harness and port chunking coverage

**Files:**
- Create: `packages/core/test/iterative-development/cli-harness.ts`
- Create: `packages/core/test/iterative-development/chunk-spec.test.ts`
- Create: `packages/core/skills/extracting-requirements/scripts/chunk_spec.mjs`
- Modify: `packages/core/vitest.config.ts`
- Delete: `packages/core/skills/extracting-requirements/scripts/chunk_spec.py`
- Delete: `packages/core/test/iterative-development/test_chunk_spec.py`

**Interfaces:**
- Consumes: existing chunk fixtures and Python CLI behavior.
- Produces: `runHelper(relativePath, args, options): SpawnSyncReturns<string>` test helper; exports `estimateTokens`, `splitByHeading`, `findLineRange`, `chunkFile`, and `chunkPath` from `chunk_spec.mjs`.

- [ ] **Step 1: Record the Python baseline**

Run:

```bash
pnpm --filter @bubstack/moe-core test:python
```

Expected: all existing Python unittest cases pass before conversion.

- [ ] **Step 2: Write the shared runner and failing Vitest cases**

Implement the runner with explicit Node invocation:

```typescript
export function runHelper(relativePath: string, args: readonly string[], cwd?: string) {
  return spawnSync(process.execPath, [join(CORE, relativePath), ...args], {
    cwd,
    encoding: "utf8",
  });
}
```

Port all seven `TestChunkSpec` cases, including a temporary missing path, recursive sorted Markdown discovery, required JSON fields, H2/H3 splitting, and the default `4000` token threshold. Change `vitest.config.ts` so `test/**/*.test.ts` is included.

- [ ] **Step 3: Run the new test to verify it fails**

Run:

```bash
pnpm --filter @bubstack/moe-core exec vitest run test/iterative-development/chunk-spec.test.ts
```

Expected: FAIL because `chunk_spec.mjs` does not exist.

- [ ] **Step 4: Implement `chunk_spec.mjs`**

Preserve `Math.trunc(wordCount * 1.3)`, exact `## `/`### ` heading recognition, optional preambles, 1-based line ranges found from the first 80 characters, H2-then-H3 fallback, sorted recursive `.md` discovery, JSON-array stdout with a final newline, and exit `2` for invalid invocation or missing input. Use:

```javascript
const isDirect = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isDirect) process.exitCode = await main(process.argv.slice(2));
```

- [ ] **Step 5: Run the new suite, remove Python files, and run Core gates**

Run:

```bash
pnpm --filter @bubstack/moe-core exec vitest run test/iterative-development/chunk-spec.test.ts
pnpm --filter @bubstack/moe-core typecheck
pnpm --filter @bubstack/moe-core test
```

Expected: all commands exit 0 after removing the old script/test.

- [ ] **Step 6: Commit**

```bash
git add packages/core/vitest.config.ts packages/core/test/iterative-development packages/core/skills/extracting-requirements/scripts
git commit -m "refactor(core): port spec chunking helper to Node"
```

---

### Task 2: Port story aggregation and extraction-pipeline coverage

**Files:**
- Create: `packages/core/skills/extracting-requirements/scripts/aggregate_stories.mjs`
- Create: `packages/core/test/iterative-development/aggregate-stories.test.ts`
- Create: `packages/core/test/iterative-development/extraction-pipeline.test.ts`
- Delete: `packages/core/skills/extracting-requirements/scripts/aggregate_stories.py`
- Delete: `packages/core/test/iterative-development/test_aggregate_stories.py`
- Delete: `packages/core/test/iterative-development/test_extraction_pipeline.py`

**Interfaces:**
- Consumes: `runHelper` and `chunk_spec.mjs` from Task 1.
- Produces: named story load/dedup/group/ID/format functions and the `aggregate_stories.mjs` CLI.

- [ ] **Step 1: Port the behavioral tests before implementation**

Recreate every `TestAggregateStories` and `TestExtractionPipeline` assertion in Vitest. Include this identity rule explicitly:

```typescript
expect(storiesWithSameTitleDifferentEpic).toHaveLength(2);
expect(storiesWithSameTitleDifferentBody).toHaveLength(2);
expect(blankTitleStories).toHaveLength(2);
```

Assert stale `EPIC-*.md` deletion, insertion-order epic grouping, sequential `EPIC-NNN`/`STORY-NNNN`, sorted sources, exact summary output, no-input exit `2`, and no-stories exit `1`.

- [ ] **Step 2: Run the new tests to verify they fail**

Run:

```bash
pnpm --filter @bubstack/moe-core exec vitest run test/iterative-development/aggregate-stories.test.ts test/iterative-development/extraction-pipeline.test.ts
```

Expected: FAIL because `aggregate_stories.mjs` does not exist.

- [ ] **Step 3: Implement the Node aggregator**

Accept either a JSON array or `{ stories: [...] }`; warn and skip other shapes. Deduplicate only on exact theme/title/body, merge unique sources, never merge blank titles, preserve first-seen grouping order, and render the existing Markdown byte-for-byte for covered fixtures. Parse `-o` and `--output-dir` without a third-party argument parser.

- [ ] **Step 4: Remove replaced Python files and run the focused suites**

Run:

```bash
pnpm --filter @bubstack/moe-core exec vitest run test/iterative-development/chunk-spec.test.ts test/iterative-development/aggregate-stories.test.ts test/iterative-development/extraction-pipeline.test.ts
```

Expected: all tests pass after deleting both Python test modules and `aggregate_stories.py`.

- [ ] **Step 5: Commit**

```bash
git add packages/core/skills/extracting-requirements/scripts packages/core/test/iterative-development
git commit -m "refactor(core): port story aggregation to Node"
```

---

### Task 3: Add missing scenario pipeline coverage and port it

**Files:**
- Create: `packages/core/skills/extracting-requirements/scripts/aggregate_scenarios.mjs`
- Create: `packages/core/skills/extracting-requirements/scripts/backlink_scenarios.mjs`
- Create: `packages/core/test/iterative-development/scenario-pipeline.test.ts`
- Delete: `packages/core/skills/extracting-requirements/scripts/aggregate_scenarios.py`
- Delete: `packages/core/skills/extracting-requirements/scripts/backlink_scenarios.py`

**Interfaces:**
- Consumes: generated `EPIC-*.md` format from Task 2 and `runHelper` from Task 1.
- Produces: scenario aggregation and epic-backlink CLIs with named pure transformation exports.

- [ ] **Step 1: Write characterization tests for the previously uncovered scripts**

Use temporary inputs to assert journeys precede surfaces, separate `JOURNEY-NNN`/`SURFACE-NNN` counters, exact-title first-wins deduplication, unique owner/source merge, `UNRESOLVED(title)` fallback, and the exact empty document:

```markdown
# Behavior Scenarios

No scenarios extracted.
```

For backlinking, assert only `- AC-N:` lines without `scenario:` and without `impact:\`none\`` receive the first matching scenario; unrelated bytes remain unchanged, files are processed in sorted order, and no mapping warns but exits 0.

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm --filter @bubstack/moe-core exec vitest run test/iterative-development/scenario-pipeline.test.ts
```

Expected: FAIL because both `.mjs` entry points are missing.

- [ ] **Step 3: Implement both Node CLIs**

Implement argument parsing for `-o/--output`, `--stories-dir`, and positional JSON files. Missing inputs exit `2`; malformed JSON reports the source path. Use sorted `EPIC-*.md` reads and writes, preserve existing Markdown formatting, and export the load/dedup/resolve/format/backlink functions for focused tests.

- [ ] **Step 4: Remove Python sources and run the scenario suite**

Run:

```bash
pnpm --filter @bubstack/moe-core exec vitest run test/iterative-development/scenario-pipeline.test.ts test/iterative-development/extraction-pipeline.test.ts
```

Expected: both suites pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/skills/extracting-requirements/scripts packages/core/test/iterative-development/scenario-pipeline.test.ts
git commit -m "refactor(core): port scenario pipeline to Node"
```

---

### Task 4: Port requirements and scenario validators

**Files:**
- Create: `packages/core/skills/extracting-requirements/scripts/validate_requirements_index.mjs`
- Create: `packages/core/skills/extracting-requirements/scripts/validate_scenarios.mjs`
- Create: `packages/core/test/iterative-development/artifact-validator.test.ts`
- Delete: `packages/core/skills/extracting-requirements/scripts/validate_requirements_index.py`
- Delete: `packages/core/skills/extracting-requirements/scripts/validate_scenarios.py`

**Interfaces:**
- Consumes: story/scenario Markdown contracts from Tasks 2–3.
- Produces: `validateContent`, `loadStoryIds`, and `validateScenarios` exports plus two CLIs.

- [ ] **Step 1: Port existing validator tests and add missing scenario cases**

Preserve all requirements-index and roadmap/iteration assertions from the old mixed test file in their owning tasks. Here assert requirements files need `## STORY-NNNN` plus Epic, Title, Acceptance criteria, Sources, and Status. Assert scenario IDs are unique, referenced stories exist, `UNRESOLVED(...)` is forbidden, journeys have steps, required owning-story/proof-seam fields exist, and zero scenarios fails.

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm --filter @bubstack/moe-core exec vitest run test/iterative-development/artifact-validator.test.ts
```

Expected: FAIL because the `.mjs` validators are missing.

- [ ] **Step 3: Implement both validators with exact exit streams**

Invocation/missing-path errors exit `2`. Validation failures exit `1`; requirements errors use stderr, while scenario failures emit `ERROR:` lines on stderr and `FAIL: N error(s)` on stdout. Success prints `OK: <path>`. Directory reads include only sorted top-level Markdown/`EPIC-*.md` files as the Python versions do.

- [ ] **Step 4: Delete replaced Python sources and run the focused gate**

Keep `test_artifact_validator.py` temporarily: Task 5 still consumes its
roadmap and iteration-log cases and owns deleting the mixed test only after
those remaining assertions are ported.

Run:

```bash
pnpm --filter @bubstack/moe-core exec vitest run test/iterative-development/artifact-validator.test.ts test/iterative-development/scenario-pipeline.test.ts
```

Expected: all validator and pipeline cases pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/skills/extracting-requirements/scripts packages/core/test/iterative-development
git commit -m "refactor(core): port requirement validators to Node"
```

---

### Task 5: Port iteration citation, roadmap, and log validators

**Files:**
- Create: `packages/core/skills/scoping-the-simplest-core/scripts/check_citations.mjs`
- Create: `packages/core/skills/scoping-the-simplest-core/scripts/validate_roadmap.mjs`
- Create: `packages/core/skills/running-an-iteration/scripts/check_citations.mjs`
- Create: `packages/core/skills/running-an-iteration/scripts/validate_iteration_log.mjs`
- Create: `packages/core/test/iterative-development/check-citations.test.ts`
- Create: `packages/core/test/iterative-development/roadmap-log-validator.test.ts`
- Delete: corresponding four `.py` files
- Delete: `packages/core/test/iterative-development/test_check_citations.py`
- Delete: `packages/core/test/iterative-development/test_artifact_validator.py`

**Interfaces:**
- Consumes: `runHelper` from Task 1 and existing walking-skeleton fixtures.
- Produces: two behavior-identical citation CLIs and named roadmap/log validation functions.

- [ ] **Step 1: Write failing Vitest coverage**

Parameterize every citation assertion over both target entry points:

```typescript
for (const script of [SCOPING_CITATIONS, RUNNING_CITATIONS]) {
  it(`${script} rejects missing story ids in sorted order`, () => {
    const result = runHelper(script, [roadmap, requirements]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("STORY-0002");
  });
}
```

Port the roadmap/log cases from `test_artifact_validator.py`: exact headings, walking-skeleton section isolation, required fields, each `## ITER-N+` section's five required fields, missing path exit `2`, validation exit `1`, and exact success output.

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
pnpm --filter @bubstack/moe-core exec vitest run test/iterative-development/check-citations.test.ts test/iterative-development/roadmap-log-validator.test.ts
```

Expected: FAIL because the four `.mjs` files are missing.

- [ ] **Step 3: Implement the four helpers**

Keep the two citation copies behavior-identical but skill-owned. Definitions come only from story headings; cited IDs come from every `STORY-N+` occurrence. Implement roadmap and log section parsing with the same exact required labels and output as the Python implementations.

- [ ] **Step 4: Remove replaced Python files and finish test migration**

Delete the now-fully-ported mixed `test_artifact_validator.py` and the other
backend-related Python tests. Preserve `test_skill_validator.py` and
`packages/core/scripts/validate_skill.py` because they are out of scope.
Update comments in `vitest.config.ts` and `package.json` so `test:python` is
described as the repo-only validator suite rather than the skill-backend gate.

- [ ] **Step 5: Run all iterative-development and Core gates**

Run:

```bash
pnpm --filter @bubstack/moe-core exec vitest run test/iterative-development
pnpm --filter @bubstack/moe-core test:python
pnpm --filter @bubstack/moe-core typecheck
pnpm --filter @bubstack/moe-core test
```

Expected: migrated Vitest suites pass; the remaining six repo-only Python validator tests pass; typecheck and normal Core tests exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/core/skills packages/core/test/iterative-development packages/core/vitest.config.ts packages/core/package.json
git commit -m "refactor(core): port iteration validators to Node"
```

---

### Task 6: Update active skill references and executable metadata

**Files:**
- Modify: `packages/core/skills/extracting-requirements/SKILL.md`
- Modify: `packages/core/skills/scoping-the-simplest-core/SKILL.md`
- Modify: `packages/core/skills/running-an-iteration/SKILL.md`
- Modify: `packages/core/skills/running-an-iteration/scope-reviewer-prompt.md`
- Modify: `packages/core/test/iterative-development/walking-skeleton/README.md`
- Modify: `packages/core/test/metadata.test.ts`

**Interfaces:**
- Consumes: all ten `.mjs` entry points from Tasks 1–5.
- Produces: active documentation with explicit plugin-rooted Node commands and no executable-bit entries for migrated helpers.

- [ ] **Step 1: Replace every active Python invocation and filename**

Use this command form consistently:

```markdown
node "${CLAUDE_PLUGIN_ROOT}/skills/extracting-requirements/scripts/chunk_spec.mjs" <spec-path>
```

Apply the corresponding skill/name to every command, table row, file list, prompt, and walking-skeleton example. Do not rewrite historical plans or `CODEBASE-REVIEW.md`.

- [ ] **Step 2: Remove Python helpers from executable-bit expectations**

Delete the migrated paths from `X_BIT_ALLOWLIST`. Keep hook entries and other not-yet-migrated skill executables unchanged. Ensure the existing Node parse discovery sees every new `.mjs`.

- [ ] **Step 3: Prove no active `.py` reference remains**

Run:

```bash
rg -n "(python3|scripts/[^ )]+\\.py)" packages/core/skills/extracting-requirements packages/core/skills/scoping-the-simplest-core packages/core/skills/running-an-iteration packages/core/test/iterative-development/walking-skeleton
```

Expected: no matches.

- [ ] **Step 4: Run the plan completion gate**

Run:

```bash
pnpm --filter @bubstack/moe-core typecheck
pnpm --filter @bubstack/moe-core test
pnpm --filter @bubstack/moe-core exec vitest run test/metadata.test.ts
git diff --check
```

Expected: every command exits 0.

- [ ] **Step 5: Commit**

```bash
git add packages/core/skills packages/core/test
git commit -m "docs(core): invoke data helpers through Node"
```
