# Skill Runtime Enforcement Activation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activate the zero-exception skill-runtime contract in Mint and `pnpm check`, update repository guidance, regenerate plugins, and qualify the complete atomic migration.

**Architecture:** Mint collects declared component candidates once, validates the complete skill-source subset before developer-harness filtering, and stages only the existing classified subset after validation. A repository-level Mint test resolves the live platform and exercises that same inspection path, giving both fast source feedback and an unbypassable packaging gate without duplicating logic in Jig.

**Tech Stack:** TypeScript 5.9, Mint artifact assembly, Vitest, pnpm/Turborepo, generated plugin compositor and provenance checker

**Spec:** `docs/moe/specs/2026-09-03-skill-backend-runtime-standard-design.md`

## Global Constraints

- The contract activates only after Plans 2–4 leave every shipped skill conforming.
- Validation operates on every declared skill source candidate before developer-harness filtering and before the first artifact write; test-like filenames cannot hide code from the gate.
- The live repository test and assembly call the same validator implementation.
- No legacy allowlist, configuration escape hatch, compatibility wrapper, or duplicate Jig checker is permitted.
- `/plugins/` changes come only from `pnpm mint`.
- Final evidence includes `pnpm check`, `pnpm mint:check`, `pnpm artifact:check`, and `pnpm provenance`.

## Open Decisions

None.

## Not Yet Specified

None.

## Out of Scope

- Adding broader repository-language policy outside shipped skill backends.
- Changing hook portability or package-level TypeScript compilation.
- Publishing or opening an MR.

---

### Task 1: Integrate validation before Mint stages components

**Files:**
- Modify: `packages/mint/src/artifact/assemble.ts`
- Modify: `packages/mint/src/skill-runtime.ts`
- Modify: `packages/mint/test/skill-runtime.test.ts`
- Modify: `packages/mint/test/assemble-artifact.test.ts`
- Modify: `packages/mint/test/fixtures/composed-plugin/skills/demo/SKILL.md`
- Move/replace: `packages/mint/test/fixtures/composed-plugin/skills/demo/test-runtime.js` → `scripts/test-runtime.mjs`
- Move/replace: `packages/mint/test/fixtures/composed-plugin/skills/demo/test-unlinked.js` → `test-unlinked.md`
- Modify: linked/unlinked developer-harness fixtures beneath `packages/mint/test/fixtures/composed-plugin/skills/demo/`

**Interfaces:**
- Consumes: `assertValidSkillRuntime(input)` and `SkillRuntimeReport` from Plan 1; private `ComponentFile[]` from `collectComponentFiles`.
- Produces: a collection result containing complete candidates plus staged files, exported `inspectSkillRuntime(plugin): Promise<SkillRuntimeReport>`, and a pre-filter/pre-write validation call in `stageComponents`.

- [ ] **Step 1: Close the two carried validator bypasses**

Add failing adversarial cases to `skill-runtime.test.ts` for dynamic
`import("node:module")` followed by `createRequire`, direct re-exports of
shell-capable `node:child_process` APIs, and a downstream relative import that
invokes a re-exported `spawn`/`spawnSync`/`execFile`/`execFileSync` with shell
enabled. Preserve complete diagnostic reporting and fix the validator before
adding either activation call below. Plan 1's final scoped re-review identified
these as load-bearing carryovers; neither gate may activate while either case
passes without a diagnostic.

- [ ] **Step 2: Make the composed fixture conform**

Move the runtime fixture to `skills/demo/scripts/test-runtime.mjs`, remove its shebang/execute bit, and update `SKILL.md` to invoke it through explicit `node`. Preserve developer-harness classification with a linked non-code fixture such as `__tests__/transitive-fixture.json`; replace unlinked code with `test-unlinked.md` so the fixture still proves staging exclusion without creating forbidden hidden code.

- [ ] **Step 3: Add failing assembly-boundary tests**

Add a test named `rejects a nonconforming skill backend before staging any component`. Inject `skills/demo/scripts/task.py`, call `assembleArtifact`, and assert:

```typescript
await expect(assembleArtifact(input)).rejects.toMatchObject({
  diagnostic: { code: "SKILL_RUNTIME_INVALID" },
});
await expect(readFile(join(destinationRoot, plugin.id, ".moe-mint/manifest.json")))
  .rejects.toMatchObject({ code: "ENOENT" });
```

Also inspect the thrown `diagnostics` list for `SKILL_RUNTIME_LANGUAGE` and assert no component was staged.

- [ ] **Step 4: Run the validator and assembly tests to verify they fail**

Run:

```bash
pnpm --filter @bubstack/moe-mint exec vitest run test/skill-runtime.test.ts test/assemble-artifact.test.ts
```

Expected: the carryover validator cases fail because both bypasses are still
accepted, and the new assembly case succeeds because validation is not wired
yet.

- [ ] **Step 5: Wire complete candidates before classification**

Refactor collection to return both the complete, sorted candidate list and the current Markdown-link-classified staging list without rereading disk. Immediately after collection and before applying the developer-harness staging filter or any `mkdir`/`writeNewFile`, call:

```typescript
assertValidSkillRuntime({
  plugin: plugin.id,
  source: plugin.config.source,
  skillsRoot: plugin.config.components.skills,
  files: candidates.map((file) => ({
    path: file.destination,
    content: file.bytes,
    executable: file.executable,
  })),
});
```

The validator recognizes only files beneath the configured skills component, so commands/agents/hooks in the candidate list remain out of scope. Factor the same candidate mapping into `inspectSkillRuntime(plugin)` so tests do not duplicate collection or tree walking. Apply the existing developer-harness filter only after the assertion succeeds; do not reread source files.

- [ ] **Step 6: Run Mint validator/assembly tests and typecheck**

Run:

```bash
pnpm --filter @bubstack/moe-mint exec vitest run test/skill-runtime.test.ts test/assemble-artifact.test.ts
pnpm --filter @bubstack/moe-mint typecheck
```

Expected: all tests pass; invalid assembly fails before writes.

- [ ] **Step 7: Commit**

```bash
git add packages/mint/src packages/mint/test
git commit -m "feat(mint): gate skill runtime before staging"
```

---

### Task 2: Add the live repository contract gate

**Files:**
- Create: `packages/mint/test/repository-skill-runtime.test.ts`
- Modify: `packages/mint/test/test-command.test.ts`
- Modify: `packages/mint/fixtures/kitchen-sink/skills/greeting/scripts/hello.sh`

**Interfaces:**
- Consumes: `resolvePlatform(repoRoot)` and `inspectSkillRuntime(plugin)` from Task 1.
- Produces: repository-wide conformance coverage automatically included in Mint's existing `vitest run`, and therefore root `pnpm check`.

- [ ] **Step 1: Write the live repository test**

Resolve the platform registry, inspect every registered plugin, assert at least one recognized skill and module overall, and aggregate all diagnostics before failing:

```typescript
const reports = await Promise.all(platform.plugins.map(inspectSkillRuntime));
expect(reports.reduce((sum, report) => sum + report.skills, 0)).toBeGreaterThan(0);
expect(reports.reduce((sum, report) => sum + report.modules, 0)).toBeGreaterThan(0);
expect(reports.flatMap((report) => report.diagnostics)).toEqual([]);
```

- [ ] **Step 2: Run the live contract to expose remaining violations**

Run:

```bash
pnpm --filter @bubstack/moe-mint exec vitest run test/repository-skill-runtime.test.ts
```

Expected: PASS only if Plans 2–4 migrated every in-scope source/reference; otherwise fix the owning plan's missed path without adding an exception.

- [ ] **Step 3: Replace Mint's executable skill fixture**

Convert or remove kitchen-sink `hello.sh`. Rewrite `test-command.test.ts` cases that currently treat executable skill scripts as a positive contract: shipped skill code must now be mode `0644`. Retain generic executable-mode artifact coverage through `dist/cli.js`, which is outside skill trees.

- [ ] **Step 4: Run the complete Mint package gate**

Run:

```bash
pnpm --filter @bubstack/moe-mint test
pnpm --filter @bubstack/moe-mint typecheck
pnpm --filter @bubstack/moe-mint lint
```

Expected: all Mint tests pass, including the live repository contract.

- [ ] **Step 5: Commit**

```bash
git add packages/mint/test packages/mint/fixtures
git commit -m "test(mint): enforce live skill runtime contract"
```

---

### Task 3: Update canonical architecture and contributor guidance

**Files:**
- Modify: `ARCHITECTURE.md`
- Modify: `AGENTS.md`
- Modify: `CONTRIBUTING.md`
- Modify: `packages/core/README.md`
- Modify: `docs/moe/specs/2026-09-03-skill-backend-runtime-standard-design.md`

**Interfaces:**
- Consumes: enforced source/runtime contract from Tasks 1–2.
- Produces: one canonical written rule matching the tree and current verification commands.

- [ ] **Step 1: Add the runtime boundary to architecture**

Document the exact split: dependency-free Node 24 ESM `.mjs` beneath skill `scripts/`, compiled TypeScript beneath package `src/`/`dist`, explicit Node invocation, and Mint as the artifact gate. State that runtime portability does not erase Git/tmux/Chrome prerequisites.

