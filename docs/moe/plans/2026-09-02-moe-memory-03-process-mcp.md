# Moe Memory Process Adapters and MCP Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve Claude and Codex summarization while making MCP startup fast, lazy, offline-safe, and bundle-ready.

**Architecture:** A small injectable child-process seam supports separate Claude CLI and Codex app-server adapters. The MCP server registers its seven stable tools and connects stdio before creating database/model/journal services, then resolves a high-level `MemoryToolRuntime` lazily per operation.

**Tech Stack:** TypeScript, Node child processes, Model Context Protocol SDK, Zod, Codex app-server JSONL, Claude CLI JSON output, esbuild, Vitest

**Spec:** `docs/moe/specs/2026-09-02-moe-memory-self-contained-plugin-design.md`

## Global Constraints

- Start from the HEAD produced by Plan 02; record that base SHA before dispatch, and require delegated findings to name the SHA they inspected.
- Claude invocation is `claude -p --input-format text --output-format json --no-session-persistence --model <model>` with `--system-prompt` only for fresh summaries and `--resume` only for resumed summaries.
- Claude inherits the baseline environment minus `NODE_OPTIONS`, overlays configured API values, and sets `MOE_MEMORY_SUMMARIZER_GUARD=1`.
- Only the exact missing-session stderr message containing the requested ID maps to `SummarizerSdkError("error_during_execution", requestedId)` before one resume-to-fresh retry.
- Codex keeps ephemeral `thread/fork`, read-only sandbox policy, transcript fallback, and `codex app-server`; `MIN_CODEX_VERSION` is exactly `0.152.1` and applies only to Codex-native features.
- MCP `initialize` and `tools/list` must finish within two seconds from a cold extracted artifact before database, journal, model, or network work.
- MCP stdout contains JSON-RPC frames only. All progress and diagnostics use bounded stderr or structured tool results.
- Server identity and all seven tool names, descriptions, annotations, input schemas, and output schemas remain exact.
- Deterministic split chunks may be loaded only through vector-operation dynamic imports.

## Not Yet Specified

None. The exact Claude minimum is a measured compatibility-manifest result; failure to qualify any pinned candidate blocks the task instead of weakening the approved CLI contract.

## Out of Scope

- Harness manifest paths and hook trust are Plan 05.
- Complete artifact inventory, legal closure, and publication are downstream plans.
- Rollback commands are Plan 06.

---

### Task 1: Replace the Claude Agent SDK with a Qualified CLI Adapter

**Files:**
- Create: `packages/memory/src/summarizers/process.ts`
- Create: `packages/memory/src/summarizers/claude.ts`
- Create: `packages/memory/runtime/claude-compatibility.json`
- Create: `packages/memory/test/claude-cli-summarizer.test.ts`
- Create: `packages/memory/test/claude-compatibility.test.ts`
- Create: `packages/memory/test/manual/claude-compatibility.js`
- Modify: `packages/memory/src/summarizer.ts`
- Modify: `packages/memory/test/summarizer-options.test.ts`
- Modify: `packages/memory/test/summarizer-resume-fallback.test.ts`
- Modify: `packages/memory/test/sync-error-sentinel.test.ts`
- Modify: `packages/memory/test/manual/claude-e2e.js`
- Modify: `packages/memory/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: existing `SummarizerSdkError`, `isResumeFailure`, model/fallback environment variables, recorded session ID/cwd, and the reentrancy guard.
- Produces: `ProcessAdapter`, `ProcessSpec`, `ProcessResult`, `buildClaudeSummarizerCommand()`, `runClaudeCommand()`, and qualified `MIN_CLAUDE_VERSION`.

- [ ] **Step 1: Write exact argv, protocol, error, and environment tests**

```ts
it("classifies only the exact missing resumed session", async () => {
  const process = scriptedProcess({
    code: 1,
    stdout: "",
    stderr: "No conversation found with session ID: missing-42\n",
  });
  await expect(runClaudeCommand(command({ sessionId: "missing-42" }), process)).rejects.toEqual(
    expect.objectContaining({ subtype: "error_during_execution", sessionId: "missing-42" }),
  );
});
```

Cover structured `is_error` precedence, nonzero exit, spawn error, signal, timeout, malformed JSON, non-string result, bounded sanitized stderr, stdin close, fresh/resumed flag differences, missing cwd, and source-session byte identity. The ordinary Vitest file validates manifest shape and an injected scripted runner only; it never downloads a package or invokes a real host.

- [ ] **Step 2: Run summarizer tests to verify they fail**

Run: `pnpm --filter @bubstack/moe-memory exec vitest run --project unit test/claude-cli-summarizer.test.ts test/claude-compatibility.test.ts test/summarizer-options.test.ts test/summarizer-resume-fallback.test.ts`

Expected: FAIL because `summarizer.ts` calls `@anthropic-ai/claude-agent-sdk` directly.

- [ ] **Step 3: Implement the bounded process protocol and compatibility manifest**

```ts
export interface ProcessSpec {
  command: string;
  args: readonly string[];
  cwd?: string;
  env: NodeJS.ProcessEnv;
  stdin: string;
  timeoutMs: number;
  maxStderrBytes: number;
}

