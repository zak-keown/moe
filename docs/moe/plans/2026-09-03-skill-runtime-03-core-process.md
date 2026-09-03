# Core Process and Lifecycle Helpers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert every remaining in-scope Core skill helper and Crew's skill launcher to dependency-free `.mjs`, preserving their workflows while removing shell, CommonJS, direct-execution, jq, and awk dependencies.

**Architecture:** Small helpers are normalized in place; shell pipelines become Node programs with pure exported transformations and argument-array subprocesses. The brainstorming client/server and lifecycle launchers form a separate high-risk seam with injectable process/platform behavior, while Crew retains its compiled TypeScript backend and replaces only the skill-local shell launcher.

**Tech Stack:** Node 24 ESM and standard library, Vitest, existing compiled Crew CLI, Git/tmux/Chrome as declared external capabilities

**Spec:** `docs/moe/specs/2026-09-03-skill-backend-runtime-standard-design.md`

## Global Constraints

- Skill code lives only under `skills/<skill>/scripts/**/*.mjs`, mode `0644`, without shebangs.
- All active invocations use explicit `node` and a plugin-rooted path.
- Skill-local imports are relative `.mjs` or `node:` built-ins; `exec`/`execSync` and `shell: true` are forbidden.
- Preserve public arguments, output, exit status, generated artifacts, security checks, and declared external-tool requirements.
- Tests live in package test trees and run from the normal package gate; focused Vitest is preferred where no specialized runtime harness is required.
- Generated `/plugins/` remains untouched until Plan 5.

## Open Decisions

None.

## Not Yet Specified

None.

## Out of Scope

- Hooks under `packages/core/hooks/`, including their polyglot dispatch.
- Package-level Crew TypeScript and generated shims; only its skill launcher is in scope.
- Glass, owned by Plan 4.

---

### Task 1: Normalize existing Core Node helpers and tests

**Files:**
- Rename: `packages/core/skills/working-with-claude-code/scripts/update_docs.cjs` → `update_docs.mjs`
- Move: `packages/core/skills/writing-skills/render-graphs.mjs` → `scripts/render-graphs.mjs`
- Create: `packages/core/test/docs-verify-report.test.ts`
- Create: `packages/core/test/update-docs.test.ts`
- Create: `packages/core/test/render-graphs.test.ts`
- Delete: `packages/core/skills/docs-update/scripts/docs-verify-report.test.mjs`
- Delete: `packages/core/test/shell/test-render-graphs.sh`
- Modify: `packages/core/skills/docs-update/scripts/docs-verify-report.mjs`
- Modify: `packages/core/skills/fixing-a-code-review/scripts/{compact-resolved,stamp-disposition}.mjs`
- Modify: `packages/core/skills/reviewing-a-codebase/scripts/{review-check,review-merge,review-report,review-scope,review-verify-record,review-verify-scope}.mjs`
- Modify: `packages/core/test/codebase-review-scripts.test.ts`
- Modify: `packages/core/package.json`
- Modify: `packages/core/skills/docs-update/SKILL.md`
- Modify: `packages/core/skills/fixing-a-code-review/SKILL.md`
- Modify: `packages/core/skills/reviewing-a-codebase/SKILL.md`
- Modify: `packages/core/skills/working-with-claude-code/SKILL.md`
- Modify: `packages/core/skills/writing-skills/SKILL.md`
- Modify: owning `SKILL.md` and support documents

**Interfaces:**
- Consumes: existing Node helper CLI/library behavior and tests.
- Produces: ESM-only Core helpers using `node:` imports, explicit direct-entry guards, mode `0644`, and plugin-rooted Node invocations.

- [ ] **Step 1: Add missing behavior tests for `update_docs`**

Create a package test using a local HTTP server and temporary destination. Assert URL extraction, redirects, UTF-8 split boundaries, rejected unsafe filenames, successful writes, and nonzero top-level failure. Import named exports `getClaudeCodeUrls` and `fetchAndSaveDoc` from the future `.mjs` path. Port every report assertion from the co-located `.test.mjs` file and every render assertion from `test-render-graphs.sh`; use a fake `dot` executable so the Vitest suite remains CI-safe.

