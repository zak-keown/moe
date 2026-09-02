# Moe Artifact Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every generated plugin a complete content-addressed manifest, reconcile bundled code with the canonical legal register, and prove that npm packs and extracts exactly the artifact Mint validated.

**Architecture:** A complete-artifact scanner remains separate from Mint's adapter ownership ledger. It inventories raw bytes and normalized modes, computes the canonical tree digest, and validates the tree bidirectionally. The same Mint-owned APIs drive local checks and later release preparation. Bundler metafiles provide redistribution evidence, while `NOTICE` and typed `imported_works` remain the only legal authorities.

**Tech Stack:** Node.js 24, TypeScript, SHA-256/SHA-512, npm pack, tar extraction, esbuild/tsup metafiles, Zod, Vitest, pnpm, Turbo

**Spec:** `docs/moe/specs/2026-09-02-moe-artifact-registry-foundation-design.md`

## Global Constraints

- Plans 1 and 2 must be complete and green first.
- Keep `.moe-mint/manifest.json` as the narrow adapter ownership ledger. Add `.moe/artifact.json` as a separate complete-tree contract.
- `.moe/artifact.json` excludes only itself from its `files` rows. The tarball and generated `files` allowlist still contain it.
- Hash raw bytes, never decoded text. Sort paths by raw UTF-8 bytes and serialize tree rows exactly as `path NUL mode NUL decimal-size NUL lowercase-sha256 LF`.
- Only modes `0644` and `0755` are valid after normalization. Reject symlinks, hard links, devices, sockets, FIFOs, path escapes, case-fold collisions, and Unicode-normalization collisions.
- `NOTICE` remains the canonical legal register. A bundled third-party package must also appear in the affected package's typed `imported_works` and contribute applicable license terms.
- The lockfile is build provenance, not evidence of legal closure. An external npm dependency that is not bundled is not copied into the artifact and does not automatically add license text.
- Tests may run `npm pack` and extract local tarballs. They must never publish, mutate npm dist-tags, or contact GitHub/npm registries.
- Pack/extract success is artifact evidence, not host runtime certification.

## Open Decisions

None. The approved design fixes manifest contents and digest encoding, legal authorities, pack/extract equivalence, and the six-plugin gate.

## Not Yet Specified

- Host lifecycle certification and authenticated Claude evidence are Plan 4.
- Automatic transitive SBOM generation and license inference remain outside this foundation slice.

## Out of Scope

- Publishing packages or release assets.
- Certifying Cursor, Codex, Kimi, OpenCode, Pi, Agent Plugins, Copilot, or any OS merely because projections or tarballs validate.
- Bundling every external runtime dependency into universal artifacts.

---

## File Structure

| Path | Responsibility |
| --- | --- |
| `packages/mint/src/artifact/artifact-manifest.ts` | Complete tree scan, canonical rows/digest, write, and bidirectional validation. |
| `packages/mint/src/artifact/references.ts` | Validate runtime, adapter, component, bootstrap, and discovery references against the inventory. |
| `packages/mint/src/artifact/bundle-inventory.ts` | Parse bundler metafiles and resolve third-party package identity/version/source/output. |
| `packages/mint/src/artifact/staged-imports.ts` | Map imported works to exact staged artifact roots declared in package Mint policy. |
| `packages/mint/src/artifact/legal.ts` | Parse `NOTICE` and reconcile bundle inventory, imported works, and generated legal payloads. |
| `packages/mint/src/artifact/pack.ts` | Pack once, compute integrity, extract, compare, and run safe packed probes. |
| `packages/mint/src/artifact/check.ts` | Six-plugin local artifact gate and CLI result. |
| `packages/mint/src/artifact/assemble.ts` | Write/validate `.moe/artifact.json` after composition and legal closure. |
| `scripts/check-provenance.mjs` | Thin compatibility wrapper over shared legal reconciliation. |
| `scripts/check-artifacts.mjs` | Thin compiled-Mint wrapper for `pnpm artifact:check`. |
| Glass build script plus Crew/Statusline `tsup.config.ts` | Deterministic bundler metafile production. |
| `packages/mint/fixtures/universal-artifact/` | Complete synthetic artifact with all component and metadata forms. |
| Mint artifact test files named in Tasks 1–7 | Scanner, manifest, references, pack, and six-plugin checks. |
| `packages/mint/test/bundle-inventory.test.ts` | Bundler-evidence resolution cases. |
| `packages/mint/test/legal-reconciliation.test.ts` | Legal-closure positive/negative cases. |