export interface ProcessAdapter {
  run(spec: ProcessSpec): Promise<ProcessResult>;
}
```

Lookup order is `MOE_MEMORY_CLAUDE_BIN`, then `claude`. Preserve primary/fallback model and thinking-budget fallback. The explicit `test:claude-compatibility` manual command installs the 2.1.141 baseline, 2.1.258 current lane, and an ordered set of intermediate candidates in isolation using the manifest's npm version and integrity until the first passing floor is established. Record every exercised candidate and the oldest pass as `MIN_CLAUDE_VERSION`; do not imply untested versions passed. A missing executable records the existing error sentinel and leaves raw recall usable.

- [ ] **Step 4: Run offline and authenticated Claude gates**

Run: `pnpm --filter @bubstack/moe-memory test && pnpm --filter @bubstack/moe-memory test:claude-compatibility && MOE_MEMORY_RUN_CLAUDE_E2E=1 pnpm --filter @bubstack/moe-memory test:claude-e2e`

Expected: PASS; the authenticated lane creates no new Claude session and does not change the source JSONL hash.

- [ ] **Step 5: Commit the Claude CLI adapter and remove its final SDK dependency**

```bash
git add packages/memory/src/summarizers packages/memory/src/summarizer.ts packages/memory/runtime/claude-compatibility.json packages/memory/test packages/memory/package.json pnpm-lock.yaml
git commit -m "refactor(memory): summarize through the Claude CLI"
```

Remove `@anthropic-ai/claude-agent-sdk` only after the final import disappears. Do not synthesize `CLAUDE_CODE_ENTRYPOINT=sdk-ts` or an undocumented max-token flag.

### Task 2: Extract and Qualify the Codex App-Server Adapter

**Files:**
- Create: `packages/memory/src/summarizers/codex.ts`
- Create: `packages/memory/runtime/codex-compatibility.json`
- Test: `packages/memory/test/codex-summarizer.test.ts`
- Test: `packages/memory/test/codex-compatibility.test.ts`
- Create: `packages/memory/test/manual/codex-compatibility.js`
- Modify: `packages/memory/src/summarizer.ts`
- Modify: `packages/memory/src/codex-support.ts`
- Modify: `packages/memory/src/doctor.ts`
- Modify: `packages/memory/src/doctor-cli.ts`
- Modify: `packages/memory/test/codex-support.test.ts`
- Modify: `packages/memory/test/codex-doctor.test.ts`
- Modify: `packages/memory/test/manual/codex-e2e.js`
- Modify: `packages/memory/docs/CODEX.md`
- Modify: `packages/memory/package.json`

**Interfaces:**
- Consumes: `ProcessAdapter` from Task 1 and current `runCodexCommand` app-server protocol.
- Produces: `CodexSummarizer`, `MIN_CODEX_VERSION = "0.152.1"`, pinned minimum/current compatibility records, and Codex-scoped doctor degradation.

- [ ] **Step 1: Preserve the app-server protocol in adapter-level tests**

```ts
it("forks ephemerally and starts a read-only turn", async () => {
  const transcript = await runCodexCommand(buildCodexSummarizerCommand(input), scriptedAppServer());
  expect(transcript.requests.map((request) => request.method)).toEqual([
    "initialize", "thread/fork", "turn/start",
  ]);
  expect(transcript.requests[1].params.ephemeral).toBe(true);
  expect(transcript.requests[1].params.sandbox).toBe("read-only");
});
```

- [ ] **Step 2: Run Codex summarizer and doctor tests to verify the floor change fails**

Run: `pnpm --filter @bubstack/moe-memory exec vitest run --project unit test/codex-summarizer.test.ts test/codex-compatibility.test.ts test/codex-support.test.ts test/codex-doctor.test.ts`

Expected: FAIL because the adapter is still mixed into `summarizer.ts` and the minimum is 0.130.0.

- [ ] **Step 3: Move Codex behavior intact and scope the new minimum**

```ts
export const MIN_CODEX_VERSION = "0.152.1";