- [ ] **Step 2: Run the focused tests to verify the renamed module is missing**

Run:

```bash
pnpm --filter @bubstack/moe-core exec vitest run test/docs-verify-report.test.ts test/update-docs.test.ts test/render-graphs.test.ts
```

Expected: existing report tests pass and the new update-docs suite fails to import `update_docs.mjs`.

- [ ] **Step 3: Normalize all existing Node modules**

Convert `update_docs.cjs` to named ESM exports and a direct-entry guard. For every in-scope `.mjs`, replace builtin specifiers with `node:`, remove shebangs, remove execute bits, and retain relative `.mjs` imports. Move `render-graphs.mjs` beneath its owning `scripts/`, replace the two old test programs with the new Vitest suites, and remove only their entries from `test:shell`; keep unrelated latte coverage there.

- [ ] **Step 4: Update invocations and run focused tests**

Every entry-point example must take this form:

```markdown
node "${CLAUDE_PLUGIN_ROOT}/skills/working-with-claude-code/scripts/update_docs.mjs"
```

Run:

```bash
pnpm --filter @bubstack/moe-core test
pnpm --filter @bubstack/moe-core typecheck
```

Expected: all existing review/docs tests and the new update-docs suite pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/skills packages/core/test packages/core/package.json
git commit -m "refactor(core): normalize Node skill helpers"
```

---

### Task 2: Port the duplicate-analysis pipeline

**Files:**
- Replace: `packages/core/skills/finding-duplicate-functions/scripts/extract-functions.sh` with `extract-functions.mjs`
- Replace: `packages/core/skills/finding-duplicate-functions/scripts/prepare-category-analysis.sh` with `prepare-category-analysis.mjs`
- Replace: `packages/core/skills/finding-duplicate-functions/scripts/generate-report.sh` with `generate-report.mjs`
- Create: `packages/core/test/finding-duplicate-functions.test.ts`
- Modify: `packages/core/skills/finding-duplicate-functions/SKILL.md`
- Modify: `packages/core/skills/finding-duplicate-functions/scripts/categorize-prompt.md`

**Interfaces:**
- Consumes: categorized/duplicate JSON schemas documented by the skill prompts.
- Produces: three Node CLIs preserving `catalog.json`, per-category JSON, and Markdown report contracts without jq or awk.

- [ ] **Step 1: Write black-box characterization tests**

Cover help/missing arguments, custom output paths, ignored test/generated files, extracted name/path/line/language records, the three-item category threshold, filename traversal rejection, confidence totals/sections, timestamp shape, and fatal malformed JSON. Use temporary paths containing spaces and shell metacharacters.

- [ ] **Step 2: Run the suite to verify it fails**

Run:

```bash
pnpm --filter @bubstack/moe-core exec vitest run test/finding-duplicate-functions.test.ts
```

Expected: FAIL because the `.mjs` entry points do not exist.

- [ ] **Step 3: Implement the pipeline in Node**

Walk source files with `node:fs/promises` rather than shell pipelines. Parse/write JSON once per file, sort every discovered path, sanitize category filenames before `join`, and render the report from parsed records. Preserve accepted flags and user-visible output; malformed input is fatal and names its path.

- [ ] **Step 4: Update the skill and run focused tests**

Replace graph labels, table entries, prompt references, and commands with `.mjs` paths and explicit `node`. Run:

```bash
pnpm --filter @bubstack/moe-core exec vitest run test/finding-duplicate-functions.test.ts
```

Expected: all pipeline cases pass without `jq` or `awk` on `PATH`.

- [ ] **Step 5: Commit**

```bash
git add packages/core/skills/finding-duplicate-functions packages/core/test/finding-duplicate-functions.test.ts
git commit -m "refactor(core): port duplicate analysis to Node"
```

---

### Task 3: Port SDD workspace and review-package utilities

**Files:**
- Replace: `packages/core/skills/subagent-driven-development/scripts/sdd-workspace` with `sdd-workspace.mjs`
- Replace: `packages/core/skills/subagent-driven-development/scripts/task-brief` with `task-brief.mjs`
- Replace: `packages/core/skills/subagent-driven-development/scripts/review-package` with `review-package.mjs`
- Create: `packages/core/test/subagent-development-scripts.test.ts`
- Modify: `packages/core/skills/subagent-driven-development/{SKILL.md,task-reviewer-prompt.md,re-review-prompt.md}`

**Interfaces:**
- Consumes: Git CLI and plan Markdown format.
- Produces: shared `resolveSddWorkspace(planPath)` plus three CLIs with the existing positional arguments and artifact locations.

- [ ] **Step 1: Write failing black-box tests**

Create temporary Git repositories and assert usage exit `2`, missing plan, per-plan slug isolation, self-ignoring `.moe/sdd/.gitignore`, fence-aware Task heading extraction, missing task exit `3`, default/explicit output paths, invalid Git refs, and a multi-commit `BASE..HEAD` review package containing commits, stat, and `git diff -U10`.

- [ ] **Step 2: Run the suite to verify it fails**

Run:

```bash
pnpm --filter @bubstack/moe-core exec vitest run test/subagent-development-scripts.test.ts
```

Expected: FAIL because `.mjs` helpers are absent.

- [ ] **Step 3: Implement shared ESM functions and CLIs**

Use `execFileSync("git", args)` only. `task-brief.mjs` imports `resolveSddWorkspace` rather than spawning its sibling and ignores headings inside fenced blocks. `review-package.mjs` validates both revisions before writing a uniquely range-named file.

- [ ] **Step 4: Update all active invocations and run tests**

Use:

```markdown
node "${CLAUDE_PLUGIN_ROOT}/skills/subagent-driven-development/scripts/review-package.mjs" PLAN_FILE BASE HEAD
```

Apply the same pattern to the other helpers in all three owning documents. Run the focused suite and Core typecheck.

- [ ] **Step 5: Commit**

```bash
git add packages/core/skills/subagent-driven-development packages/core/test/subagent-development-scripts.test.ts
git commit -m "refactor(core): port SDD artifact helpers to Node"
```

---

### Task 4: Port Git/tmux utilities and the Crew launcher

**Files:**
- Move/replace: `packages/core/skills/systematic-debugging/find-polluter.sh` → `scripts/find-polluter.mjs`
- Replace: `packages/core/skills/using-tmux-for-interactive-commands/tmux-wrapper.sh` → `scripts/tmux-wrapper.mjs`
- Replace: `packages/crew/skills/driving-claude-code-sessions/scripts/moe-crew` → `moe-crew.mjs`
- Create: `packages/core/test/find-polluter.test.ts`
- Create: `packages/core/test/tmux-wrapper.test.ts`
- Create: `packages/crew/test/skill-launcher.test.ts`
- Modify: owning Core/Crew skill documents and references
- Modify: `packages/crew/examples/recover-workers.sh`

**Interfaces:**
- Consumes: Git, npm test command, tmux, and `packages/crew/dist/moe-crew.cjs`.
- Produces: three `.mjs` entry points that preserve argument/stdin/stdout/stderr/status without shell evaluation.

- [ ] **Step 1: Write failing tests with fake executables**

Port the shell polluter suite to Vitest and add pre-existing pollution plus whitespace/metacharacter paths. Put fake `tmux` and fake Crew `dist/moe-crew.cjs` programs first on `PATH`; assert argv remains element-for-element, default bash selection, send/capture/stop/list behavior, stdin/stdout/stderr propagation, and exit/signal propagation.

- [ ] **Step 2: Run focused tests to verify they fail**

Run:

```bash
pnpm --filter @bubstack/moe-core exec vitest run test/find-polluter.test.ts test/tmux-wrapper.test.ts
pnpm --filter @bubstack/moe-crew exec vitest run test/skill-launcher.test.ts
```

Expected: FAIL because the target `.mjs` files are absent.

- [ ] **Step 3: Implement Node entry points**

Use `spawnSync`/`execFileSync` with arrays. The Crew launcher resolves `${CLAUDE_PLUGIN_ROOT}/dist/moe-crew.cjs`, falling back from `import.meta.url`, then spawns `process.execPath` with inherited stdio. Keep Git/tmux as explicit capability errors; do not claim native Windows support for tmux.

- [ ] **Step 4: Update active docs and run package gates**

Replace actual Crew skill-entry invocations with `node "${CLAUDE_PLUGIN_ROOT}/skills/driving-claude-code-sessions/scripts/moe-crew.mjs"`. Update `examples/recover-workers.sh` to invoke that canonical path when demonstrating the source-tree launcher; examples remain excluded from runtime validation. Do not change generated worker shim semantics. Update systematic-debugging and tmux references to plugin-rooted Node commands. Run both focused suites, Core tests, and Crew tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/skills packages/core/test packages/crew/skills packages/crew/test
git commit -m "refactor(skills): port process launchers to Node"
```

