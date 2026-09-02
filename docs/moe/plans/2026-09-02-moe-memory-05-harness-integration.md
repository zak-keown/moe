# Moe Memory Harness Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate explicit, non-conflicting MCP and hook projections for every supported harness while preserving Claude behavior, restoring trusted Codex SessionStart sync, and removing stale data from the optional Claude installer.

**Architecture:** The Claude-shaped source hook file remains a compositor input, while the normalized Memory runtime contract replaces the source `.mcp.json`. Shared projection helpers emit dedicated Claude, Codex, and Agent Plugins files; per-plugin Codex hook policy fails closed, and real minimum/current host tests guard parser and trust behavior. A dependency-free install catalog is generated from the same resolved platform records and replaced in the Mint transaction, so `bin/moe-install` contains no private URL or plugin list.

**Tech Stack:** Moe Mint adapters, JSON plugin manifests, Claude Code CLI, Codex CLI 0.152.1+, GitHub Copilot CLI compatibility fixtures, Vitest

**Spec:** `docs/moe/specs/2026-09-02-moe-memory-self-contained-plugin-design.md`

## Global Constraints

- Start from the HEAD produced by Plan 04; record that base SHA before dispatch, and require delegated findings to name the SHA they inspected.
- The generated plugin exposes no active default `hooks/hooks.json` or `.mcp.json`; Codex supplements custom paths with defaults, so suppression by duplicate discovery is forbidden.
- Claude points to `hooks/claude.json` and `claude.mcp.json`; one session runs one source sync and one bootstrap injection.
- Memory's Codex manifest points to `hooks/codex.json` and `codex.mcp.json`; the Codex hook file contains only source sync and never Claude bootstrap.
- Every other Codex-included plugin points to `hooks/codex-disabled.json` until audited, even if it currently has no source hook.
- `sync --hook` plus the outer shell guard must exit zero for missing Node/root/CLI and spawn/setup failures; direct sync modes keep observable output/status.
- Codex hook bytes remain subject to host trust. No install path may auto-trust them.
- Copilot support is released only if pinned minimum/current real CLI builds honor custom Claude manifest pointers with no default files.
- Cursor, Kimi, OpenCode, Pi, Agent Plugins, and existing Claude flows retain their pre-change emitted behavior unless the spec names a deliberate path change.

## Not Yet Specified

None. If either pinned Copilot build rejects custom pointers, this plan stops at its first task and returns to architecture; it does not silently restore unsafe defaults or downgrade support.

## Out of Scope

- Common multi-host installation CLI work and broad target certification remain outside this Memory fix; only the approved cleanup of the existing Claude-only `bin/moe-install` convenience command is included.
- Runtime backend and bundle implementation are complete in earlier Memory plans.
- Rollback and publication are Plans 06–07.

---

### Task 1: Pin and Run Host-Parser Compatibility Gates

**Files:**
- Create: `packages/mint/runtime/copilot-compatibility.json`
- Create: `packages/mint/test/manual/copilot-compatibility.js`
- Create: `packages/mint/test/fixtures/custom-component-paths/.claude-plugin/plugin.json`
- Create: `packages/mint/test/fixtures/custom-component-paths/hooks/claude.json`
- Create: `packages/mint/test/fixtures/custom-component-paths/claude.mcp.json`
- Create: `packages/mint/test/host-compatibility.test.ts`
- Modify: `packages/mint/package.json`
- Modify: `packages/memory/runtime/codex-compatibility.json`

**Interfaces:**
- Consumes: exact acquisition version/integrity for minimum/current Copilot and Codex builds; custom-path synthetic plugin.
- Produces: `pnpm --filter @bubstack/moe-mint test:host-compatibility` and pinned pass/fail compatibility records used by release gates.

- [ ] **Step 1: Add a manifest-driven host test that initially has no passing evidence**

```ts
it.each(compatibility.copilot)("$version follows custom Claude pointers", async (candidate) => {
  const result = await runHostCompatibility(candidate, customPathFixture, scriptedHostPort);
  expect(result).toMatchObject({ installed: true, hookCount: 1, mcpInitializeCount: 1 });
});
```

- [ ] **Step 2: Run the offline manifest/runner contract test to verify it fails**

Run: `pnpm --filter @bubstack/moe-mint exec vitest run test/host-compatibility.test.ts`

Expected: FAIL because the pinned manifests, fixture, and injected-runner contract do not exist. This ordinary Vitest file must remain offline and may not download packages or invoke a real host.

- [ ] **Step 3: Implement isolated acquisition and real install/execution probes**