## Task 1: Implement the complete artifact scanner and canonical tree digest

**Files:**

- Create: `packages/mint/src/artifact/artifact-manifest.ts`
- Create: `packages/mint/test/artifact-manifest.test.ts`
- Create fixtures: `packages/mint/test/fixtures/artifact-manifest/`

**Interfaces:**

- Consumes: a composed artifact root containing regular files but no complete manifest yet.
- Produces: `ArtifactEntry`, `ArtifactManifestV1`, `scanArtifact()`, `serializeTreeRow()`, `computeTreeDigest()`.

- [ ] Write failing scanner tests for text/binary bytes, raw UTF-8 path sorting, `0644`/`0755` modes, `.moe/artifact.json` self-exclusion, and lowercase SHA-256.
- [ ] Add hand-verifiable digest vectors and prove that path, content, size, and mode independently change the digest.

```ts
export interface ArtifactEntry {
  path: string;
  size: number;
  sha256: string;
  mode: "0644" | "0755";
}

export function serializeTreeRow(entry: ArtifactEntry): Uint8Array {
  return Buffer.from(
    `${entry.path}\0${entry.mode}\0${entry.size}\0${entry.sha256}\n`,
    "utf8",
  );
}
```

- [ ] Add rejection cases for an absolute/traversing logical path, symlink, hard link where detectable, device/socket/FIFO where supported, mode outside the normalized pair, case-fold collision, and NFC collision.
- [ ] Run `pnpm --filter @bubstack/moe-mint exec vitest run test/artifact-manifest.test.ts`; expect failure because the scanner does not exist.
- [ ] Implement a no-follow deterministic walk. Check identity/link count before hashing; normalize or reject mode before manifest creation, never during verification.
- [ ] Sort with `Buffer.compare(Buffer.from(a.path), Buffer.from(b.path))`; do not use locale collation.
- [ ] Compute `tree_sha256` by incrementally hashing exact serialized row bytes in sorted order.
- [ ] Run the focused test twice; expect identical vectors and pass.
- [ ] Commit:

```sh
git add packages/mint/src/artifact/artifact-manifest.ts packages/mint/test/artifact-manifest.test.ts packages/mint/test/fixtures/artifact-manifest
git commit -m "feat(mint): inventory complete artifact trees"
```

## Task 2: Write and verify `.moe/artifact.json` bidirectionally

**Files:**

- Modify: `packages/mint/src/artifact/artifact-manifest.ts`
- Modify: `packages/mint/src/artifact/assemble.ts`
- Create: `packages/mint/src/artifact/references.ts`
- Modify: `packages/mint/test/artifact-manifest.test.ts`
- Create: `packages/mint/test/artifact-references.test.ts`

**Interfaces:**

- Consumes: resolved plugin identity; target emissions; payload omissions; complete staged tree.
- Produces: `ExpectedArtifactContext`, `writeArtifactManifest()`, `readArtifactManifest()`, `validateArtifact(root, expected)`, `validateArtifactReferences()`.

- [ ] Add a failing round-trip test for the exact external schema, including plugin ID/npm name/version, complete file rows, `tree_sha256`, sorted target emissions, and explicit optional-payload omissions.