---

### Task 5: Convert the brainstorming server and injected client to ESM

**Files:**
- Replace: `packages/core/skills/brainstorming/scripts/helper.cjs` with `helper.mjs`
- Replace: `packages/core/skills/brainstorming/scripts/server.cjs` with `server.mjs`
- Modify: all tests under `packages/core/test/brainstorm-server/` that import or spawn those files
- Modify: `packages/core/skills/brainstorming/scripts/frame-template.html` only if its script injection marker changes

**Interfaces:**
- Consumes: existing WebSocket/server security and rendering contracts.
- Produces: `helperScript` plus pure reconnect exports; server exports `computeAcceptKey`, `encodeFrame`, `decodeFrame`, `browserLauncherForPlatform`, `OPCODES`, `MAX_FRAME_PAYLOAD_BYTES`, and `writeSecretFile`.

- [ ] **Step 1: Point tests at future ESM paths and retain all assertions**

Convert tests to dynamic ESM imports where cache isolation is needed. `helper.test` must import pure exports and evaluate `helperScript` inside the existing mocked browser environment. Preserve the named tests for telemetry absence, WebSocket framing, authentication, browser launch, branding, lifecycle, and session security.

- [ ] **Step 2: Run the brainstorm suite to verify it fails**

Run:

```bash
pnpm --filter @bubstack/moe-core test:brainstorm
```

