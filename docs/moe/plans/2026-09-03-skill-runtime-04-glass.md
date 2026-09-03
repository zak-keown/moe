# Glass Skill Backend ESM Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Glass's 35-file CommonJS skill backend under `skills/browsing/scripts/`, convert it to dependency-free Node 24 ESM, and preserve both CLI and compiled MCP consumers.

**Architecture:** Convert the module graph from leaves toward the `createSession` facade, replacing CommonJS cache monkeypatches with explicit dependency injection. The CLI and TypeScript MCP server then consume the same ESM facade; co-located legacy test programs move into the package test tree before the final repository contract is enabled.

**Tech Stack:** Node 24 ESM and standard library, TypeScript 5.9 package backend, esbuild, Vitest, Chrome DevTools Protocol

**Spec:** `docs/moe/specs/2026-09-03-skill-backend-runtime-standard-design.md`

## Global Constraints

- All 35 production files end beneath `packages/glass/skills/browsing/scripts/` with `.mjs`, mode `0644`, and no shebang.
- Every internal relative import includes `.mjs`; built-ins use `node:`.
- No `require`, `module.exports`, `require.cache`, `exec`, `execSync`, or shell evaluation remains in the skill backend.
- Preserve `createSession` isolation, public session methods, CLI arguments/output, MCP behavior, security guards, and Chrome lifecycle behavior.
- Tests use ESM imports and explicit injectable dependencies rather than CommonJS cache mutation.
- `/plugins/` is regenerated only in Plan 5.

## Open Decisions

None.

## Not Yet Specified

None.

## Out of Scope

- Redesigning the browser API or MCP schema.
- Replacing the package-level TypeScript MCP server with skill-local JavaScript.
- Requiring Chrome-backed tests in the base CI container; existing opt-in separation remains.

---

### Task 1: Convert dependency leaves and browser-source modules

**Files:**
- Move/convert to `packages/glass/skills/browsing/scripts/lib/*.mjs`: `cdp-utils`, `element-selector`, `html-diff`, `key-definitions`, `websocket-client`, `dialogs-render`, `file-upload`, `console-logging`, `cookies`, `viewport`, and `evaluation`
- Move/convert to `packages/glass/skills/browsing/scripts/lib/page-scripts/*.mjs`: `dom-summary`, `markdown`, and `permission-shim`
- Modify: corresponding tests under `packages/glass/test/lib/`
- Modify: `packages/glass/test/evaluate-await-promise.test.mjs`

**Interfaces:**
- Consumes: existing CommonJS exports and their focused unit tests.
- Produces: named ESM exports for utility modules; default string exports for `dom-summary.mjs` and `markdown.mjs`; named `buildShimSource` from `permission-shim.mjs`.

- [ ] **Step 1: Change leaf tests to future ESM imports**

Update each matching `packages/glass/test/lib/*.test.mjs` file and `evaluate-await-promise.test.mjs` to import/read its target from `skills/browsing/scripts/lib/`. Preserve every assertion and replace `require` with static imports where isolation is unnecessary.

- [ ] **Step 2: Run leaf tests to verify they fail**

Run:

```bash
pnpm --filter @bubstack/moe-glass exec vitest run test/element-selector.test.mjs test/evaluate-await-promise.test.mjs test/lib/html-diff.test.mjs test/lib/key-definitions.test.mjs test/lib/websocket-client-handshake.test.mjs test/lib/websocket-client-no-compression.test.mjs test/lib/dialogs-render.test.mjs test/lib/file-upload.test.mjs test/lib/console-logging.test.mjs test/lib/cookies.test.mjs test/lib/viewport.test.mjs test/lib/evaluation.test.mjs test/lib/page-scripts
```

Expected: import failures for the new `.mjs` paths.

- [ ] **Step 3: Convert leaf modules**

Replace `module.exports`/`exports` with explicit ESM exports and `require("node-module")` with `node:` imports. For browser-source files, export strings rather than making injected code itself an ESM module. Keep function names and argument/return behavior unchanged.