- [ ] **Step 2: Add concise contributor and agent rules**

Add an enforceable checklist entry to `AGENTS.md` and contributor prose to `CONTRIBUTING.md`/Core README. Cite validator/test names or quoted contracts, never line numbers. Do not claim Python disappeared from the repository; `py/proof` and the repo-only Core validator remain out of scope.

- [ ] **Step 3: Mark the spec implemented**

Change the spec status to `Implemented` only after the live repository test passes. Add the implementing plan manifest path and validator symbol without turning the spec into a changelog.

- [ ] **Step 4: Check prose and active references**

Run:

```bash
rg -n "(python3|bash|scripts/[^ )]+\\.(py|sh|cjs)|skills/browsing/(chrome-ws-lib|host-override|lib/.+)\\.js|skills/.+/chrome-ws($|[[:space:]`])|start-server\\.sh|stop-server\\.sh|skills/writing-skills/render-graphs\\.mjs)" packages ARCHITECTURE.md AGENTS.md CONTRIBUTING.md --glob '!**/docs/history/**'
git diff --check
```

Expected: any matches are documented examples, hooks, or declared external capabilities—not in-scope helper invocations. The diff check exits 0.

- [ ] **Step 5: Commit**

```bash
git add ARCHITECTURE.md AGENTS.md CONTRIBUTING.md packages/core/README.md docs/moe/specs/2026-09-03-skill-backend-runtime-standard-design.md
git commit -m "docs: codify portable skill backends"
```

---

### Task 4: Regenerate plugin artifacts and run complete qualification

**Files:**
- Modify (generated): `plugins/**`
- Modify (generated if changed): `.claude-plugin/marketplace.json`
- Modify (generated if changed): `docs/moe/generated/plugin-catalog.md`

**Interfaces:**
- Consumes: all migrated source, Mint validator, and updated mint metadata from Plans 1–4 and Tasks 1–3.
- Produces: reproducible generated plugins containing only conforming skill backends and complete qualification evidence.

- [ ] **Step 1: Run the full source gate before generation**

Run:

```bash
pnpm check
```

Expected: lint, every package typecheck/test, hook tests, and the live repository skill-runtime contract pass.

- [ ] **Step 2: Generate plugins from source**

Run:

```bash
pnpm mint
```

Expected: Mint validates every skill backend before staging and regenerates the canonical plugin projections without `SKILL_RUNTIME_*` diagnostics.

- [ ] **Step 3: Prove generation and artifact integrity**

Run:

```bash
pnpm mint:check
pnpm artifact:check
pnpm provenance
```

Expected: all three commands exit 0; generated output is byte-reproducible, artifact manifests are valid, and renamed imported paths remain attributed.

- [ ] **Step 4: Run capability-scoped suites and record environment evidence**

Run where capabilities exist:

```bash
pnpm --filter @bubstack/moe-glass test:chrome
pnpm --filter @bubstack/moe-crew test
pnpm --filter @bubstack/moe-core test
pnpm --filter @bubstack/moe-core test:brainstorm
```

Expected: Chrome tests pass on a Chrome host; Crew's real tmux suites pass on a tmux host or report their existing explicit skip; both Core's normal gate and the explicit brainstorm regression suite pass.

- [ ] **Step 5: Inspect the final source/artifact language inventory**

Run:

```bash
find packages -path '*/skills/*' -type f \( -name '*.py' -o -name '*.sh' -o -name '*.bash' -o -name '*.cjs' -o -name '*.js' -o -name '*.ts' \) -print
find plugins -path '*/skills/*' -type f \( -name '*.py' -o -name '*.sh' -o -name '*.bash' -o -name '*.cjs' -o -name '*.js' -o -name '*.ts' \) -print
```

Expected: matches are confined to structural `examples/` or explicitly out-of-scope test/documentation assets; no production skill backend appears. Confirm all production modules are `.mjs` beneath `scripts/` through the passing repository validator.

- [ ] **Step 6: Commit generated artifacts**

```bash
git add plugins .claude-plugin/marketplace.json docs/moe/generated/plugin-catalog.md
git commit -m "chore: regenerate portable skill plugins"
```

- [ ] **Step 7: Re-run final gates from the committed tree**

Run:

```bash
pnpm check
pnpm mint:check
pnpm artifact:check
pnpm provenance
git status --short
```

Expected: all gates exit 0. `git status --short` shows no changes attributable to this plan set; unrelated pre-existing user changes may remain and must be named in the handoff.