Expected: FAIL because `helper.mjs` and `server.mjs` do not exist.

- [ ] **Step 3: Implement the ESM modules**

Represent browser code as an exported IIFE string so `export` syntax is never injected into a classic `<script>`. Replace `require`/`__dirname` with ESM imports and `import.meta.url`; gate startup with an explicit direct-entry comparison. Preserve size limits, origin/token checks, owner-only secret writes, no telemetry, and all existing exports.

- [ ] **Step 4: Run the module-level brainstorm tests**

Run the Node test files named by `test:brainstorm` before the shell lifecycle wrappers. Expected: every server/helper/security test passes against `.mjs`.

- [ ] **Step 5: Commit**

```bash
git add packages/core/skills/brainstorming/scripts packages/core/test/brainstorm-server
git commit -m "refactor(core): convert brainstorm server to ESM"
```

---

### Task 6: Port brainstorming lifecycle entry points

**Files:**
- Replace: `packages/core/skills/brainstorming/scripts/start-server.sh` with `start-server.mjs`
- Replace: `packages/core/skills/brainstorming/scripts/stop-server.sh` with `stop-server.mjs`
- Create: `packages/core/test/brainstorm-server/start-server.test.ts`
- Create: `packages/core/test/brainstorm-server/stop-server.test.ts`
- Create: `packages/core/test/brainstorm-server/windows-lifecycle.test.ts`
- Delete: corresponding `.sh` test files
- Modify: `packages/core/skills/brainstorming/visual-companion.md`
- Modify: `packages/core/skills/_shared/native-rendering.md`
- Modify: `packages/core/mint/moe-vocab.yaml`
- Modify: `packages/core/package.json`

**Interfaces:**
- Consumes: `server.mjs` from Task 5.
- Produces: start/stop CLIs preserving the JSON lifecycle protocol on all supported host modes.

- [ ] **Step 1: Port wrapper tests into normal Vitest coverage**