Implement those real-host actions only in the `test/manual/` runner behind the explicit `test:host-compatibility` script. Install each exact package tarball into a temporary prefix, verify registry integrity, install the fixture through the host's real plugin command, trigger one matching session, and count hook/MCP handshakes from fixture-owned files. Run Codex 0.152.1 and pinned current against `.codex-plugin/plugin.json` with path-valued components. Record tool version, integrity, OS, expected result, and selected minimum; never resolve unpinned `latest` in the gate. Unit tests use injected fake acquisition and process ports.

- [ ] **Step 4: Run and inspect all pinned host lanes**

Run: `pnpm --filter @bubstack/moe-mint test:host-compatibility`

Expected: PASS for every pinned candidate. Any failure blocks Tasks 2–5 and requires a revised topology or explicit support decision.

- [ ] **Step 5: Commit reproducible host-compatibility evidence**

```bash
git add packages/mint/runtime/copilot-compatibility.json packages/mint/test/manual/copilot-compatibility.js packages/mint/test/fixtures/custom-component-paths packages/mint/test/host-compatibility.test.ts packages/mint/package.json packages/memory/runtime/codex-compatibility.json
git commit -m "test(mint): qualify custom plugin component paths"
```

### Task 2: Normalize MCP Projection and Codex Hook Policy

**Files:**
- Create: `packages/mint/src/adapters/mcp.ts`
- Create: `packages/mint/src/adapters/hooks.ts`
- Test: `packages/mint/test/adapters/mcp.test.ts`
- Test: `packages/mint/test/adapters/hooks.test.ts`
- Modify: `packages/mint/src/config.ts`
- Modify: `packages/mint/src/model.ts`
- Modify: `packages/mint/test/config.test.ts`
- Modify: `packages/mint/test/model.test.ts`
- Modify: `packages/memory/mint/moe-memory.yaml`
- Delete: `packages/memory/.mcp.json`

**Interfaces:**
- Consumes: `MemoryRuntimeContractV1` from Plan 04, foundation `ResolvedPlugin`, source `PluginModel.hooks`, and typed target intent.
- Produces: `NormalizedMcpServer`, `emitClaudeMcp()`, `emitCodexMcp()`, `emitAgentPluginsMcp()`, and `CodexSourceHookPolicy = "source" | "disabled"`.

- [ ] **Step 1: Write translation and fail-closed policy tests**

```ts
it("translates one server without copying unsupported pass-through syntax", () => {
  expect(emitCodexMcp(memoryRuntimeContract)).toEqual({
    "moe-memory": { command: "node", args: ["./dist/cli.js", "mcp-server"], cwd: "." },
  });
  expect(emitAgentPluginsMcp(memoryRuntimeContract).mcpServers["moe-memory"].env).toBeUndefined();
});
```

Assert Agent Plugins inherits its launcher environment and never serializes host secrets or silently claims `env_vars` support.

- [ ] **Step 2: Run focused Mint tests to verify they fail**

Run: `pnpm --filter @bubstack/moe-mint exec vitest run test/adapters/mcp.test.ts test/adapters/hooks.test.ts test/config.test.ts test/model.test.ts`

Expected: FAIL because adapters consume Claude-shaped `.mcp.json` directly and no separate Codex source-hook policy exists.

- [ ] **Step 3: Implement normalized projections and exact policy spelling**

```ts
export type CodexSourceHookPolicy = "source" | "disabled";

export interface NormalizedMcpServer {
  name: string;
  command: string;
  args: readonly string[];
  cwd: ".";
  forwardEnv: readonly string[];
}
```

Add `harnesses.codex.source_hooks: source | disabled`, distinct from existing bootstrap `hooks: generated | own`; default to `disabled`. Memory selects `source`. Translate Claude with its `mcpServers` wrapper, Codex as a direct server map, and Agent Plugins to its schema with inherited environment semantics documented as a preview limitation.

- [ ] **Step 4: Run config/model/projection tests**

Run: `pnpm --filter @bubstack/moe-mint exec vitest run test/adapters/mcp.test.ts test/adapters/hooks.test.ts test/config.test.ts test/model.test.ts`

Expected: PASS; malformed paths, unknown env variables, unsupported policy values, and source hooks on an omitted Codex target fail with structured diagnostics.

- [ ] **Step 5: Commit normalized host policy**

```bash
git add packages/mint/src/adapters/mcp.ts packages/mint/src/adapters/hooks.ts packages/mint/src/config.ts packages/mint/src/model.ts packages/mint/test/adapters/mcp.test.ts packages/mint/test/adapters/hooks.test.ts packages/mint/test/config.test.ts packages/mint/test/model.test.ts packages/memory/mint/moe-memory.yaml packages/memory/.mcp.json
git commit -m "feat(mint): normalize MCP and Codex hook policy"
```