```ts
export interface ArtifactManifestV1 {
  schema: 1;
  plugin: { id: string; package: string; version: string };
  files: readonly ArtifactEntry[];
  tree_sha256: string;
  targets: Readonly<Record<string, {
    emitted_capabilities: readonly CapabilityId[];
  }>>;
  omitted_optional_payloads?: readonly string[];
}

export interface ExpectedArtifactContext {
  plugin: { id: string; package: string; version: string };
  targets: Readonly<Record<TargetId, {
    emitted_capabilities: readonly CapabilityId[];
  }>>;
  omitted_optional_payloads: readonly string[];
}
```

- [ ] Add mutation tests: missing listed file, unlisted extra file, changed bytes, changed size, changed mode, wrong tree digest, duplicate/reordered row, wrong subject, and forged target capability. Call `validateArtifact(root, expected)` with independently resolved registry identity/emissions; validation must compare scan and manifest in both directions and compare the manifest subject, target keys, capabilities, and omissions against `expected`.
- [ ] Add reference tests for `main`, `types`, bins, local exports/imports, Pi, OpenCode, skills, commands, agents, hooks, prompts, MCP, bootstrap, and every generated harness manifest. Each local path must be contained and present in manifest rows.
- [ ] Run the two focused tests; expect failure.
- [ ] Implement strict Zod parsing with unknown-field rejection and deterministic two-space JSON plus newline. Do not allow JSON row order to redefine canonical path order.
- [ ] Call manifest writing only after package composition/legal output. Thread the resolved `ExpectedArtifactContext` from `assembleArtifact()` into both the writer and `validateArtifact(root, expected)`; then re-open and validate before Plan 2 marks an artifact assembled or swaps any tree.
- [ ] Run focused tests, assembly tests, and transaction tests; expect pass and no change to `.moe-mint/manifest.json` semantics.
- [ ] Commit:

```sh
git add packages/mint/src/artifact/artifact-manifest.ts packages/mint/src/artifact/assemble.ts packages/mint/src/artifact/references.ts packages/mint/test/artifact-manifest.test.ts packages/mint/test/artifact-references.test.ts
git commit -m "feat(mint): validate complete artifact manifests"
```

## Task 3: Produce deterministic bundle inventories for runtime-bearing packages

**Files:**

- Create: `packages/mint/src/artifact/bundle-inventory.ts`
- Create: `packages/mint/test/bundle-inventory.test.ts`
- Create fixtures: `packages/mint/test/fixtures/bundle-metafiles/`
- Modify: `packages/glass/package.json`
- Modify: `packages/crew/package.json`
- Modify: `packages/statusline/package.json`
- Modify: `packages/crew/tsup.config.ts`
- Modify: `packages/statusline/tsup.config.ts`
- Create: `scripts/write-bundle-inventory.mjs`
- Modify: `turbo.json`
- Modify: `.gitignore`

**Interfaces:**

- Consumes: deterministic esbuild/tsup metafiles and nearest package manifests.
- Produces: `BundleInput`, `BundledPackage`, `readBundleMetafiles()`, `resolveBundledPackages()` and sorted per-package bundle inventory evidence.

- [ ] Add failing golden tests for esbuild and tsup metafile shapes, nested package manifests, duplicate inputs, multiple outputs, external packages, source-owned inputs, unresolved package roots, and conflicting versions for one package identity.

```ts
export interface BundleInput {
  output: string;
  input: string;
  packageName: string;
  packageVersion: string;
  packageManifest: string;
}

export interface BundledPackage {
  name: string;
  version: string;
  package_manifest: string;
  inputs: readonly string[];
  outputs: readonly string[];
}
```

