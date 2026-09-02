# Moe Memory Artifact Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compose the completed Memory runtime into one dependency-free generated plugin and prove its exact packed contents, laziness, metadata, and legal closure.

**Architecture:** The shared artifact foundation owns registry resolution, physical payload staging, package composition, `.moe/artifact.json`, and pack/extract primitives. Memory contributes a data-only runtime contract, explicit Mint payload roots, deterministic bundle inventory, package-specific artifact probes, and exact third-party legal records.

**Tech Stack:** TypeScript, JSON Schema, Moe Mint artifact APIs, esbuild metafiles, npm pack, Vitest, GitHub Actions

**Spec:** `docs/moe/specs/2026-09-02-moe-memory-self-contained-plugin-design.md`

## Global Constraints

- Start from the HEAD produced by Plan 03; record that base SHA before dispatch, and require delegated findings to name the SHA they inspected.
- Complete `docs/moe/plans/moe-artifact-registry-foundation-MANIFEST.md` before starting this plan.
- Mint YAML owns physical `from`/`to` payload mappings. `runtime-contract.json` owns only MCP/runtime semantics, forwarded environment, and package-relative asset selectors.
- The generated `@bubstack/moe-memory` tarball has no `dependencies`, `optionalDependencies`, lifecycle scripts, `node_modules`, source maps, tests, source, or Mint input YAML.
- Source `main` and `exports["."]` resolve the library; OpenCode owns only `exports["./server"]`; Pi adds only `package.json#pi`.
- Generated plugin trees are outputs of `pnpm mint`; never edit `plugins/` directly.
- Every referenced file is regular, package-root-contained, included by the exhaustive `files` array, and represented in `.moe/artifact.json` with raw-byte hash and mode.
- `NOTICE` plus typed Mint `imported_works` remain the sole attribution register. Every bundled/native/WASM input maps to a shipped legal record.
- `pnpm memory:artifact:test` always tests an extracted `.tgz` with no inherited `node_modules`.

## Not Yet Specified

None. The shared foundation fixes compositor and artifact schemas; this plan supplies Memory's concrete records.

## Out of Scope

- Shared platform-registry, compositor, and catalog implementation belongs to the prerequisite foundation plan set.
- Per-harness MCP/hook projections and real-host trust behavior are Plan 05.
- User-visible rollback execution and final release promotion are Plans 06–07.

---

### Task 1: Define and Reconcile Memory's Runtime Contract

**Files:**
- Create: `packages/memory/runtime-contract.json`
- Create: `packages/mint/schemas/runtime-contract.schema.json`
- Create: `packages/mint/src/runtime-contract.ts`
- Test: `packages/mint/test/runtime-contract.test.ts`
- Test: `packages/memory/test/runtime-contract.test.ts`
- Modify: `packages/memory/src/paths.ts`
- Modify: `packages/memory/src/summarizers/claude.ts`
- Modify: `packages/memory/src/summarizers/codex.ts`

**Interfaces:**
- Consumes: the foundation `ResolvedPlugin` source root and Memory's real configuration loaders.
- Produces: `MemoryRuntimeContractV1`, `loadRuntimeContract(sourceRoot)`, exact forwarded-environment set, server command, cwd, and native/WASM/model manifest selectors.

- [ ] **Step 1: Write strict schema and reconciliation tests**

```ts
it("matches every supported host-forwarded variable exactly", () => {
  const contract = loadRuntimeContract(memorySourceRoot);
  expect(new Set(contract.forwardEnv)).toEqual(scanSupportedEnvironmentVariables(memorySourceRoot));
  expect(contract.server).toEqual({
    name: "moe-memory", command: "node", args: ["./dist/cli.js", "mcp-server"], cwd: ".",
  });
});
```

Reject unknown keys, duplicate variables, internal/test-only variables, absolute/escaping asset paths, missing selected manifests, and any physical payload `from`/`to` entry in this file.

- [ ] **Step 2: Run runtime-contract tests to verify they fail**

Run: `pnpm --filter @bubstack/moe-mint exec vitest run test/runtime-contract.test.ts && pnpm --filter @bubstack/moe-memory exec vitest run --project unit test/runtime-contract.test.ts`

Expected: FAIL because no runtime contract or schema exists.

- [ ] **Step 3: Implement the data-only contract and loader**