### Task 3: Emit Dedicated Claude and Codex Components

**Files:**
- Modify: `packages/mint/src/adapters/claude-code.ts`
- Modify: `packages/mint/src/adapters/codex.ts`
- Modify: `packages/mint/src/adapters/types.ts`
- Modify: `packages/mint/src/bootstrap/shell-hook.ts`
- Modify: `packages/mint/src/matrix.ts`
- Modify: `packages/mint/test/adapters/claude-code.test.ts`
- Modify: `packages/mint/test/adapters/codex.test.ts`
- Modify: `packages/mint/test/bootstrap.test.ts`
- Modify: `packages/mint/test/matrix.test.ts`
- Modify: `packages/mint/test/adapters/registry.test.ts`
- Modify: `packages/memory/docs/CODEX.md`

**Interfaces:**
- Consumes: normalized projections and `CodexSourceHookPolicy` from Task 2; foundation capability emission.
- Produces: `hooks/claude.json`, `claude.mcp.json`, `hooks/codex.json`, `codex.mcp.json`, `hooks/codex-disabled.json`, and path-valued Claude/Codex manifests.

- [ ] **Step 1: Replace obsolete adapter expectations with exact dedicated-file tests**

```ts
expect(memoryCodexManifest).toMatchObject({
  skills: "./skills/", hooks: "./hooks/codex.json", mcpServers: "./codex.mcp.json",
});
expect(memoryCodexHooks.hooks.SessionStart).toHaveLength(1);
expect(JSON.stringify(memoryCodexHooks)).not.toContain("bootstrap");
```

For every unaudited included plugin, assert a path-valued `hooks` field targets the same generated empty hook map. For Claude, assert source hooks plus one bootstrap entry in one dedicated file.

- [ ] **Step 2: Run adapter tests to verify they fail**

Run: `pnpm --filter @bubstack/moe-mint exec vitest run test/adapters/claude-code.test.ts test/adapters/codex.test.ts test/bootstrap.test.ts test/matrix.test.ts test/adapters/registry.test.ts`

Expected: FAIL on Codex's current `{ hooks: {} }`, missing MCP output, and Claude's old merged/default topology.

- [ ] **Step 3: Emit dedicated files and capability results**

Claude plugin manifests always name custom hook/MCP paths when those components exist. Codex emits source-only memory hooks or the shared disabled map, reports hooks/MCP as emitted capabilities when present, and retains partial bootstrap because native skill discovery is not injected bootstrap context. Update install docs to remove the deleted `plugin_hooks` advice and describe trust.

- [ ] **Step 4: Run adapters, schemas, and snapshot tests**

Run: `pnpm --filter @bubstack/moe-mint test`

Expected: PASS with deterministic file paths and no adapter replacement of `package.json`.

- [ ] **Step 5: Commit dedicated projections**

```bash
git add packages/mint/src/adapters/claude-code.ts packages/mint/src/adapters/codex.ts packages/mint/src/adapters/types.ts packages/mint/src/bootstrap/shell-hook.ts packages/mint/src/matrix.ts packages/mint/test packages/memory/docs/CODEX.md
git commit -m "feat(mint): emit harness-specific hooks and MCP"
```

### Task 4: Remove Active Default Inputs from Final Artifacts

**Files:**
- Modify: `packages/mint/src/artifact/payload.ts`
- Modify: `packages/mint/src/artifact/assemble.ts`
- Modify: `packages/mint/src/generate.ts`
- Modify: `packages/mint/test/payload.test.ts`
- Modify: `packages/mint/test/assemble-artifact.test.ts`
- Modify: `packages/mint/test/generate.test.ts`
- Modify: `packages/mint/test/dogfood.test.ts`
- Modify: `packages/mint/test/__snapshots__/generate.test.ts.snap`
- Modify: `scripts/mint-plugins.mjs`

**Interfaces:**
- Consumes: source hook inputs, `MemoryRuntimeContractV1`, and all dedicated outputs from Task 3.
- Produces: final generated roots with no default `.mcp.json` or `hooks/hooks.json`, while hook scripts and per-harness output remain closed.

- [ ] **Step 1: Add input-only and path-closure tests**

```ts
it("keeps source-only inputs out of the artifact", async () => {
  const artifact = await composeRealPlugin("moe-memory");
  expect(artifact.exists(".mcp.json")).toBe(false);
  expect(artifact.exists("hooks/hooks.json")).toBe(false);
  expect(artifact.exists("claude.mcp.json")).toBe(true);
  expect(artifact.exists("codex.mcp.json")).toBe(true);
  expect(artifact.exists("hooks/claude.json")).toBe(true);
  expect(artifact.exists("hooks/codex.json")).toBe(true);
});
```