- [ ] **Step 4: Run the focused leaf suite**

Run the command from Step 2. Expected: all selected tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/glass/skills/browsing/scripts/lib packages/glass/test/lib
git commit -m "refactor(glass): convert browser leaves to ESM"
```

---

### Task 2: Introduce ESM-safe dependency seams for process modules

**Files:**
- Move/convert: `packages/glass/skills/browsing/{host-override.js,lib/chrome-launcher-helpers.js,lib/chrome-process.js,lib/profile-lock.js,lib/screenshot.js}` into corresponding `scripts/**/*.mjs` paths
- Modify: `packages/glass/test/lib/{chrome-launcher-helpers,chrome-process,profile-lock,screenshot,screenshot-exec-safety}.test.mjs`
- Modify: `packages/glass/test/lib/find-pid-on-port-guard.test.mjs`
- Modify: `packages/glass/test/schema-collapse.test.mjs`

**Interfaces:**
- Consumes: leaf modules from Task 1 and existing process/security behavior.
- Produces: ESM process modules with optional injected command runners/factories while retaining current public call signatures.

- [ ] **Step 1: Replace cache mutation with dependency-injection tests**

Update tests to construct modules/functions with fake `execFileSync`, spawn, process listing, filesystem, and clock seams. Keep one-argument production APIs valid via default dependencies. Preserve named regression tests for port command injection and screenshot execution safety.

- [ ] **Step 2: Run process tests to verify they fail**

Run:

```bash
pnpm --filter @bubstack/moe-glass exec vitest run test/lib/chrome-launcher-helpers.test.mjs test/lib/chrome-process.test.mjs test/lib/find-pid-on-port-guard.test.mjs test/lib/profile-lock.test.mjs test/lib/screenshot.test.mjs test/lib/screenshot-exec-safety.test.mjs test/schema-collapse.test.mjs
```

Expected: failures until the ESM modules and seams exist.

- [ ] **Step 3: Convert modules and remove shell strings**

Use `execFileSync(command, argv)` for `ps`, `wmic`, and platform tools; never concatenate user-controlled ports, profiles, or paths. Expose dependency factories used by tests, defaulting to real Node functions in production. Preserve lock ownership, orphan discovery, port guards, and screenshot path safety.

- [ ] **Step 4: Run process/security tests**

Run the command from Step 2. Expected: all cases pass without `require.cache` mutation or command strings.

- [ ] **Step 5: Commit**

```bash
git add packages/glass/skills/browsing/scripts packages/glass/test
git commit -m "refactor(glass): make process modules ESM-safe"
```

---

### Task 3: Convert the composed CDP module graph

**Files:**
- Move/convert to `packages/glass/skills/browsing/scripts/lib/*.mjs`: `session-state`, `select-option`, `mouse`, `extraction`, `navigation`, `keyboard-input`, `browser-session`, `cdp-router`, `page-session`, `browser-bridge`, `tabs`, `capture`, `dialogs`, and `dialogs-router`
- Modify: corresponding `packages/glass/test/lib/*.test.mjs`
- Modify: `packages/glass/test/{array-guards,dialogs-wiring,element-selector,session-isolation}.test.mjs`

**Interfaces:**
- Consumes: leaf/process exports from Tasks 1–2.
- Produces: the complete ESM CDP graph consumed by `chrome-ws-lib.mjs`.

- [ ] **Step 1: Update composed-module tests to exact `.mjs` imports**

Change all source paths to `skills/browsing/scripts/lib/...mjs`. Replace any cache mutation with the dependency seams from Task 2; preserve tests for concurrent connection, retry, event fan-out, dialog routing, keyboard/mouse behavior, capture, and schema guards.

- [ ] **Step 2: Run the Glass unit project to establish failing imports**

Run:

```bash
pnpm --filter @bubstack/moe-glass test
```

Expected: FAIL on composed modules that have not yet moved.

- [ ] **Step 3: Convert modules in dependency order**

Convert `session-state` first; then selector/action modules; then browser/CDP session modules; then `capture`, `dialogs`, and `dialogs-router`. Every relative import includes `.mjs`, every export is named, and no module-global state is introduced.

- [ ] **Step 4: Run the complete unit project**

Run:

```bash
pnpm --filter @bubstack/moe-glass test
pnpm --filter @bubstack/moe-glass typecheck
```

Expected: unit tests and typecheck pass after test imports are updated.

- [ ] **Step 5: Commit**

```bash
git add packages/glass/skills/browsing/scripts/lib packages/glass/test
git commit -m "refactor(glass): convert CDP graph to ESM"
```

---

### Task 4: Convert the session facade and preserve MCP consumption

**Files:**
- Move/convert: `packages/glass/skills/browsing/chrome-ws-lib.js` → `scripts/chrome-ws-lib.mjs`
- Modify: `packages/glass/src/index.ts`
- Modify: `packages/glass/tsconfig.json`
- Modify: `packages/glass/test/{bundle-drift,dialogs-wiring,session-isolation,popup-dialog-integration,dialogs.smoke,smoke}.test.mjs`
- Modify: `packages/glass/test/lib/chrome-ws-lib-bridge.test.mjs`
- Modify: `packages/glass/test/bundle-loads.test.mjs`
- Modify: `packages/glass/test/mcp-postel-fixes.test.mjs`

**Interfaces:**
- Consumes: complete module graph from Task 3.
- Produces: named `createSession`, `PAGE_TARGET_SESSION_METHODS`, and `DialogRefusedError` exports shared by skill CLI and compiled MCP server.

- [ ] **Step 1: Update facade tests and the bundle-drift contract**

Import the future `.mjs` facade. Keep assertions that sessions are isolated, all MCP `chromeLib.X` calls exist on the session, dialogs are wired, and bridge state resets on restart. Add a built-artifact assertion that `dist/index.js` retains the runtime path `skills/browsing/scripts/chrome-ws-lib.mjs` and does not embed a second copy of a distinctive facade implementation marker.

- [ ] **Step 2: Run facade tests to verify they fail**

Run:

```bash
pnpm --filter @bubstack/moe-glass exec vitest run test/lib/chrome-ws-lib-bridge.test.mjs test/session-isolation.test.mjs test/dialogs-wiring.test.mjs test/bundle-drift.test.mjs test/bundle-loads.test.mjs test/mcp-postel-fixes.test.mjs
```

Expected: FAIL because `chrome-ws-lib.mjs` is missing.

- [ ] **Step 3: Convert the facade and TypeScript consumer**

Build the facade entirely from static `.mjs` imports, use no top-level await, and preserve its named exports. In package-level `src/index.ts`, keep the existing `createRequire` path bridge but point it at `../skills/browsing/scripts/chrome-ws-lib.mjs`; Node 24 can synchronously load that ESM without pulling the skill tree into TypeScript's `rootDir`. Describe the expected facade with a local TypeScript interface, validate the returned shape through the existing bundle-drift test, and update the tsconfig comment/path contract. The skill backend itself contains no `require`.

- [ ] **Step 4: Run facade, build, and bundle-drift gates**

Run:

```bash
pnpm --filter @bubstack/moe-glass exec vitest run test/lib/chrome-ws-lib-bridge.test.mjs test/session-isolation.test.mjs test/dialogs-wiring.test.mjs test/bundle-drift.test.mjs
pnpm --filter @bubstack/moe-glass build
pnpm --filter @bubstack/moe-glass typecheck
```

Expected: all commands exit 0 and the built MCP server exposes every facade method it calls.

- [ ] **Step 5: Commit**

```bash
git add packages/glass/skills/browsing/scripts/chrome-ws-lib.mjs packages/glass/src packages/glass/tsconfig.json packages/glass/test
git commit -m "refactor(glass): share ESM browser facade"
```

---

### Task 5: Convert the CLI, relocate test utilities, and update docs

**Files:**
- Move/convert: `packages/glass/skills/browsing/chrome-ws` → `scripts/chrome-ws.mjs`
- Move: `packages/glass/skills/browsing/test-*.sh` and `test-*.js` → `packages/glass/test/manual/legacy-cli/` or delete when equivalent Vitest coverage exists
- Modify: `packages/glass/skills/browsing/{SKILL.md,README.md,COMMANDLINE-USAGE.md,EXAMPLES.md,package.json}`
- Modify: `packages/glass/README.md`
- Modify: `packages/glass/docs/cdp/{INDEX,autoattach-popup-timing,navigation-listener-race,per-session-id-counters}.md`
- Modify: `packages/glass/test/manual/test-harness.js`
- Modify: `packages/glass/test/manual/{test-headless-toggle,test-issue-18-pid,test-issue-19-fullpage,test-issue-20-hidpi,test-profiles,test-xdg-cache}.cjs`
- Modify: `packages/glass/test/scenarios/07-cli-smoke.md`
- Modify: `packages/glass/test/{cli-dispatch,bundle-loads}.test.mjs`
- Modify: `packages/glass/test/lib/cli-close-numeric.test.mjs`

**Interfaces:**
- Consumes: ESM facade from Task 4.
- Produces: `scripts/chrome-ws.mjs` CLI and explicit plugin-rooted Node usage throughout active Glass documentation.

- [ ] **Step 1: Point CLI tests at the future path**

Preserve the `chrome-ws CLI dispatch` cases for help, unknown/raw commands, safe stop, extra Chrome args, immediate exit, unresponsive port, spawn failure, and headed default; preserve numeric close and bundle-load assertions.

- [ ] **Step 2: Run CLI tests to verify they fail**

Run:

```bash
pnpm --filter @bubstack/moe-glass exec vitest run test/cli-dispatch.test.mjs test/lib/cli-close-numeric.test.mjs test/bundle-loads.test.mjs
```

Expected: FAIL because `scripts/chrome-ws.mjs` is missing.

- [ ] **Step 3: Convert the CLI and local package descriptor**

Use ESM imports for the facade, host override, Chrome helpers, and `node:` built-ins. Read version metadata without CommonJS. Change the skill-local bin to `./scripts/chrome-ws.mjs`, require Node `>=24`, remove its shebang/execute bit, and preserve CLI text and exit behavior.

- [ ] **Step 4: Relocate test-only programs and update documentation**

Move the ten `test-*` utilities out of the skill tree or delete only those whose behavior is already asserted in Vitest. Update active CDP notes, manual programs, and the CLI smoke scenario to the new source/CLI paths; leave `packages/glass/docs/history/**` unchanged. In command examples use:

```markdown
node "${CLAUDE_PLUGIN_ROOT}/skills/browsing/scripts/chrome-ws.mjs" navigate 0 "https://app.com/form"
```

Keep prose names and output banners that intentionally say `chrome-ws`; change only executable paths/invocations and source-layout descriptions.

- [ ] **Step 5: Run the complete Glass gate**

Run:

```bash
pnpm --filter @bubstack/moe-glass test
pnpm --filter @bubstack/moe-glass typecheck
pnpm --filter @bubstack/moe-glass build
```

Expected: all commands exit 0 and no production `.js`, `.cjs`, shell, extensionless executable, or code outside `scripts/` remains in the browsing skill.

- [ ] **Step 6: Run Chrome-backed verification when available**

Run:

```bash
pnpm --filter @bubstack/moe-glass test:chrome
```

Expected: `smoke`, `dialogs.smoke`, and `popup-dialog-integration` pass on a machine with Chrome; record an explicit environment skip otherwise.

- [ ] **Step 7: Commit**

```bash
git add packages/glass/skills packages/glass/src packages/glass/test packages/glass/README.md packages/glass/tsconfig.json
git commit -m "refactor(glass): expose portable skill CLI"
```