- [ ] Run `pnpm --filter @bubstack/moe-mint exec vitest run test/bundle-inventory.test.ts`; expect failure.
- [ ] Make Glass's esbuild invocation persist a metafile. Configure Crew and Statusline tsup builds to preserve deterministic metafile data for every output. Normalize repository-relative paths and omit timestamps/absolute machine paths.
- [ ] Resolve each bundled third-party input by walking to the nearest package manifest and reading exact name/version. Exclude package source and declared externals; fail when a third-party input cannot be identified.
- [ ] Sort inventory by package name, version, output, and input using raw UTF-8 byte order. Do not use the lockfile as an identity substitute.
- [ ] Add metafiles/inventory to build outputs and Mint cache inputs. Verify Memory remains an external-dependency package unless its build actually reports bundled inputs.
- [ ] Write ignored derived evidence under `packages/<pkg>/.moe-build/`, outside every declared artifact payload root. Add that exact directory name to `.gitignore`; the compositor must also reserve/reject `.moe-build` as a destination. Never commit it. `artifact:check` consumes it, and Plan 4 copies the verified canonical inventory into external release evidence.
- [ ] Run builds for Glass, Crew, and Statusline twice and byte-compare inventory output; expect pass.
- [ ] Confirm `git status --short -- packages/glass/.moe-build packages/crew/.moe-build packages/statusline/.moe-build` is empty after both builds; derived evidence remains ignored and cannot enter artifacts.

```sh
git add packages/mint/src/artifact/bundle-inventory.ts packages/mint/test/bundle-inventory.test.ts packages/mint/test/fixtures/bundle-metafiles packages/glass/package.json packages/crew/package.json packages/statusline/package.json packages/crew/tsup.config.ts packages/statusline/tsup.config.ts scripts/write-bundle-inventory.mjs turbo.json .gitignore
git commit -m "feat(mint): record bundled runtime inputs"
```

## Task 4: Reconcile bundled inputs with `NOTICE`, imported works, and license payloads

**Files:**

- Create: `packages/mint/src/artifact/legal.ts`
- Create: `packages/mint/src/artifact/staged-imports.ts`
- Modify: `packages/mint/src/artifact/assemble.ts`
- Create: `packages/mint/test/legal-reconciliation.test.ts`
- Create: `packages/mint/test/staged-imports.test.ts`
- Modify: `packages/mint/test/assemble-artifact.test.ts`
- Modify: `packages/mint/test/transaction.test.ts`
- Create fixtures: `packages/mint/test/fixtures/legal/`
- Modify: `scripts/check-provenance.mjs`
- Modify: `NOTICE`
- Modify: `packages/glass/mint/moe-glass.yaml`
- Modify: `packages/core/mint/moe.yaml`
- Modify: `packages/backstory/mint/moe-backstory.yaml`
- Modify: `packages/memory/mint/moe-memory.yaml`
- Modify: `packages/crew/mint/moe-crew.yaml`
- Modify: `packages/statusline/mint/moe-statusline.yaml`
- Modify: `packages/mint/src/config.ts`
- Modify: `packages/mint/test/config.test.ts`

**Interfaces:**

- Consumes: bundle inventories; typed `imported_works` with exact staged roots; component/payload staging results; canonical `NOTICE`; artifact license payloads.
- Produces: `StagedImportRecord[]`, `parseNotice()`, `reconcileLegalClosure()`, stable `LegalDiagnostic[]`; assembly-blocking legal preflight; shared provenance command behavior.

- [ ] Extend `ImportedWorkRef` with optional `artifact_roots`, each a normalized literal file or directory root (no glob). Add failing staged-import tests for an imported root not staged, staged imported root not declared, overlapping work claims, path collision/escape, and staged third-party content with no legal identity. Map Core/Backstory imported content and Statusline's `vendor/ccstatusline` explicitly; a package-wide name without roots does not prove staged closure.

```ts
export interface ImportedWorkRef {
  name: string;
  artifactRoots: readonly string[];
}

export interface StagedImportRecord {
  work: string;
  artifactPath: string;
  sourceKind: "component" | "payload" | "bundle";
}

export interface NoticeWork {
  name: string;
  revision: string;
  license: string;
  copyrightNotice: string;
}

export interface NoticeRegister {
  works: ReadonlyMap<string, NoticeWork>;
}
```

