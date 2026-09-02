# Moe Memory Release Qualification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Qualify and promote the exact self-contained Memory 0.2.0 artifact only after runtime, platform, harness, recovery, and provenance evidence binds to the same bytes.

**Architecture:** Memory extends the shared foundation release catalog with package-specific platform and recovery records. CI and protected host workflows consume the one tarball produced by `memory:artifact:test`; candidate publication uploads and publishes those bytes, while stable promotion downloads and retags them without rebuilding.

**Tech Stack:** GitHub Actions, npm trusted publishing/OIDC, Moe platform release catalogs, Node 22/24, macOS/Linux runners, Claude/Codex/Copilot CLIs

**Spec:** `docs/moe/specs/2026-09-02-moe-memory-self-contained-plugin-design.md`

## Global Constraints

- Start from the HEAD produced by Plan 06; record that base SHA before dispatch, and require delegated findings to name the SHA they inspected.
- Memory's npm version is exactly 0.2.0. Platform catalog version remains independent and follows the shared foundation's maintenance/formal-release policy.
- Publish only the `.tgz` that passed `pnpm memory:artifact:test`; never publish from `packages/memory`, repack, run lifecycle scripts, or rebuild during stable promotion.
- Only changed generated artifacts receive new immutable npm versions. A hook/MCP topology byte change at an existing version is a hard error.
- Required Node lanes are 22.13.0, 22.23.2, and 24.20.0. Native runtime lanes cover macOS/Linux arm64/x64; Windows x64 receives database-asset smoke only; WSL2 follows Linux.
- Real Claude and Codex install/update/enable/trust behavior is required. Copilot minimum/current custom-path evidence must pass; structural projection is not certification.
- The exact 0.1.5 recovery capsule for each of the four supported macOS/Linux targets must be downloadable and verified before a candidate can migrate any version-2 database. Windows remains database-asset smoke only.
- Stable promotion requires evidence bound to tarball integrity, artifact tree digest, manifest hash, package version, host version, OS, and architecture.
- `ARCHITECTURE.md` changes only after the generated self-contained distribution exists and all repository gates pass.

## Not Yet Specified

None. This plan fixes the platform pair at `v0.1.6-rc.1`/`v0.1.6` and the six plugin versions in Task 4. Read-only preflight must prove each is unused; an occupied version requires a reviewed plan amendment rather than automatic selection.

## Out of Scope

- Declaring the portable core certified on all eight targets or calling this the formal platform 0.2.0 release.
- Native Windows Moe support, musl, future Node majors, or unaudited Codex hooks in other plugins.
- Deleting retained v3 databases or recovery capsules.

---

### Task 1: Add the Runtime and Native Platform Matrix

**Files:**
- Create: `.github/workflows/memory-runtime.yml`
- Create: `packages/memory/scripts/smoke-runtime.mjs`
- Create: `packages/memory/test/artifact/platform-smoke.test.ts`
- Modify: `packages/memory/package.json`
- Modify: `package.json`

**Interfaces:**
- Consumes: the `PackedArtifact` record emitted by `memory:artifact:test`, its exact Memory `.tgz`, native and embedding asset manifests, preseeded verified model fixture, version-2 database fixture, and locally verified recovery capsules bound to the same candidate.
- Produces: `pnpm memory:runtime:smoke --packed-artifact <record.json>` and matrix evidence for Node/OS/architecture combinations.

- [ ] **Step 1: Add a matrix-definition and extracted-artifact smoke test**

```ts
expect(readRuntimeMatrix()).toEqual({
  node: ["22.13.0", "22.23.2", "24.20.0"],
  native: ["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64"],
  databaseOnly: ["win32-x64"],
});
```

- [ ] **Step 2: Run the matrix test to verify it fails**

Run: `pnpm --filter @bubstack/moe-memory exec vitest run --project unit test/artifact/platform-smoke.test.ts`

Expected: FAIL because no release matrix workflow or smoke command exists.