- [ ] **Step 2: Run compositor and dogfood tests to verify they fail**

Run: `pnpm --filter @bubstack/moe-mint exec vitest run test/payload.test.ts test/assemble-artifact.test.ts test/generate.test.ts test/dogfood.test.ts`

Expected: FAIL because current component staging copies the source default hook into the final root.

- [ ] **Step 3: Mark source-only component paths explicitly and prune only after projection**

The compositor reads source hooks plus the runtime contract into the model, emits all adapters, verifies each consumer path, then excludes the default hook input from the complete artifact inventory. The deleted source `.mcp.json` cannot reappear. It retains scripts beneath `hooks/`, Agent Plugins `mcp.json`, and all dedicated outputs. A validation/adapter failure leaves the previous generated tree untouched through the foundation transaction protocol.

- [ ] **Step 4: Regenerate and run all Mint gates**

Run: `pnpm mint && pnpm --filter @bubstack/moe-mint test && pnpm mint:check && pnpm artifact:check`

Expected: PASS; generated default paths are absent and every manifest reference remains root-contained.

- [ ] **Step 5: Commit source policy and generated outputs**

```bash
git add packages/mint/src/artifact/payload.ts packages/mint/src/artifact/assemble.ts packages/mint/src/generate.ts packages/mint/test scripts/mint-plugins.mjs plugins
git commit -m "fix(mint): prevent cross-harness default discovery"
```

### Task 5: Qualify Trust and Preserve Every Harness Flow

**Files:**
- Modify: `packages/memory/src/codex-hook-trust.ts`
- Modify: `packages/memory/src/doctor.ts`
- Modify: `packages/memory/src/doctor-cli.ts`
- Create: `packages/memory/test/codex-hook-trust.test.ts`
- Create: `packages/memory/test/artifact/harness-topology.test.ts`
- Modify: `packages/memory/test/codex-doctor.test.ts`
- Modify: `packages/memory/test/manual/codex-e2e.js`
- Modify: `packages/memory/test/manual/claude-e2e.js`
- Modify: `packages/mint/src/adapters/copilot.ts`
- Modify: `packages/mint/src/adapters/cursor.ts`
- Modify: `packages/mint/src/adapters/kimi.ts`
- Modify: `packages/mint/src/adapters/opencode.ts`
- Modify: `packages/mint/src/adapters/pi.ts`
- Modify: `packages/mint/src/adapters/agent-plugins.ts`
- Modify: corresponding files under `packages/mint/test/adapters/`

**Interfaces:**
- Consumes: extracted Memory tarball, dedicated host files, compatibility manifests, Codex trust/list output, and foundation package root/`./server`/Pi loaders.
- Produces: real-host trust evidence and regression coverage for all supported adapters.

- [ ] **Step 1: Add tarball-level inventory and trust-transition tests**

```ts
it("requires Codex trust and invalidates it when hook bytes change", async () => {
  const host = await installPackedMemoryInCodex();
  expect(await host.triggerSession()).toMatchObject({ syncCount: 0, trust: "untrusted" });
  await host.trustHook();
  expect(await host.triggerSession()).toMatchObject({ syncCount: 1, bootstrapCount: 0 });
  await host.mutateInstalledHook();
  expect(await host.triggerSession()).toMatchObject({ deltaSyncCount: 0, trust: "modified" });
});
```

- [ ] **Step 2: Run harness tests to verify new paths/trust behavior fail**

Run: `pnpm --filter @bubstack/moe-memory exec vitest run --project unit test/codex-hook-trust.test.ts test/artifact/harness-topology.test.ts test/codex-doctor.test.ts`

Expected: FAIL because trust and E2E paths still target the old topology.

- [ ] **Step 3: Update trust diagnostics and adapter-specific assertions**

Codex E2E proves untrusted, trusted-once, and byte-modified transitions. Claude E2E proves exactly one sync plus one bootstrap. Cursor retains its bootstrap-only hook behavior; Kimi retains `sessionStart.skill`; OpenCode loads `./server`; Pi retains `pi`; Agent Plugins validates `mcp.json` with inherited environment; Copilot reruns both pinned real builds against the final extracted tarball.

- [ ] **Step 4: Run every host and repository regression gate**

Run: `pnpm --filter @bubstack/moe-mint test && pnpm --filter @bubstack/moe-memory test && pnpm memory:artifact:test && pnpm mint:check && pnpm artifact:check`

Expected: PASS; authenticated/manual lanes are required release evidence even when they are not part of base CI.