export interface CodexSummarizer {
  summarize(command: CodexSummarizerCommand): Promise<string>;
}
```

Keep version probing, model selection, timeout, fork, turn streaming, and transcript fallback. Ordinary Vitest exercises manifest/schema logic and an injected scripted app-server only. The explicit `test:codex-compatibility` manual command acquires and runs exact minimum/current builds from the pinned manifest. Remove instructions to enable the deleted `plugin_hooks` feature. An absent/old Codex binary may fail only Codex summary/trust diagnostics; it cannot fail MCP startup, text recall, Claude summaries, or another harness.

- [ ] **Step 4: Run unit and authenticated Codex gates**

Run: `pnpm --filter @bubstack/moe-memory test && pnpm --filter @bubstack/moe-memory test:codex-compatibility && MOE_MEMORY_RUN_CODEX_E2E=1 pnpm --filter @bubstack/moe-memory test:codex-e2e`

Expected: PASS against exact Codex 0.152.1 and the pinned current lane.

- [ ] **Step 5: Commit the Codex adapter extraction**

```bash
git add packages/memory/src/summarizers/codex.ts packages/memory/src/summarizer.ts packages/memory/src/codex-support.ts packages/memory/src/doctor.ts packages/memory/src/doctor-cli.ts packages/memory/runtime/codex-compatibility.json packages/memory/test packages/memory/docs/CODEX.md packages/memory/package.json
git commit -m "refactor(memory): isolate Codex summarization"
```

### Task 3: Connect MCP Before Heavy Runtime Initialization

**Files:**
- Create: `packages/memory/src/mcp-runtime.ts`
- Create: `packages/memory/test/mcp-contract.test.ts`
- Create: `packages/memory/test/mcp-startup.test.ts`
- Create: `packages/memory/test/mcp-lazy-failure.test.ts`
- Modify: `packages/memory/src/mcp-server.ts`
- Modify: `packages/memory/src/cli.ts`
- Delete: `packages/memory/src/install-check.ts`
- Delete: `packages/memory/test/install-check.test.ts`
- Modify: `packages/memory/test/version-consistency.test.ts`

**Interfaces:**
- Consumes: text-first stores and `EmbeddingCoordinator` from Plan 02.
- Produces: `MemoryToolRuntime`, `MemoryToolRuntimeFactory`, lazy tool handlers, exact tool snapshot, and connect-first `runMemoryMcpServer()`.

- [ ] **Step 1: Add cold-start, schema-snapshot, and failure-isolation tests**

```ts
it("lists all tools before opening storage or loading vector modules", async () => {
  const probe = instrumentRuntimeLoads();
  const client = await startMemoryMcp({ runtimeFactory: probe.factory });
  expect(await client.listTools()).toMatchSnapshot();
  expect(probe.events).toEqual([]);
  expect(performance.now() - probe.startedAt).toBeLessThan(2000);
});
```

Capture every stdout byte during failed migration, missing model, offline download, and background journal refresh; parse all bytes as JSON-RPC. Exercise `search_journal` while the model, capsule, and vector migration are blocked and require stored journal text results plus readiness progress without a vector query.

- [ ] **Step 2: Run MCP tests to verify they fail**

Run: `pnpm --filter @bubstack/moe-memory exec vitest run --project unit test/mcp-contract.test.ts test/mcp-startup.test.ts test/mcp-lazy-failure.test.ts`

Expected: FAIL because `runMemoryMcpServer` performs dependency, database, model, and journal work before transport connection.

- [ ] **Step 3: Introduce a high-level lazy runtime and reorder startup**

```ts
export interface SearchOutcome<T> {
  results: readonly T[];
  vectorReadiness?: VectorReadiness;
}