- [ ] **Step 3: Implement tarball-only database/model/MCP probes**

Parse and validate the supplied `PackedArtifact` JSON, then use its `tarballPath`; never derive or predict npm's scoped-package filename. The four macOS/Linux runtime lanes extract that tarball, load their selected sqlite-vec asset, insert/query/reopen WAL data, enforce FK/rollback/blob semantics, initialize/list MCP, perform offline text search, and perform vector search with a preseeded verified model and local predecessor capsule. Inspect Mach-O/ELF floor metadata and execute load/KNN on real floor environments. The Windows x64 lane verifies only DLL selection, hash, SQLite load, and a KNN database probe; it never reports MCP, hook, migration, or rollback support. No lane uses workspace `dist` or `node_modules` at runtime.

- [ ] **Step 4: Run local and available matrix lanes**

Run: `pnpm memory:artifact:test --output-dir .artifacts --record .artifacts/moe-memory-packed.json && pnpm memory:runtime:smoke --packed-artifact .artifacts/moe-memory-packed.json`

Expected: PASS locally; protected CI must supply the four native lanes before release.

- [ ] **Step 5: Commit the runtime matrix**

```bash
git add .github/workflows/memory-runtime.yml packages/memory/scripts/smoke-runtime.mjs packages/memory/test/artifact/platform-smoke.test.ts packages/memory/package.json package.json
git commit -m "ci(memory): qualify runtime platform matrix"
```

### Task 2: Extend Release Records with Memory and Recovery Evidence

**Files:**
- Create: `packages/mint/schemas/memory-release-evidence.schema.json`
- Create: `packages/mint/src/release/memory-evidence.ts`
- Create: `packages/mint/test/release-memory-evidence.test.ts`
- Modify: `packages/mint/src/release/catalog.ts`
- Modify: `packages/mint/src/release/candidate.ts`
- Modify: `packages/mint/src/cli.ts`
- Modify: `packages/mint/test/release-catalog.test.ts`
- Modify: `packages/mint/test/release-candidate.test.ts`
- Modify: `packages/mint/test/cli.test.ts`

**Interfaces:**
- Consumes: foundation `PlatformCatalogV1`, `PackedArtifact`, target evidence records, runtime matrix results, and four serialized recovery-capsule manifest records; Mint never imports Memory runtime source.
- Produces: `MemoryReleaseEvidence`, `validateMemoryReleaseEvidence()`, and release-plan blocking diagnostics for incomplete Memory records.

- [ ] **Step 1: Add catalog subject and missing-evidence tests**

```ts
it("binds every recovery capsule to the candidate memory artifact", () => {
  const record = validateMemoryReleaseEvidence(candidateRecord, evidence);
  expect(record.memoryVersion).toBe("0.2.0");
  expect(record.recoveryCapsules.map((item) => item.target).sort()).toEqual(
    ["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64"],
  );
  expect(record.artifactIntegrity).toBe(candidateRecord.integrity);
});
```

- [ ] **Step 2: Run release-catalog tests to verify they fail**

Run: `pnpm --filter @bubstack/moe-mint exec vitest run test/release-catalog.test.ts test/release-candidate.test.ts test/release-memory-evidence.test.ts test/cli.test.ts`

Expected: FAIL because Memory-specific runtime/capsule evidence is not represented.

- [ ] **Step 3: Add optional package-specific evidence without forking the catalog**

Extend the Memory plugin record with versioned, hash-bound runtime-matrix and recovery-capsule evidence. The generic catalog remains authoritative for artifact identity and changed-package selection. Reject missing target, wrong platform, wrong memory/artifact version, duplicate target, mismatched hash, unsigned/unapproved report, or Node-lane omission.

- [ ] **Step 4: Run catalog, release-plan, and artifact tests**

Run: `pnpm --filter @bubstack/moe-mint test && pnpm memory:artifact:test`

Expected: PASS; plan mode blocks a candidate when any required Memory evidence is absent.