- [ ] Add failing cases for bundle/staged row missing from `NOTICE`, row missing from package `imported_works`, missing applicable license file, name/version/license conflict, duplicate identity, and declared imported work not represented by staged content or bundle evidence.

```ts
const diagnostics = reconcileLegalClosure({
  bundledPackages,
  stagedImports,
  importedWorks: config.importedWorks,
  notice: parseNotice(noticeText),
  artifactLicenses,
});
expect(diagnostics).toEqual([]);
```

- [ ] Run `pnpm --filter @bubstack/moe-mint exec vitest run test/staged-imports.test.ts test/legal-reconciliation.test.ts`; expect failure.
- [ ] Extract current NOTICE/license parsing into the shared TypeScript module. Keep `scripts/check-provenance.mjs` as a thin CLI wrapper so `pnpm provenance` and assembly call the same reconciliation logic.
- [ ] Wire `reconcileLegalClosure()` into `assembleArtifact()` after legal payload generation and before `writeArtifactManifest()`. Any diagnostic blocks the entire staged generation before manifest writing or transaction swap. Add assembly and transaction tests proving a sixth-plugin legal failure leaves all canonical outputs unchanged.
- [ ] Generate the actual inventories, inspect every bundled third-party package and staged import, and update `NOTICE`, all six typed `imported_works` root maps, and legal payload terms together. Glass, Core/Backstory imported skills, and Statusline's vendored `ccstatusline` are mandatory; do not assume a dependency list or package-wide declaration proves closure.
- [ ] Keep npm dependencies that are not bundled out of tarball legal closure. Reject inference from package name alone; compare name/version/source/output evidence.
- [ ] Run focused, assembly, and transaction tests plus `pnpm provenance`; expect pass with stable diagnostic codes.
- [ ] Commit only proven legal changes. Cite the affected work names and inventory evidence in the commit body, never a stale line number.

```sh
git add packages/mint/src/artifact/legal.ts packages/mint/src/artifact/staged-imports.ts packages/mint/src/artifact/assemble.ts packages/mint/test/legal-reconciliation.test.ts packages/mint/test/staged-imports.test.ts packages/mint/test/assemble-artifact.test.ts packages/mint/test/transaction.test.ts packages/mint/test/fixtures/legal scripts/check-provenance.mjs NOTICE packages/mint/src/config.ts packages/mint/test/config.test.ts packages/core/mint/moe.yaml packages/backstory/mint/moe-backstory.yaml packages/memory/mint/moe-memory.yaml packages/glass/mint/moe-glass.yaml packages/crew/mint/moe-crew.yaml packages/statusline/mint/moe-statusline.yaml
git commit -m "feat(mint): enforce bundled-code legal closure"
```

## Task 5: Build the universal artifact determinism fixture

**Files:**

- Create: `packages/mint/fixtures/universal-artifact/package.json`
- Create: `packages/mint/fixtures/universal-artifact/moe-mint.yaml`
- Create fixture directory: `packages/mint/fixtures/universal-artifact/runtime/`
- Create fixture directory: `packages/mint/fixtures/universal-artifact/types/`
- Create: `packages/mint/fixtures/universal-artifact/bin/moe-fixture`
- Create fixture directory: `packages/mint/fixtures/universal-artifact/skills/`
- Create fixture directory: `packages/mint/fixtures/universal-artifact/commands/`
- Create fixture directory: `packages/mint/fixtures/universal-artifact/prompts/`
- Create fixture directory: `packages/mint/fixtures/universal-artifact/agents/`
- Create fixture directory: `packages/mint/fixtures/universal-artifact/hooks/`
- Create fixture directory: `packages/mint/fixtures/universal-artifact/mcp/`
- Create fixture directory: `packages/mint/fixtures/universal-artifact/bootstrap/`
- Create fixture directory: `packages/mint/fixtures/universal-artifact/legal/`
- Create: `packages/mint/test/universal-artifact.test.ts`