```ts
export interface MemoryRuntimeContractV1 {
  schema: 1;
  server: { name: "moe-memory"; command: "node"; args: readonly string[]; cwd: "." };
  forwardEnv: readonly string[];
  assets: { native: string; embedding: string; model: string; claudeCompatibility: string; codexCompatibility: string };
}
```

Populate the exact variables from the approved spec, sort them deterministically, and maintain an explicit internal/test allowlist for scanner-only variables. Mint reads JSON data without importing Memory source or adding a TypeScript project reference.

- [ ] **Step 4: Run schema, reconciliation, and type gates**

Run: `pnpm --filter @bubstack/moe-mint exec vitest run test/runtime-contract.test.ts && pnpm --filter @bubstack/moe-memory exec vitest run --project unit test/runtime-contract.test.ts && pnpm typecheck`

Expected: PASS; adding a supported environment loader without forwarding it makes the reconciliation test red.

- [ ] **Step 5: Commit the runtime contract**

```bash
git add packages/memory/runtime-contract.json packages/mint/schemas/runtime-contract.schema.json packages/mint/src/runtime-contract.ts packages/mint/test/runtime-contract.test.ts packages/memory/test/runtime-contract.test.ts packages/memory/src/paths.ts packages/memory/src/summarizers/claude.ts packages/memory/src/summarizers/codex.ts
git commit -m "feat(memory): declare the packaged runtime contract"
```

### Task 2: Declare the Complete Dependency-Free Memory Payload

**Files:**
- Modify: `packages/memory/mint/moe-memory.yaml`
- Modify: `packages/memory/package.json`
- Modify: `packages/memory/src/version.ts`
- Modify: `packages/memory/test/version-consistency.test.ts`
- Modify: `packages/mint/src/config.ts`
- Modify: `packages/mint/src/package-manifest.ts`
- Modify: `packages/mint/src/artifact/artifact-manifest.ts`
- Modify: `packages/mint/src/artifact/check.ts`
- Modify: `packages/mint/test/config.test.ts`
- Modify: `packages/mint/test/package-manifest.test.ts`
- Modify: `packages/mint/test/artifact-manifest.test.ts`
- Modify: `packages/mint/test/artifact-check.test.ts`
- Modify: `pnpm-lock.yaml`
- Test: `packages/memory/test/package-contract.test.ts`

**Interfaces:**
- Consumes: foundation typed `artifact.payloads`, package-manifest composition, `checkArtifactSet()`, and the complete runtime output of Plans 01–03.
- Produces: Memory version `0.2.0`, complete Mint payload roots, `RuntimeDependencyPolicy = "preserve" | "bundled"`, `ExpectedArtifactContext.dependencyPolicy`, exact source dependencies, and dependency-free composed package metadata.

- [ ] **Step 1: Add package/payload/version contract tests**

```ts
it("composes a self-contained 0.2.0 package", async () => {
  expect(readSourcePackage().dependencies).toMatchObject({
    "@huggingface/tokenizers": "0.1.3",
    "onnxruntime-web": "1.26.0-dev.20260416-b7804b056c",
    "sqlite-vec": "0.1.9",
  });
  const artifact = await composeRealPlugin("moe-memory");
  expect(artifact.packageJson.version).toBe("0.2.0");
  expect(artifact.packageJson.dependencies).toBeUndefined();
  expect(artifact.packageJson.scripts).toBeUndefined();
  expect(artifact.packageJson.exports["."]).toMatchObject({ import: "./dist/index.js" });
  expect(artifact.packageJson.exports["./server"]).toBe("./.opencode/plugins/moe-memory.js");
});

it("preserves dependencies unless one bundle-proven artifact opts out", async () => {
  const reports = await checkArtifactSet(realSixPluginSet());
  expect(reports.filter((report) => report.dependencyPolicy === "bundled").map((report) => report.plugin)).toEqual(["moe-memory"]);
  expect(reports.every((report) => report.dependencyClosure.ok)).toBe(true);
});
```

- [ ] **Step 2: Run the package contract to verify it fails**

Run: `pnpm --filter @bubstack/moe-memory exec vitest run --project unit test/package-contract.test.ts test/version-consistency.test.ts`

Expected: FAIL because Memory is 0.1.5, the generated artifact still preserves source dependencies, and no bundle-proven omission policy or complete payload declaration exists.