- [ ] **Step 5: Commit Memory release evidence integration**

```bash
git add packages/mint/schemas/memory-release-evidence.schema.json packages/mint/src/release/memory-evidence.ts packages/mint/src/release/catalog.ts packages/mint/src/release/candidate.ts packages/mint/src/cli.ts packages/mint/test/release-memory-evidence.test.ts packages/mint/test/release-catalog.test.ts packages/mint/test/release-candidate.test.ts packages/mint/test/cli.test.ts
git commit -m "feat(memory): bind recovery evidence to releases"
```

### Task 3: Build the Real-Host Qualification Workflow

**Files:**
- Create: `.github/workflows/memory-host-qualification.yml`
- Create: `packages/memory/test/manual/host-qualification.js`
- Create: `packages/memory/test/host-qualification-contract.test.ts`
- Modify: `packages/memory/test/manual/claude-e2e.js`
- Modify: `packages/memory/test/manual/codex-e2e.js`
- Modify: `packages/mint/test/manual/copilot-compatibility.js`

**Interfaces:**
- Consumes: exact candidate tarball/digest, pinned host compatibility manifests, protected authentication, predecessor install, and isolated host config/cache roots.
- Produces: committed protected workflow and schema that generate checksummed host evidence reports for Claude, Codex, Copilot, OpenCode, Pi, Cursor, Kimi, and Agent Plugins conformance at their declared support level.

- [ ] **Step 1: Add workflow-contract tests that reject workspace shortcuts**

```ts
it("installs only the uploaded candidate tarball", () => {
  const workflow = readHostQualificationWorkflow();
  expect(workflow).toContain("candidate_tarball");
  expect(workflow).not.toMatch(/packages\/memory.*npm publish/);
  expect(workflow).not.toContain("pnpm link");
});
```

- [ ] **Step 2: Run workflow and manual-script tests to verify they fail**

Run: `pnpm --filter @bubstack/moe-memory exec vitest run --project unit test/host-qualification-contract.test.ts test/claude-e2e-script.test.ts test/codex-e2e-script.test.ts`

Expected: FAIL because the protected tarball-only qualification workflow does not exist.

- [ ] **Step 3: Implement isolated install/update/uninstall and behavior probes**

Claude proves enable confirmation, one sync, one bootstrap, MCP initialize/recall, update from the previous version, and uninstall. Codex proves install, no pre-trust hook, one post-trust sync, no bootstrap, MCP initialize/recall, byte-change trust invalidation, update, and uninstall. Copilot reruns minimum/current custom-pointer behavior. Other target reports run their pinned loader/conformance paths and remain preview unless their full certification contract passes.

- [ ] **Step 4: Run offline script contracts and pinned parser compatibility**

Run: `pnpm --filter @bubstack/moe-memory test && pnpm --filter @bubstack/moe-mint test:host-compatibility`

Expected: PASS locally; Task 5 still blocks stable promotion until the committed protected workflow attaches authenticated reports to the exact candidate digest and source SHA.

- [ ] **Step 5: Commit the qualification workflow**

```bash
git add .github/workflows/memory-host-qualification.yml packages/memory/test/manual/host-qualification.js packages/memory/test/host-qualification-contract.test.ts packages/memory/test/manual/claude-e2e.js packages/memory/test/manual/codex-e2e.js packages/mint/test/manual/copilot-compatibility.js
git commit -m "ci(memory): qualify candidate host behavior"
```

### Task 4: Prepare the Versioned Candidate Workflow

**Files:**
- Modify: `.github/workflows/publish.yml`
- Modify: `packages/mint/test/release-workflows.test.ts`
- Modify: `packages/core/package.json`
- Modify: `packages/core/mint/moe.yaml`
- Modify: `packages/backstory/package.json`
- Modify: `packages/backstory/mint/moe-backstory.yaml`
- Modify: `packages/memory/package.json`
- Modify: `packages/memory/mint/moe-memory.yaml`
- Modify: `packages/glass/package.json`
- Modify: `packages/glass/mint/moe-glass.yaml`
- Modify: `packages/crew/package.json`
- Modify: `packages/crew/mint/moe-crew.yaml`
- Modify: `packages/statusline/package.json`
- Modify: `packages/statusline/mint/moe-statusline.yaml`
- Regenerate: `.claude-plugin/marketplace.json`
- Regenerate: `docs/moe/generated/plugin-catalog.md`
- Regenerate: `plugins/`