- [ ] **Step 5: Commit harness qualification**

```bash
git add packages/memory/src/codex-hook-trust.ts packages/memory/src/doctor.ts packages/memory/src/doctor-cli.ts packages/memory/test packages/mint/src/adapters packages/mint/test/adapters plugins
git commit -m "test(memory): qualify harness-specific integration"
```

### Task 6: Generate the Legacy Claude Installer Catalog

**Files:**
- Modify: `packages/mint/src/platform/projections.ts`
- Modify: `packages/mint/test/platform-projections.test.ts`
- Modify: `scripts/lib/mint-generation-transaction.mjs`
- Modify: `packages/mint/test/transaction.test.ts`
- Modify: `scripts/mint-plugins.mjs`
- Modify: `package.json`
- Modify: `bin/moe-install`
- Create: `bin/moe-install-catalog.json`
- Create: `bin/test/install.test.mjs`
- Modify: `bin/test/doctor.test.mjs`

**Interfaces:**
- Consumes: foundation `ResolvedPlatform`, validated `PluginProjectionRecord[]`, the generated Claude marketplace projection, and the canonical repository URL reconciled from package Mint records.
- Produces: strict `InstallCatalogV1`, deterministic `bin/moe-install-catalog.json` in the same generation transaction, and a dependency-free Claude-only installer with no hard-coded repository URL or plugin list.

- [ ] **Step 1: Add failing bidirectional catalog and dry-run tests**

```ts
it("keeps the installer selection equal to every authoritative projection", async () => {
  const catalog = readInstallCatalog();
  expect(catalog.marketplace.name).toBe(readMarketplace().name);
  expect(catalog.marketplace.repository).toBe("https://github.com/zak-keown/moe");
  expect(new Set(catalog.plugins)).toEqual(new Set(loadPlatformRegistry(repoRoot).plugins.map((plugin) => plugin.id)));
  expect(new Set(catalog.plugins)).toEqual(new Set(readMarketplace().plugins.map((plugin) => plugin.name)));
  expect(catalog.plugins).toEqual(["moe", "moe-backstory", "moe-memory", "moe-glass", "moe-crew", "moe-statusline"]);
});
```

Add mutation cases for a new/retired registry plugin, reordered/duplicate catalog entries, marketplace disagreement, a noncanonical repository, unknown fields, and a missing generated catalog. Exercise install, upgrade, uninstall, help, and dry-run output without spawning Claude.

- [ ] **Step 2: Run installer and projection tests to verify stale literals fail**

Run: `pnpm --filter @bubstack/moe-mint exec vitest run test/platform-projections.test.ts test/transaction.test.ts && pnpm bin:test`

Expected: FAIL because `bin/moe-install` still names GitLab and maintains retired/private plugin aliases.

- [ ] **Step 3: Generate and consume one strict install-catalog projection**

```ts
export interface InstallCatalogV1 {
  schema: 1;
  marketplace: { name: string; repository: string };
  plugins: readonly string[];
}
```

Render plugin IDs in registry order from validated `PluginProjectionRecord[]`; derive the marketplace name from the Claude projection and require every reconciled package repository to equal the canonical GitHub URL before emitting it. Make the stdlib-only installer synchronously load and strictly validate the adjacent JSON file before printing or executing any action. Remove `MARKETPLACE_URL`, `PLUGINS`, `moe-core`, `moe-everything`, and every GitLab claim from the script and help text. Do not add dependency installation, Codex cache mutation, or hook trust.

- [ ] **Step 4: Extend atomic generation and reproducibility gates**

Treat `bin/moe-install-catalog.json` as a fourth transaction output beside `plugins/`, `.claude-plugin/marketplace.json`, and `docs/moe/generated/plugin-catalog.md`; failure or recovery must leave all four from one generation. Extend `pnpm mint:check` and transaction fault cuts to cover it, then run `pnpm mint && pnpm mint:check && pnpm bin:test && pnpm --filter @bubstack/moe-mint test`.

Expected: PASS; a second Mint run is byte-identical, the installer dry-run names exactly six current plugins and the GitHub marketplace URL, and no host command runs without `--apply`.

- [ ] **Step 5: Commit the installer projection and cleanup**

```bash
git add packages/mint/src/platform/projections.ts packages/mint/test/platform-projections.test.ts scripts/lib/mint-generation-transaction.mjs packages/mint/test/transaction.test.ts scripts/mint-plugins.mjs package.json bin/moe-install bin/moe-install-catalog.json bin/test/install.test.mjs bin/test/doctor.test.mjs
git commit -m "fix(installer): derive Claude actions from the platform registry"
```