export interface MemoryToolRuntime {
  searchConversations(query: string | readonly string[], options: SearchOptions): Promise<SearchOutcome<SearchResult>>;
  searchJournal(query: string, options: JournalSearchOptions): Promise<SearchOutcome<JournalSearchResult>>;
}

export type MemoryToolRuntimeFactory = () => Promise<MemoryToolRuntime>;

export async function runMemoryMcpServer(argv = process.argv.slice(2)): Promise<void> {
  const transport = new StdioServerTransport();
  const server = createMemoryMcpServer({ runtimeFactory: createLazyRuntime });
  await server.connect(transport);
  scheduleJournalRefresh();
}
```

Combined searches prefix their normal text result with vector-upgrade progress; vector-only searches return a structured tool error while blocked/upgrading. Do not alter the seven input schemas. Text-only handlers open SQLite lazily and never import vector chunks. Background journal failure is stderr-only and retryable.

- [ ] **Step 4: Run the full MCP and offline Memory suite**

Run: `pnpm --filter @bubstack/moe-memory test`

Expected: PASS; `initialize`/`tools/list` remain under two seconds and no install-check remains.

- [ ] **Step 5: Commit connect-first MCP startup**

```bash
git add packages/memory/src/mcp-runtime.ts packages/memory/src/mcp-server.ts packages/memory/src/cli.ts packages/memory/test/mcp-contract.test.ts packages/memory/test/mcp-startup.test.ts packages/memory/test/mcp-lazy-failure.test.ts packages/memory/test/version-consistency.test.ts packages/memory/src/install-check.ts packages/memory/test/install-check.test.ts
git commit -m "refactor(memory): initialize MCP before runtime services"
```

### Task 4: Build Deterministic Dependency-Free Runtime Chunks

**Files:**
- Create: `packages/memory/scripts/build-runtime.mjs`
- Create: `packages/memory/test/bundle-laziness.test.ts`
- Create: `packages/memory/test/bundle-closure.test.ts`
- Create: `packages/memory/test/bundle-package-root.test.ts`
- Modify: `packages/memory/src/cli.ts`
- Modify: `packages/memory/src/index.ts`
- Modify: `packages/memory/package.json`
- Modify: `packages/memory/tsconfig.json`
- Modify: `packages/memory/tsconfig.tests.json`
- Modify: `packages/memory/vitest.config.ts`

**Interfaces:**
- Consumes: the final source dependency graph from Tasks 1–3 and Plan 02, plus `InstalledPackageRoot` from Plan 01.
- Produces: `dist/cli.js` and `dist/index.js` entrypoints that each bind the installed root before constructing services, `dist/index.d.ts`, deterministic content-hashed ESM chunks, `dist/bundle-manifest.json`, and `dist/bundle-metafile.json`.

- [ ] **Step 1: Add bundle closure and module-evaluation tests**

```ts
it("does not evaluate vector chunks for import, discovery, or text search", async () => {
  const artifact = await buildInstrumentedRuntime();
  await artifact.importLibrary();
  await artifact.initializeMcp();
  await artifact.listTools();
  await artifact.searchText("manifest composition");
  expect(artifact.evaluatedChunks()).not.toContain("vector");
});