**Interfaces:**
- Consumes: foundation exact-byte candidate/promote workflow, Memory evidence validator, stable `v0.1.5` catalog, current registry versions, and the final generated artifact diff.
- Produces: release-ready `v0.1.6-rc.1`/`v0.1.6` workflow and source commit with Memory `0.2.0`, Core/Backstory/Glass/Crew `0.1.6`, and Statusline `0.1.2`.

- [ ] **Step 1: Add workflow tests for Memory gates and no-repack promotion**

```ts
expect(candidateSteps).toEqual(expect.arrayContaining([
  "memory:artifact:test", "memory:runtime:smoke", "memory release evidence verify",
]));
expect(stableSteps).not.toEqual(expect.arrayContaining(["build", "pack", "npm publish"]));
expect(releasePlan.versions).toEqual({
  moe: "0.1.6", "moe-backstory": "0.1.6", "moe-memory": "0.2.0",
  "moe-glass": "0.1.6", "moe-crew": "0.1.6", "moe-statusline": "0.1.2",
});
```

- [ ] **Step 2: Run release workflow tests to verify they fail**

Run: `pnpm --filter @bubstack/moe-mint exec vitest run test/release-workflows.test.ts`

Expected: FAIL until the publish workflow requires Memory runtime/recovery/host evidence and every topology-changed artifact has a new version.

- [ ] **Step 3: Wire evidence gates and version every changed artifact**

Run a read-only registry preflight and require all six proposed versions to be absent; if any is occupied, stop for a reviewed plan amendment rather than auto-incrementing. Write both source/Mint version authorities and regenerate only through `pnpm mint`. The topology changes affect all six artifacts: Memory takes its approved breaking-minor `0.2.0`; Core/Backstory/Glass/Crew take `0.1.6`; Statusline takes `0.1.2`. Candidate uploads the already-tested Memory tarball and four supported rollback capsules, verifies hashes, publishes changed `.tgz` files under `next`, checks npm integrity, and publishes the complete prerelease catalog only after every changed package succeeds. Stable downloads candidate assets, verifies offline, validates host evidence, moves exact versions to `latest`, and publishes the stable catalog without build/pack/publish. Partial retries consume draft assets and stop on any mismatch.

- [ ] **Step 4: Run the complete release-input gate**

Run before tagging: `pnpm check && pnpm mint:check && pnpm artifact:check && pnpm provenance && pnpm memory:artifact:test && pnpm memory:recovery:check`

Expected: PASS. Release plan mode selects exactly `v0.1.6-rc.1`/`v0.1.6`, the six versions above, the four Memory capsules, and the same source SHA.

- [ ] **Step 5: Commit the release-ready source state**

```bash
git add .github/workflows/publish.yml packages/mint/test/release-workflows.test.ts packages/core/package.json packages/core/mint/moe.yaml packages/backstory/package.json packages/backstory/mint/moe-backstory.yaml packages/memory/package.json packages/memory/mint/moe-memory.yaml packages/glass/package.json packages/glass/mint/moe-glass.yaml packages/crew/package.json packages/crew/mint/moe-crew.yaml packages/statusline/package.json packages/statusline/mint/moe-statusline.yaml .claude-plugin/marketplace.json docs/moe/generated/plugin-catalog.md plugins
git commit -m "ci(memory): prepare the qualified platform candidate"
```

### Task 5: Publish the Candidate and Promote the Same Bytes

**Files:**
- External outputs only: draft/prerelease and stable GitHub releases, six plugin `.tgz` files, checksums, four Memory recovery capsules, platform catalogs, and evidence reports