- [ ] **Step 3: Reclassify build inputs and add exact payload declarations**

Keep `@huggingface/tokenizers`, `onnxruntime-web`, and `sqlite-vec` as exact direct source dependencies so dependency ownership and TypeScript project metadata remain truthful. Extend typed Mint policy with `artifact.node_package.dependencies: bundled`, defaulting every plugin to `preserve`. Thread that policy into `checkArtifactSet()` and its independently resolved `ExpectedArtifactContext`; its six-plugin table must still require dependency preservation for the other five artifacts. Permit omission from the generated Memory package only when its bundle inventory accounts for every non-built-in JavaScript import and its explicit native/WASM payload records pass; otherwise fail composition and artifact verification. Declare required `dist`, `runtime`, `vendor/sqlite-vec`, docs/migration guide, skill, agent, prompt, hook-source inputs, and legal outputs through typed Mint policy. Set source package, Mint YAML, and `VERSION` to 0.2.0 together. Preserve `main: dist/index.js`, root exports/types/bin/engines, and let adapters add `./server` and `pi`.

- [ ] **Step 4: Build, compose, and test package metadata**

Run: `pnpm --filter @bubstack/moe-mint exec vitest run test/config.test.ts test/package-manifest.test.ts test/artifact-manifest.test.ts test/artifact-check.test.ts && pnpm --filter @bubstack/moe-memory build && pnpm mint && pnpm --filter @bubstack/moe-memory exec vitest run --project unit test/package-contract.test.ts test/version-consistency.test.ts && pnpm artifact:check`

Expected: PASS; all version sources agree and the composed package has no runtime dependency or lifecycle field.

- [ ] **Step 5: Commit source authorities and generated output**

```bash
git add packages/memory/package.json packages/memory/src/version.ts packages/memory/mint/moe-memory.yaml packages/memory/test/package-contract.test.ts packages/memory/test/version-consistency.test.ts packages/mint/src/config.ts packages/mint/src/package-manifest.ts packages/mint/src/artifact/artifact-manifest.ts packages/mint/src/artifact/check.ts packages/mint/test/config.test.ts packages/mint/test/package-manifest.test.ts packages/mint/test/artifact-manifest.test.ts packages/mint/test/artifact-check.test.ts pnpm-lock.yaml plugins
git commit -m "build(memory): compose the complete 0.2.0 payload"
```

### Task 3: Close Bundled, Native, WASM, and Capsule Provenance

**Files:**
- Modify: `NOTICE`
- Modify: `packages/memory/mint/moe-memory.yaml`
- Create: `packages/memory/legal/license-files.json`
- Create: `packages/memory/test/legal-closure.test.ts`
- Modify: `scripts/check-provenance.mjs`
- Modify: `scripts/fixtures/provenance-red/NOTICE`

**Interfaces:**
- Consumes: foundation bundle-inventory/legal reconciliation, `dist/bundle-metafile.json`, native/embedding/model manifests, and recovery-capsule inventories.
- Produces: exact imported-work records and a complete generated legal payload for every redistributed Memory byte.

- [ ] **Step 1: Add a red legal-closure test over the real artifact**

```ts
it("maps every redistributed input to one shipped legal record", () => {
  const closure = reconcileMemoryLegalClosure(realMemoryArtifact());
  expect(closure.unaccounted).toEqual([]);
  expect(closure.extra).toEqual([]);
  expect(closure.records.map((item) => item.work)).toEqual(
    expect.arrayContaining(["sqlite-vec", "huggingface-tokenizers", "onnxruntime-web"]),
  );
});
```

- [ ] **Step 2: Run legal and provenance checks to verify missing records fail**

Run: `pnpm --filter @bubstack/moe-memory exec vitest run --project unit test/legal-closure.test.ts && pnpm provenance`

Expected: FAIL on the new bundled/native/WASM inputs until `NOTICE`, typed imports, and license payloads agree.

- [ ] **Step 3: Record and generate the exact legal closure**

Add exact source, revision/version, license, copyright, destination, upstream license hash, and required notice for tokenizer code, ONNX Runtime Web, sqlite-vec source/binaries, and capsule contents. Include MIT, Apache-2.0, and ONNX third-party notice texts required by the actual inventory. Do not create a second attribution register: `license-files.json` only maps canonical `NOTICE`/Mint work keys to shipped license-source paths and hashes.