**Interfaces:**

- Consumes: Plans 1–3 registry/config, adapter, compositor, manifest, bundle, and legal APIs.
- Produces: one all-features fixture proving deterministic universal composition and tamper rejection.

- [ ] Create a failing integration test that assembles the fixture twice in independent temporary roots and byte-compares every file plus `tree_sha256`.
- [ ] Give the fixture JavaScript runtime, declarations, POSIX executable, runtime/optional dependencies, MCP, skills, commands, prompts, agents, hooks, bootstrap, all eight targets, root exports, OpenCode `./server`, Pi metadata, and mixed MIT/Apache imported/bundled evidence.
- [ ] Add tamper cases for bytes, modes, added/removed files, symlink, traversal, case/Unicode collision, package-field collision, stale legal metadata, and changed adapter capability.
- [ ] Run `pnpm --filter @bubstack/moe-mint exec vitest run test/universal-artifact.test.ts`; expect failure until the fixture and all assembly paths are complete.
- [ ] Implement no special-case production code for the fixture. Fix the general compositor/validator whenever it reveals a gap.
- [ ] Run the test twice and compare its diagnostic snapshots; expect pass and stable codes/context.
- [ ] Commit:

```sh
git add packages/mint/fixtures/universal-artifact packages/mint/test/universal-artifact.test.ts
git commit -m "test(mint): add universal artifact fixture"
```

## Task 6: Pack once, extract cleanly, and compare npm's real file set

**Files:**

- Create: `packages/mint/src/artifact/pack.ts`
- Create: `packages/mint/test/pack-artifact.test.ts`
- Create fixtures: `packages/mint/test/fixtures/npm-pack/`

**Interfaces:**

- Consumes: one validated generated artifact; its independently resolved `ExpectedArtifactContext`; a fresh output directory.
- Produces: `PackedArtifact`; `packArtifactOnce()`; `verifyPackedArtifact()`; npm SHA-512 integrity and byte size.

- [ ] Add a failing pack/extract test around the universal fixture. Assert one invocation of `npm pack`, disabled lifecycle scripts, parsed JSON output, exact `.tgz` path, SHA-512 integrity, byte size, and a clean extraction under npm's `package/` prefix.

```ts
export interface PackedArtifact {
  tarballPath: string;
  filename: string;
  bytes: number;
  sha256: string;
  integrity: `sha512-${string}`;
}

export async function packArtifactOnce(
  artifactRoot: string,
  outputDir: string,
  expected: ExpectedArtifactContext,
): Promise<PackedArtifact>;

export async function verifyPackedArtifact(
  tarballPath: string,
  expected: ExpectedArtifactContext,
): Promise<PackedArtifact>;
```

- [ ] Add inclusion/exclusion cases proving hidden adapter dirs and `.moe/artifact.json` survive, while source/tests/maps/config/planning/VCS material do not. Assert executable mode survives extraction.
- [ ] Run `pnpm --filter @bubstack/moe-mint exec vitest run test/pack-artifact.test.ts`; expect failure.
- [ ] Spawn `npm pack --ignore-scripts --json --pack-destination <fresh-dir>` with argv arrays and no shell. Accept exactly one JSON record and exactly one new tarball. Require both pack and standalone verification callers to supply the resolved expected subject/emissions; never derive expected identity or capabilities from the tarball being checked.
- [ ] Extract into a new directory, call `validateArtifact(extractedRoot, expected)` with the caller-supplied registry/emission context, and compare extraction rows with the source artifact while accounting only for npm's `package/` prefix and archive metadata normalization.
- [ ] Import the package root and `/server` from the extraction, inspect Pi metadata, and invoke only explicitly safe fixture bins/entry points. Never run source package scripts.
- [ ] Run the focused test; expect pass with no network calls.
- [ ] Commit:

```sh
git add packages/mint/src/artifact/pack.ts packages/mint/test/pack-artifact.test.ts packages/mint/test/fixtures/npm-pack
git commit -m "feat(mint): verify packed artifact identity"
```

## Task 7: Add the six-plugin `artifact:check` and repair provenance's red proof

**Files:**

- Create: `packages/mint/src/artifact/check.ts`
- Create: `packages/mint/test/artifact-check.test.ts`
- Create: `scripts/check-artifacts.mjs`
- Create: `scripts/test-provenance-red.mjs`
- Modify: `scripts/check-provenance.mjs`
- Modify: `package.json`
- Modify: `turbo.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `packages/mint/package.json`
- Regenerate directory: `plugins/`

**Interfaces:**

- Consumes: all six generated artifacts, complete manifests, pack/extract API, bundle inventories, legal closure, package-specific safe probes.
- Produces: `checkArtifactSet()`; `pnpm artifact:check`; a real failing provenance fixture assertion.

- [ ] Add a failing table-driven real-plugin test asserting scoped identity/version, local entry points, bins/modes, dependency/exports preservation, referenced harness files, target presence/omission, bootstrap/discovery paths, excluded source-only content, legal closure, manifest equality, and tarball integrity for all six registry records. For every row, resolve `ExpectedArtifactContext` from the live registry and current adapter emissions and pass it through source-tree and extracted-tree validation.
- [ ] Add the root command as a thin wrapper over compiled Mint. It builds/mints first only through declared task dependencies; the check itself validates current committed artifacts and packs them into temporary directories.
- [ ] Replace the CI red-fixture shell choreography with a Node self-test that captures nonzero status and checks the expected structured diagnostic.

```ts
const result = spawnSync(process.execPath, [
  "scripts/check-provenance.mjs", "--json", "scripts/fixtures/provenance-red",
], { encoding: "utf8" });
assert.equal(result.status, 1);
assert(JSON.parse(result.stdout).diagnostics.some(
  (item: { code: string }) => item.code === "LEGAL_PAYLOAD_MISSING",
));
```

- [ ] Run the new test first; expect failure on the missing command/current weak CI proof.
- [ ] Add `artifact:check` to root scripts and CI. Expand Turbo inputs/outputs for root registry, lockfile, `NOTICE`, licenses, source manifests, build config/output, bundle metafiles, package Mint files, adapters, generation scripts, and generated trees.
- [ ] Regenerate all six artifacts through `pnpm mint`; inspect `.moe/artifact.json`, composed manifests, legal payloads, bundle inventories, and exclusion rules.
- [ ] Run the Plan 3 exit gate:

```sh
pnpm build
pnpm mint
pnpm mint:check
pnpm artifact:check
pnpm provenance
pnpm check
```

Expected: every command exits 0; all six actual npm tarballs match their generated artifact inventories and integrity records; the provenance red self-test passes only because tampering is rejected for `LEGAL_PAYLOAD_MISSING`.

- [ ] Commit:

```sh
git add packages/mint/src/artifact/check.ts packages/mint/test/artifact-check.test.ts scripts/check-artifacts.mjs scripts/test-provenance-red.mjs scripts/check-provenance.mjs package.json packages/mint/package.json turbo.json .github/workflows/ci.yml plugins
git commit -m "test(mint): gate all packed public artifacts"
```

## Plan 3 Completion Evidence

- Every generated tree has a validated complete `.moe/artifact.json` and unchanged narrow `.moe-mint/manifest.json`.
- Tree digests use exact canonical row bytes and reject content, mode, path, and inventory drift.
- Bundled inputs reconcile to `NOTICE`, typed imported works, and legal payloads; Glass is explicitly covered.
- The universal fixture is byte-identical across independent assemblies and rejects all required tampering.
- All six real artifacts survive actual npm pack/extract with exact inventory, entrypoint, mode, and integrity checks.
- `pnpm artifact:check`, `pnpm provenance`, `pnpm mint:check`, and `pnpm check` pass.