**Interfaces:**
- Consumes: Task 4 release-ready source SHA, protected npm/GitHub environments, and explicit operator approvals for candidate and stable mutation.
- Produces: all six planned versions under `next` then `latest`, complete `v0.1.6-rc.1`/`v0.1.6` catalogs, mirrored bytes, and no partial visible platform release.

- [ ] **Step 1: Re-run plan mode from the committed source SHA**

Run: `pnpm --filter @bubstack/moe-mint exec moe-mint release candidate --tag v0.1.6-rc.1 --repo .`

Expected: zero local mutation; the plan names the committed SHA, exact six versions/tarballs, four Memory capsules, and all required evidence gates.

- [ ] **Step 2: Obtain candidate-publication approval**

Present the exact tag, source SHA, package versions, tarball hashes, capsule hashes, and proposed external mutations. Do not create or push the tag until the operator explicitly approves this checkpoint.

- [ ] **Step 3: Publish and verify the candidate**

Create/push `v0.1.6-rc.1`, observe the protected workflow, and verify the finalized prerelease catalog. Candidate processing must reuse uploaded draft bytes on retry and may not rebuild or repack.

- [ ] **Step 4: Collect evidence and obtain stable-promotion approval**

Attach the runtime matrix and host evidence bound to candidate hashes. Run release verify/promote in plan mode and present its zero-build/zero-pack/zero-publish action plan before requesting separate operator approval for `v0.1.6` and `latest` mutations.

- [ ] **Step 5: Promote and verify the stable release**

Create/push `v0.1.6`, observe dist-tag-only promotion, then verify the stable catalog, npm integrity, GitHub mirror hashes, four capsules, and unchanged candidate artifact records. Never commit external release assets.

### Task 6: Update Architecture After Distribution Is True

**Files:**
- Modify: `ARCHITECTURE.md`
- Modify: `packages/memory/README.md`
- Modify: `packages/memory/CHANGELOG.md`
- Modify: `docs/moe/specs/2026-09-02-moe-memory-self-contained-plugin-design.md`
- Create: `packages/memory/test/documentation-contract.test.ts`

**Interfaces:**
- Consumes: stable artifact/catalog/evidence records and final repository state.
- Produces: accurate architecture, install/runtime guidance, changelog, and completed spec status.

- [ ] **Step 1: Add documentation assertions for the final source-of-truth statements**

```ts
expect(readArchitecture()).toContain("generated plugin tree is the canonical release payload");
expect(readArchitecture()).toContain("Memory artifacts are self-contained at runtime");
expect(readMemoryReadme()).toContain("Node 22.13");
expect(readMemoryReadme()).toContain("rollback prepare --to 0.1.5");
```

- [ ] **Step 2: Run documentation assertions before editing**

Run: `pnpm --filter @bubstack/moe-memory exec vitest run --project unit test/documentation-contract.test.ts`

Expected: FAIL on stale dependency-install and runtime descriptions.

- [ ] **Step 3: Replace only statements proven by the stable release**

Document generated-artifact identity, dependency-free runtime, Node/platform floors, lazy model behavior, Claude/Codex hook trust differences, 0.2 library API migration, recovery order, and remaining unsupported native Windows/musl/future-Node cases. Mark the design implemented only after the stable evidence exists.

- [ ] **Step 4: Run the complete post-release repository gate**

Run: `pnpm check && pnpm mint:check && pnpm artifact:check && pnpm provenance && pnpm memory:artifact:test`

Expected: PASS with clean generated output and documentation matching actual package behavior.

- [ ] **Step 5: Commit final verified documentation**

```bash
git add ARCHITECTURE.md packages/memory/README.md packages/memory/CHANGELOG.md docs/moe/specs/2026-09-02-moe-memory-self-contained-plugin-design.md packages/memory/test/documentation-contract.test.ts
git commit -m "docs(memory): record the self-contained release"
```