it.each(["dist/cli.js", "dist/index.js"])("resolves assets from the extracted root through %s", async (entrypoint) => {
  const artifact = await buildAndExtractSplitRuntime();
  expect(await artifact.probeDatabaseAndAssets(entrypoint)).toMatchObject({
    packageRoot: artifact.root,
    nativeTarget: currentTarget,
    modelManifestInsideRoot: true,
  });
});
```

- [ ] **Step 2: Run bundle tests to verify they fail**

Run: `pnpm --filter @bubstack/moe-memory exec vitest run --project unit test/bundle-laziness.test.ts test/bundle-closure.test.ts test/bundle-package-root.test.ts`

Expected: FAIL because the build is plain `tsc` and emits dependency-bearing modules with no manifest/metafile.

- [ ] **Step 3: Add an explicit esbuild production build and declaration build**

```js
await esbuild.build({
  entryPoints: { cli: "src/cli.ts", index: "src/index.ts" },
  outdir: "dist",
  bundle: true,
  splitting: true,
  format: "esm",
  platform: "node",
  target: ["node22.13"],
  metafile: true,
  sourcemap: false,
  chunkNames: "chunks/[name]-[hash]",
});
```

Sort and hash the emitted chunk inventory into `bundle-manifest.json`; reject absolute source paths/timestamps. Bundle all JavaScript dependencies, but leave native extensions, WASM, model metadata, and legal files explicit. Run `tsc --emitDeclarationOnly` for declarations.
Resolve `InstalledPackageRoot` only in the two public entrypoints and inject it through CLI/library runtime construction into database, native, WASM, and model resolvers. Build the real split output into a temporary package-shaped root and exercise both entrypoints there; a test must fail if any shared chunk resolves assets relative to `dist/chunks/`.

- [ ] **Step 4: Run build, clean-consumer, and laziness tests**

Run: `pnpm --filter @bubstack/moe-memory build && pnpm --filter @bubstack/moe-memory exec vitest run --project unit test/bundle-laziness.test.ts test/bundle-closure.test.ts test/bundle-package-root.test.ts test/public-api.test.ts`

Expected: PASS; the manifest accounts for every emitted chunk and contains no host-absolute path.

- [ ] **Step 5: Commit the deterministic bundle**

```bash
git add packages/memory/scripts/build-runtime.mjs packages/memory/src/cli.ts packages/memory/src/index.ts packages/memory/package.json packages/memory/tsconfig.json packages/memory/tsconfig.tests.json packages/memory/vitest.config.ts packages/memory/test/bundle-laziness.test.ts packages/memory/test/bundle-closure.test.ts packages/memory/test/bundle-package-root.test.ts
git commit -m "build(memory): emit self-contained runtime chunks"
```

### Task 5: Add the Internal Always-Zero Session Hook Mode

**Files:**
- Modify: `packages/memory/src/sync-cli.ts`
- Modify: `packages/memory/src/cli.ts`
- Modify: `packages/memory/hooks/hooks.json`
- Modify: `packages/memory/test/hooks.test.ts`
- Modify: `packages/memory/test/sync-cli-reentrancy.test.ts`
- Modify: `packages/memory/test/sync-cli-single-instance.test.ts`
- Create: `packages/memory/test/sync-cli-hook-mode.test.ts`

**Interfaces:**
- Consumes: existing background sync, reentrancy guard, log path, and single-instance lock.
- Produces: internal `sync --hook` mode and a shell-guarded source hook command; direct `sync`/`sync --background` remain unchanged.

- [ ] **Step 1: Add hook-mode failure tests**

```ts
it.each(["missing-node", "missing-root", "missing-cli", "spawn-throw", "spawn-error"])(
  "returns zero for %s",
  async (failure) => expect(await runHookFixture(failure)).toMatchObject({ status: 0, stdout: "" }),
);
```

Assert bounded stderr, no success stdout, background detachment, reentrant skip, and unchanged direct-CLI status/output.

- [ ] **Step 2: Run hook tests to verify they fail**

Run: `pnpm --filter @bubstack/moe-memory exec vitest run --project unit test/hooks.test.ts test/sync-cli-hook-mode.test.ts test/sync-cli-reentrancy.test.ts test/sync-cli-single-instance.test.ts`

Expected: FAIL because current `--background` prints success output and setup/spawn errors can escape nonzero.

- [ ] **Step 3: Implement hook-only normalization and the outer guard**

```ts
if (args.includes("--hook")) {
  try {
    await launchBackgroundSync({ quiet: true });
  } catch (error) {
    writeBoundedHookDiagnostic(error);
  }
  return 0;
}
```

Use a source command equivalent to `node "${PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT}}/dist/cli.js" sync --hook || { printf '%s\n' 'moe-memory: SessionStart sync unavailable' >&2; true; }`. Keep the JSON handler non-async and preserve normal CLI semantics.

- [ ] **Step 4: Run hook and package gates**

Run: `pnpm --filter @bubstack/moe-memory test && pnpm --filter @bubstack/moe-memory build`

Expected: PASS; every hook failure exits zero while direct failures remain observable.

- [ ] **Step 5: Commit the hook-safe mode**

```bash
git add packages/memory/src/sync-cli.ts packages/memory/src/cli.ts packages/memory/hooks/hooks.json packages/memory/test/hooks.test.ts packages/memory/test/sync-cli-hook-mode.test.ts packages/memory/test/sync-cli-reentrancy.test.ts packages/memory/test/sync-cli-single-instance.test.ts
git commit -m "fix(memory): make SessionStart sync nonfatal"
```