- [ ] **Step 4: Run provenance against normal and tampered artifacts**

Run: `pnpm provenance && pnpm --filter @bubstack/moe-memory exec vitest run --project unit test/legal-closure.test.ts`

Expected: PASS for the real artifact and fail with stable legal diagnostic codes for missing/extra/hash-mismatched fixtures.

- [ ] **Step 5: Commit legal records with their inventory evidence**

```bash
git add NOTICE packages/memory/mint/moe-memory.yaml packages/memory/legal/license-files.json packages/memory/test/legal-closure.test.ts scripts/check-provenance.mjs scripts/fixtures/provenance-red
git commit -m "legal(memory): close redistributed runtime provenance"
```

### Task 4: Add the Exact Memory Tarball Gate

**Files:**
- Create: `scripts/test-memory-artifact.mjs`
- Create: `packages/memory/test/artifact/package-smoke.test.ts`
- Create: `packages/memory/test/artifact/mcp-smoke.test.ts`
- Create: `packages/memory/test/artifact/lazy-load.test.ts`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: foundation `ExpectedArtifactContext`, `PackedArtifact`, `packArtifactOnce(root, outputDir, expected)`, `verifyPackedArtifact(tarballPath, expected)`, independently resolved live registry/emission context, and generated `plugins/moe-memory`.
- Produces: `pnpm memory:artifact:test [--expected-version <semver>] [--output-dir <path>] [--record <path>]`, verified `PackedArtifact` JSON containing the exact `.tgz` path plus SHA-256/SHA-512 evidence, and an always-on clean-checkout CI job.

- [ ] **Step 1: Add extracted-artifact smoke tests and command contract**

```ts
it("runs without a workspace or node_modules", async () => {
  const extracted = await extractVerifiedMemoryTarball();
  expect(await runNode(extracted.bin, ["--version"], { cwd: extracted.root })).toMatchObject({
    status: 0, stdout: "0.2.0\n",
  });
  expect(await importFrom(extracted.root, "@bubstack/moe-memory")).toBeDefined();
});
```

Assert all chunks/declarations, five native assets, WASM, runtime/model/compatibility manifests, skills/agents/prompts, harness manifests, hook scripts/modes, migration guide, and legal files. Compare `npm pack --dry-run` with the exhaustive `files` array and `git ls-files` with expected generated runtime paths.

- [ ] **Step 2: Run the proposed command/tests to verify they fail**

Run: `pnpm memory:artifact:test`

Expected: FAIL because the root command, wrapper, and package-specific extraction probes do not exist.

- [ ] **Step 3: Implement one pack-once wrapper and clean-checkout CI job**

```js
const expected = await resolveExpectedArtifactContext(repoRoot, "moe-memory");
const packed = await packArtifactOnce("plugins/moe-memory", outputDir, expected);
await verifyPackedArtifact(packed.tarballPath, expected);
await runMemoryArtifactTests(packed.tarballPath, { expectedVersion });
await writeOptionalRecord(recordPath, packed);
process.stdout.write(`${JSON.stringify(packed)}\n`);
```

Resolve `ExpectedArtifactContext` from the live platform registry and current adapter emissions before packing; never trust the generated artifact to describe its own expected identity or capabilities. The optional expected version comes from the release catalog; premerge omits it. `--record` writes the returned `PackedArtifact` atomically so later matrix/release tasks consume `tarballPath` instead of guessing npm's filename. Add narrow `.gitignore` exceptions for generated Memory runtime paths and fail when any expected artifact is ignored or untracked. CI installs from a frozen lockfile, builds, mints, packs once, then tests only the extraction.

- [ ] **Step 4: Run local artifact and repository gates**

Run: `pnpm memory:artifact:test && pnpm artifact:check && pnpm mint:check && pnpm provenance && pnpm check`

Expected: PASS; the command reports the exact tested tarball and digests without repacking.

- [ ] **Step 5: Commit the artifact gate and generated bytes**

```bash
git add scripts/test-memory-artifact.mjs packages/memory/test/artifact package.json .github/workflows/ci.yml .gitignore plugins
git commit -m "test(memory): gate the exact packed artifact"
```