Assert temp versus project session roots, mode `0700`/`0600`, exclusive directory creation, persisted port/token, 32–64 character instance IDs, foreground/background aliases, Codex and Windows foreground selection, host/url-host including IPv6, positive idle-timeout validation, PID+instance fail-closed stop, graceful termination then kill, stopped marker persistence, and deletion only of verified ephemeral temp sessions.

- [ ] **Step 2: Run lifecycle tests to verify they fail**

Run:

```bash
pnpm --filter @bubstack/moe-core exec vitest run test/brainstorm-server/start-server.test.ts test/brainstorm-server/stop-server.test.ts test/brainstorm-server/windows-lifecycle.test.ts
```

Expected: FAIL because lifecycle `.mjs` entry points do not exist.

- [ ] **Step 3: Implement `start-server.mjs` and `stop-server.mjs`**

Use `mkdtemp` or exclusive `mkdir`, `chmod`, cryptographic IDs, `spawn`, and platform-aware browser commands with argument arrays. Preserve aliases and JSON fields. Use `process.ppid` for owner watching and verify both PID and server instance ID before signaling or deleting anything.

- [ ] **Step 4: Update every lifecycle command and package gate**

Replace every start/stop path with explicit Node invocation, including `render-ladder` content in `packages/core/mint/moe-vocab.yaml`. Update `test:brainstorm` for all renamed module/lifecycle tests, then make Core's normal `test` script invoke both `vitest run` and `test:brainstorm`; remove only obsolete shell wrapper invocations. This makes helper/server behavior part of `pnpm check` rather than a final opt-in.

- [ ] **Step 5: Run the complete brainstorm gate and commit**

Run:

```bash
pnpm --filter @bubstack/moe-core test
pnpm --filter @bubstack/moe-core typecheck
```

Expected: all brainstorm module/lifecycle tests and normal Core tests pass.

```bash
git add packages/core/skills/brainstorming packages/core/skills/_shared/native-rendering.md packages/core/mint/moe-vocab.yaml packages/core/test/brainstorm-server packages/core/package.json
git commit -m "refactor(core): port brainstorm lifecycle to Node"
```

---

### Task 7: Reconcile Core metadata and prove the remaining skill tree

**Files:**
- Modify: `packages/core/test/metadata.test.ts`
- Modify: `packages/core/mint/moe.yaml`
- Modify: `packages/core/package.json`
- Modify: `packages/core/vitest.config.ts`
- Move: `packages/core/skills/systematic-debugging/condition-based-waiting-example.ts` → `examples/condition-based-waiting-example.ts`

**Interfaces:**
- Consumes: every migrated Core/Crew path from Tasks 1–6 and Plan 2.
- Produces: Core source metadata with no production executable-bit assumptions or out-of-layout illustrative code.

- [ ] **Step 1: Update guarded metadata by symbol and test name**

In `X_BIT_ALLOWLIST`, remove every migrated skill helper while retaining hook executables. Update the tests named `keeps the execute bit on every shipped executable`, `has no executable outside the allowlist`, and `every shell script and node script parses` so they govern remaining hooks and defer skill runtime shape to Mint's validator in Plan 5.

- [ ] **Step 2: Move the TypeScript illustration structurally**

Move `condition-based-waiting-example.ts` under the skill's `examples/` directory, update Markdown and `packages/core/mint/moe.yaml` imported-work roots, and preserve its illustrative contents unchanged.

- [ ] **Step 3: Update imported-work paths and active test scripts**

Change individual imported roots for `find-polluter.sh` and `render-graphs.mjs` to their final `.mjs` paths. Remove obsolete shell/Python backend test fragments only where equivalent Vitest coverage now exists; retain out-of-scope hook/latte and repo-only validator checks.

- [ ] **Step 4: Run package completion gates**

Run:

```bash
pnpm --filter @bubstack/moe-core test
pnpm --filter @bubstack/moe-core typecheck
pnpm --filter @bubstack/moe-crew test
pnpm --filter @bubstack/moe-crew typecheck
git diff --check
```

Expected: every command exits 0 and no in-scope Core/Crew helper requires Python, Bash, CommonJS, a shebang, or an execute bit.

- [ ] **Step 5: Commit**

```bash
git add packages/core packages/crew
git commit -m "test(skills): reconcile portable runtime metadata"
```
