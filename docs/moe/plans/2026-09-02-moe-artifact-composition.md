# Moe Artifact Composition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compose source-authoritative npm manifests, stage every declared binary-safe payload, assemble all six plugins outside the canonical tree, and replace the plugin tree plus registry projections through an idempotent journaled transaction.

**Architecture:** Mint adapters contribute files and narrowly owned package metadata; they never replace `package.json`. A compositor combines the source manifest, package policy, adapter contributions, payload inventory, and legal outputs in fresh sibling paths. Only after all six trees and both registry projections pass Plan 2 structural validation does one durable journal replace the canonical outputs.

**Tech Stack:** Node.js 24 filesystem APIs, TypeScript, Zod, Vitest, npm package-manifest conventions, pnpm, Turbo

**Spec:** `docs/moe/specs/2026-09-02-moe-artifact-registry-foundation-design.md`

## Global Constraints

- Plan 1 (`2026-09-02-moe-platform-registry.md`) must be complete and green first.
- `packages/<pkg>/package.json` remains source runtime authority; package-local Mint YAML remains public metadata and artifact policy authority.
- `.moe-mint/manifest.json` remains only the adapter ownership ledger. Do not turn it into the complete artifact inventory; Plan 3 adds `.moe/artifact.json` separately.
- Never use `GeneratedFile.content: string` to copy runtime payloads. Payload staging must preserve arbitrary bytes and normalize executable modes deliberately.
- No adapter may emit `package.json`. Pi owns only `pi`; OpenCode owns only `exports["./server"]` after root-export normalization.
- No universal artifact contains `node_modules`, source tests, source maps that expose build paths, local caches, VCS/planning history, or package-local Mint input YAML.
- A failed assembly must leave the existing `plugins/` tree untouched. A failed or interrupted swap must leave a recoverable complete tree and durable journal.
- Contributor transaction support is macOS, Linux, and WSL2. Do not add a native-Windows contributor promise.

## Open Decisions

None. The approved design fixes manifest field ownership, export normalization, payload rules, generated-tree location, and recovery protocol.

## Not Yet Specified

- The complete `.moe/artifact.json` digest and pack/extract identity are Plan 3 contracts.
- Whether a runtime dependency remains external or is bundled is package-specific; Plan 2 preserves dependency declarations, while Plan 3 proves bundled legal closure.

## Out of Scope

- Release catalogs, npm publication, GitHub assets, dist-tags, or certification evidence.
- Native host installation, receipts, consumer rollback, and the common `moe` CLI.
- Cross-package architectural consolidation unrelated to artifact composition.

---

## File Structure

| Path | Responsibility |
| --- | --- |
| `packages/mint/src/package-manifest.ts` | Metadata normalization, export normalization, field-specific composition, and local-reference validation. |
| `packages/mint/src/adapters/types.ts` | `AdapterPackageContribution` on adapter emission. |
| `packages/mint/src/adapters/opencode.ts` | OpenCode `./server` contribution and adapter files. |
| `packages/mint/src/adapters/pi.ts` | Pi discovery contribution and adapter files. |
| `packages/mint/src/artifact/paths.ts` | Canonical artifact paths, collision keys, reserved destinations, and containment. |
| `packages/mint/src/artifact/payload.ts` | Binary-safe inspection and staging of declared payload roots. |
| `packages/mint/src/artifact/license-payload.ts` | Importable Plan 2 writer for generated root/third-party license payloads. |
| `packages/mint/src/artifact/assemble.ts` | Six-plugin staging and Plan 2 preflight validation. |
| `scripts/lib/mint-generation-transaction.mjs` | Build-independent durable journal, multi-output swap, and restart recovery. |
| `scripts/mint-recover.mjs` | Stdlib-only pre-build recovery entry point. |
| `scripts/mint-plugins.mjs` | Thin root wrapper: assemble, preflight, replace. |
| `.gitignore` | Exact nonce-bearing next/backup/journal generator state. |
| `packages/mint/test/package-manifest.test.ts` | Full version-1 field-policy and export cases. |
| `packages/mint/test/payload.test.ts` | Payload type, safety, collision, byte, and mode cases. |
| `packages/mint/test/assemble-artifact.test.ts` | One-plugin and six-plugin composition preflight. |
| `packages/mint/test/transaction.test.ts` | Operation ordering, failure cuts, adversarial journals, and idempotence. |

## Task 1: Convert Pi and OpenCode from replacement manifests to additive contributions

**Files:**

- Modify: `packages/mint/src/adapters/types.ts`
- Modify: `packages/mint/src/adapters/opencode.ts`
- Modify: `packages/mint/src/adapters/pi.ts`
- Modify: `packages/mint/src/bootstrap/node-package.ts`
- Modify: `packages/mint/src/generate.ts`
- Modify: `packages/mint/test/adapters/opencode.test.ts`
- Modify: `packages/mint/test/adapters/pi.test.ts`
- Create: `packages/mint/test/adapter-package-contributions.test.ts`

**Interfaces:**

- Consumes: adapter-emitted files and Plan 1 resolved targets/capabilities.
- Produces: `AdapterPackageContribution`; the new `packageContribution` field on Plan 1's `AdapterEmission`; conflict-detecting `mergePackageContributions()`.

- [ ] Replace the existing tests that require Pi and OpenCode to emit identical replacement `package.json` files with failing tests that prohibit any adapter-owned `package.json`.

```ts
const openCodeResult = opencode.emit(model);
expect(byPathMap(openCodeResult.files)["package.json"]).toBeUndefined();
expect(openCodeResult.packageContribution).toEqual({
  owner: "opencode",
  exports: { "./server": "./.opencode/plugins/moe.js" },
});
expect(pi.emit(model).packageContribution).toEqual({
  owner: "pi",
  pi: { extensions: ["./.pi/extensions/moe.ts"] },
});
```

- [ ] Run `pnpm --filter @bubstack/moe-mint exec vitest run test/adapters/opencode.test.ts test/adapters/pi.test.ts test/adapter-package-contributions.test.ts`; expect failure on the current replacement manifest.
- [ ] Add the narrow contribution type. Keep package-field contributions separate from `FileSet` merging.

```ts
export interface AdapterPackageContribution {
  owner: TargetId;
  pi?: Readonly<Record<string, unknown>>;
  exports?: Readonly<Record<string, unknown>>;
}

export interface AdapterEmission {
  files: FileSet;
  limitations: readonly EmissionLimitation[];
  emittedCapabilities: readonly CapabilityId[];
  projectionOwner?: TargetId;
  packageContribution?: AdapterPackageContribution;
}
```

- [ ] Make `node-package.ts` return only the Pi/OpenCode local paths and metadata fragments; delete `nodePackageManifest()`.
- [ ] Implement `mergePackageContributions()` as a field-owner reducer: Pi and OpenCode may each write only their approved namespace; a duplicate unequal key or any unclassified field raises `PACKAGE_MANIFEST_COLLISION` with both owners.
- [ ] Keep `generate()` responsible for adapter files and the narrow ownership ledger. It returns collected contributions to the compositor rather than serializing a root manifest.
- [ ] Run the focused tests and all adapter tests; expect pass.
- [ ] Commit:

```sh
git add packages/mint/src/adapters/types.ts packages/mint/src/adapters/opencode.ts packages/mint/src/adapters/pi.ts packages/mint/src/bootstrap/node-package.ts packages/mint/src/generate.ts packages/mint/test/adapters/opencode.test.ts packages/mint/test/adapters/pi.test.ts packages/mint/test/adapter-package-contributions.test.ts
git commit -m "refactor(mint): make package metadata additive"
```

## Task 2: Implement metadata and export normalization

**Files:**

- Create: `packages/mint/src/package-manifest.ts`
- Create: `packages/mint/test/package-manifest.test.ts`
- Create fixture directory: `packages/mint/test/fixtures/manifests/`

**Interfaces:**

- Consumes: raw source `package.json`; normalized Mint metadata; adapter package contributions.
- Produces: `normalizeMetadata()`, `normalizeExports()`, `mergeAdapterPackageContributions()` and structured collision diagnostics.

- [ ] Write failing table tests for every approved comparison rule: exact trimmed npm name/version/SPDX, description CRLF-to-LF plus Unicode NFC, object-form author with lowercased comparison email, repository `git+`/`.git`/trailing-slash normalization, homepage URL normalization, and case-sensitive keyword-set comparison with Mint order retained.
- [ ] Add failing export tests for absent exports plus main/types, string root exports, root condition objects, existing subpath maps, mixed condition/subpath rejection, preserved unrelated subpaths, and unequal `./server` collision.

```ts
expect(normalizeExports({ main: "./dist/index.js", types: "./dist/index.d.ts" })).toEqual({
  ".": { types: "./dist/index.d.ts", default: "./dist/index.js" },
});

try {
  normalizeExports({ exports: { import: "./esm.js", "./feature": "./feature.js" } });
  expect.unreachable("mixed exports shape must fail");
} catch (error) {
  expect(error).toMatchObject({
    diagnostic: { code: "PACKAGE_EXPORTS_MIXED_SHAPE" },
  });
}
```

- [ ] Run the focused test; expect module-not-found/failing cases.
- [ ] Implement pure normalization functions. Do not collapse prose whitespace, rewrite descriptions, lowercase keywords, or follow URLs over the network.
- [ ] Normalize the root export before applying OpenCode's `./server`; preserve source-owned `.` and all unrelated subpaths. A source-owned equal `./server` is accepted; an unequal one fails.
- [ ] Return a typed normalized manifest intermediate rather than mutating raw objects. Reject arrays or scalar/object shapes that the field policy does not admit.
- [ ] Run `pnpm --filter @bubstack/moe-mint exec vitest run test/package-manifest.test.ts`; expect pass.
- [ ] Commit:

```sh
git add packages/mint/src/package-manifest.ts packages/mint/test/package-manifest.test.ts packages/mint/test/fixtures/manifests
git commit -m "feat(mint): normalize package manifest authorities"
```

## Task 3: Compose the complete version-1 runtime package manifest

**Files:**

- Modify: `packages/mint/src/package-manifest.ts`
- Modify: `packages/mint/test/package-manifest.test.ts`
- Create: `packages/mint/test/package-manifest-loader.test.ts`
- Create fixture: `packages/mint/test/fixtures/package-consumer/`

**Interfaces:**

- Consumes: `MintConfig`; source manifest; adapter contributions; staged artifact path set; platform npm policy.
- Produces: `composePackageManifest(input)` and `validateManifestReferences(manifest, artifactPaths)`.

- [ ] Add a failing table that exhausts the version-1 field policy. It must prove preservation of `type`, `main`, `exports`, `imports`, `types`, `bin`, `engines`, `os`, `cpu`, `sideEffects`, and the four runtime dependency objects; omission of scripts/dev/private/workspace fields; rejection of both bundled-dependency spellings and every unknown source field.

```ts
export interface ComposePackageManifestInput {
  source: Readonly<Record<string, unknown>>;
  config: MintConfig;
  contributions: readonly AdapterPackageContribution[];
  artifactPaths: ReadonlySet<string>;
  registryUrl: string;
}
```

- [ ] Add negative reference cases for missing/escaping `main`, `types`, bin, local exports/imports, Pi paths, and OpenCode server paths. Package targets beginning with a bare package name are dependencies, not local file references.
- [ ] Run the two focused test files; expect failures.
- [ ] Implement the explicit allow/omit/reject switch. Never use generic object spread or deep merge on the raw source manifest.
- [ ] Emit Mint-normalized descriptive metadata, `distribution.npm` as `name`, sorted exhaustive `files`, and `{access: "public", registry: <platform-origin>}` as `publishConfig`. Omit all lifecycle scripts.
- [ ] Generate `files` from the staged path set plus the reserved final output `.moe/artifact.json`, including every dot-directory; handle mandatory `package.json` separately and do not create `.npmignore`. Reference validation may treat only that reserved manifest as pending until Plan 3 writes it.
- [ ] Build a clean consumer fixture and prove both `import("@bubstack/<package>")` and `import("@bubstack/<package>/server")` resolve while CLI bins and Pi metadata coexist. Use only the pinned offline OpenCode/Pi contract fixtures recorded by Plan 1; do not query upstream HEAD.
- [ ] Run focused tests and Mint typecheck; expect pass.
- [ ] Commit:

```sh
git add packages/mint/src/package-manifest.ts packages/mint/test/package-manifest.test.ts packages/mint/test/package-manifest-loader.test.ts packages/mint/test/fixtures/package-consumer
git commit -m "feat(mint): compose runtime package manifests"
```

## Task 4: Stage declared payloads with binary, path, and mode safety

**Files:**

- Create: `packages/mint/src/artifact/paths.ts`
- Create: `packages/mint/src/artifact/payload.ts`
- Create: `packages/mint/test/payload.test.ts`
- Create fixture: `packages/mint/test/fixtures/payloads/`

**Interfaces:**

- Consumes: source package root; `ArtifactPayload[]`; fresh artifact root.
- Produces: `ArtifactPath`; `StagedPayload`; `inspectPayloads()`; `stagePayloads()`.

- [ ] Write failing tests using UTF-8 text, non-UTF-8 bytes, a POSIX executable, empty directory, missing optional root, and missing required root. Assert byte equality and normalized `0644`/`0755` modes after staging.
- [ ] Add negative fixtures for absolute paths, `..`, globs, reserved outputs (`package.json`, `.moe`, `.moe-mint`, legal payloads), symlinks, hard links where detectable, FIFO/socket/device where supported, duplicate destinations, case-fold collisions, and Unicode NFC collisions.

```ts
export interface StagedPayload {
  source: string;
  destination: string;
  files: readonly ArtifactPath[];
  omitted: boolean;
}

const staged = await stagePayloads(source, artifact, [
  { from: "dist", to: "dist", required: true },
  { from: "vendor", to: "vendor", required: false },
]);
expect(staged[1]).toMatchObject({ destination: "vendor", omitted: true });
```

- [ ] Run `pnpm --filter @bubstack/moe-mint exec vitest run test/payload.test.ts`; expect failure because the staging API does not exist.
- [ ] Implement raw-byte copying with `lstat`/open-file checks and no-follow semantics. Walk deterministically by raw UTF-8 byte order; reject unsupported types before copying any file from a payload root.
- [ ] Use a shared artifact collision key of NFC-normalized path plus locale-independent Unicode case fold. Reject either collision even on a case-sensitive contributor filesystem.
- [ ] Reserve compositor-owned outputs centrally so package payloads and adapter files cannot claim them. Keep optional omissions as typed results for Plan 3 evidence.
- [ ] Run the focused test twice and byte-compare the fixture outputs; expect pass.
- [ ] Commit:

```sh
git add packages/mint/src/artifact/paths.ts packages/mint/src/artifact/payload.ts packages/mint/test/payload.test.ts packages/mint/test/fixtures/payloads
git commit -m "feat(mint): stage declared artifact payloads"
```

## Task 5: Assemble and preflight all six artifacts in one sibling tree

**Files:**

- Create: `packages/mint/src/artifact/assemble.ts`
- Create: `packages/mint/src/artifact/license-payload.ts`
- Create: `packages/mint/test/assemble-artifact.test.ts`
- Create: `packages/mint/test/license-payload.test.ts`
- Create fixture: `packages/mint/test/fixtures/composed-plugin/`
- Modify: `packages/mint/src/generate.ts`
- Modify: `packages/mint/src/cli.ts`
- Modify: `scripts/mint-plugins.mjs`
- Modify: `packages/core/mint/moe.yaml`
- Modify: `packages/backstory/mint/moe-backstory.yaml`
- Modify: `packages/memory/mint/moe-memory.yaml`
- Modify: `packages/glass/mint/moe-glass.yaml`
- Modify: `packages/crew/mint/moe-crew.yaml`
- Modify: `packages/statusline/mint/moe-statusline.yaml`

**Interfaces:**

- Consumes: `ResolvedPlatform`; declared components/payloads; built runtime output; adapter emissions; source manifests; root `NOTICE`/licenses.
- Produces: `renderLicensePayload()`, `writeLicensePayload()`, `assembleArtifact()`, `assembleArtifactSet()`, `AssembledArtifact[]`; validated projection inputs; a validated sibling `plugins.next-<nonce>` tree.

```ts
export interface AssembledArtifact {
  plugin: ResolvedPlugin;
  root: string;
  emissions: Readonly<Record<TargetId, AdapterEmission>>;
  omittedOptionalPayloads: readonly string[];
  projection: PluginProjectionRecord;
}
```

- [ ] Add a failing one-plugin fixture that combines component content, binary/runtime payloads, adapters, legal payload, and final package composition. Add a six-plugin orchestration test whose sixth plugin fails and assert the current canonical tree is unchanged.

```ts
export async function assembleArtifactSet(input: {
  repoRoot: string;
  platform: ResolvedPlatform;
  destinationRoot: string;
}): Promise<readonly AssembledArtifact[]>;
```

- [ ] Run `pnpm --filter @bubstack/moe-mint exec vitest run test/assemble-artifact.test.ts`; expect failure.
- [ ] Move private `readAttributions()`/`writePluginLicense()` behavior out of `scripts/mint-plugins.mjs` into `artifact/license-payload.ts`. Add focused golden tests for root MIT/Apache terms, declared imported-work notices, deterministic order, missing NOTICE work, and a package with no imported works.
- [ ] Implement this exact per-plugin order: create fresh root; stage declared components; stage runtime payloads; emit adapter files/ownership ledger; call `writeLicensePayload()`; enumerate the resulting regular-file paths plus reserved pending `.moe/artifact.json`; compose root `package.json`; validate source-manifest references through `validateManifestReferences()` plus the existing adapter/component validators. The exhaustive `files` allowlist must therefore include every generated legal file.
- [ ] Return each plugin's resolved identity and exact validated adapter emissions in `AssembledArtifact.projection`. Render all three Plan 1 projections from the current `AssembledArtifact[]`; never reread canonical `plugins/` or substitute expected capabilities for emitted capabilities.
- [ ] Keep Plan 2's legal check deliberately narrow: required generated license files and referenced adapter/component paths must exist. Plan 3 introduces bundled/staged import provenance, complete reference scanning, and full legal reconciliation; Plan 2 must not import those future modules.
- [ ] Reject source maps, tests, source-only files, package-local Mint config, planning/VCS paths, undeclared files, and any adapter limitation not already validated against Plan 1 target intent. No validation step may mutate the tree it is validating.
- [ ] Replace the hard-coded staging/copy registry in `scripts/mint-plugins.mjs` with a thin call into compiled Mint. Keep it non-destructive: it may remove only a nonce-bearing staging tree that it created in the current run.
- [ ] Reconcile the six real payload declarations with actual build outputs. Do not weaken a required payload when a package build is missing; make the root mint task depend on the necessary builds.
- [ ] Run the focused test, `pnpm build`, and a Mint dry-run into a temporary destination. Assert all six complete before any canonical rename.
- [ ] Commit source/config changes but do not yet replace committed `plugins/`; Task 7 performs the first transaction-backed regeneration.

```sh
git add packages/mint/src/artifact/assemble.ts packages/mint/src/artifact/license-payload.ts packages/mint/src/generate.ts packages/mint/src/cli.ts packages/mint/test/assemble-artifact.test.ts packages/mint/test/license-payload.test.ts packages/mint/test/fixtures/composed-plugin scripts/mint-plugins.mjs packages/core/mint packages/backstory/mint packages/memory/mint packages/glass/mint packages/crew/mint packages/statusline/mint
git commit -m "feat(mint): assemble complete plugin trees"
```

## Task 6: Implement the durable multi-output journal and exhaustive recovery

**Files:**

- Create: `scripts/lib/mint-generation-transaction.mjs`
- Create: `scripts/mint-recover.mjs`
- Create: `packages/mint/test/transaction.test.ts`
- Create fixture: `packages/mint/test/fixtures/transactions/`
- Modify: `.gitignore`

**Interfaces:**

- Consumes: validated current/next/backup paths for `plugins/`, `.claude-plugin/marketplace.json`, and `docs/moe/generated/plugin-catalog.md`, plus their one repository journal.
- Produces: `writeDurableFile()`, `replaceGeneratedOutputs()`, `recoverGeneratedOutputs()`, injected `SwapFs` fault boundary usable before Mint has been built.

- [ ] Write the operation-order test before production filesystem code. Its fake records temp write, file fsync, journal rename, parent fsync, then for each of the three targets: current-to-backup rename, parent fsync, next-to-current rename, and parent fsync; after all targets commit it records backup removal, journal removal, and final parent syncs.

```ts
export interface SwapTarget {
  kind: "directory" | "file";
  current: string;
  next: string;
  backup: string;
}

export interface GenerationSwapJournal {
  schema: 1;
  transactionId: string;
  targets: readonly SwapTarget[];
}

export interface SwapFs {
  writeDurableFile(path: string, bytes: Uint8Array): Promise<void>;
  readFile(path: string): Promise<Uint8Array>;
  pathState(path: string): Promise<"missing" | "file" | "directory" | "symlink" | "other">;
  rename(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>;
  fsyncDirectory(path: string): Promise<void>;
}

export async function replaceGeneratedOutputs(
  journal: GenerationSwapJournal,
  fs: SwapFs = nodeSwapFs,
): Promise<void>;
```

- [ ] Table-drive injected failure immediately after journal durability, each target's backup/current rename, each rename's directory fsync, backup removal, cleanup fsync, and attempted restoration. Restart through recovery and require one coherent old or new three-output generation, no partial plugin tree, and idempotent second recovery.
- [ ] Add fail-closed tests for malformed schema/JSON, missing or reused path, absolute/traversing/outside-parent path, wrong nonce, symlinked parent/target, inconsistent tree state, missing next/backup, stale completed transaction, and forced restore rename/fsync failure.
- [ ] Run `pnpm --filter @bubstack/moe-mint exec vitest run test/transaction.test.ts`; expect failure before implementation.
- [ ] Implement the production transaction as build-independent ESM using only Node stdlib so `scripts/mint-recover.mjs` works in a clean checkout before Turbo or compiled Mint exists. Durable journal writing uses a temporary sibling file, file `fsync`, rename, then parent-directory `fsync` before the first output rename. Sync each output parent after every rename/removal transition.
- [ ] Derive recovery from the validated journal plus actual filesystem state. Recovery chooses all-old or all-new across the plugin tree and both projections, never a mixed generation. Invalid state touches nothing. Failed restoration preserves the journal and every surviving output and reports exact paths/action.
- [ ] Add exact nonce-bearing generator state to `.gitignore`; do not ignore broad sibling directory patterns unrelated to Mint.
- [ ] Run the transaction test repeatedly (`--retry=3` if supported, otherwise three explicit runs); expect deterministic pass.
- [ ] Commit:

```sh
git add scripts/lib/mint-generation-transaction.mjs scripts/mint-recover.mjs packages/mint/test/transaction.test.ts packages/mint/test/fixtures/transactions .gitignore
git commit -m "feat(mint): add recoverable generation swap"
```

## Task 7: Route `pnpm mint` through recover, assemble, validate, and replace

**Files:**

- Modify: `scripts/mint-plugins.mjs`
- Modify: `scripts/mint-recover.mjs`
- Modify: `scripts/lib/mint-generation-transaction.mjs`
- Modify: `packages/mint/src/cli.ts`
- Modify: `packages/mint/test/cli.test.ts`
- Modify: `packages/mint/test/dogfood.test.ts`
- Modify: `package.json`
- Modify: `turbo.json`
- Regenerate: `.claude-plugin/marketplace.json`
- Regenerate: `docs/moe/generated/plugin-catalog.md`
- Regenerate directory: `plugins/`

**Interfaces:**

- Consumes: Plan 1 registry/config/projections; Plan 2 compositor and transaction; all six package build outputs.
- Produces: transaction-backed `pnpm mint`; byte-reproducible coherent plugin/marketplace/catalog generation; stdlib startup recovery before Turbo build or new assembly.

- [ ] Add a failing CLI integration test that seeds each recoverable journal state, invokes the same entry point as `pnpm mint`, and asserts recovery happens before build/staging. Add a second test that forces plugin six to fail and byte-compares the old canonical tree.
- [ ] Run `pnpm --filter @bubstack/moe-mint exec vitest run test/cli.test.ts test/dogfood.test.ts test/assemble-artifact.test.ts test/transaction.test.ts`; expect the root wrapper to fail the new contract.
- [ ] Make root `mint` and `mint:check` execute `node scripts/mint-recover.mjs` before entering Turbo. Recovery must succeed from a clean checkout even when `packages/mint/dist` is absent or stale; an invalid/unrecoverable journal fails before build or assembly.
- [ ] Make the generation wrapper execute: validate host contract; resolve platform; assemble all six to a same-filesystem nonce sibling; render both projections from the returned `AssembledArtifact.projection` records to nonce siblings beside their canonical files; run all Plan 2 preflight/drift checks; durably replace all three outputs under one journal.
- [ ] Expand Turbo Mint dependencies/inputs to include every required package build, source package manifest, package Mint file, component/payload input, root registry, generation code, and projection output. Plan 3 adds bundle/legal/manifest-specific inputs.
- [ ] Regenerate `plugins/` only through `pnpm mint`. Inspect the diff for complete runtime/package content and ensure `.moe-mint/manifest.json` still contains only adapter-owned files.
- [ ] Run the Plan 2 exit gate:

```sh
pnpm build
pnpm --filter @bubstack/moe-mint typecheck
pnpm --filter @bubstack/moe-mint test
pnpm mint
pnpm mint:check
pnpm check
```

Expected: all commands exit 0; a second Mint run is byte-identical; no journal/next/backup path remains; plugins and both projections are from one generation; generated plugin roots contain composed source-authoritative manifests and declared payloads.

- [ ] Commit:

```sh
git add scripts/mint-plugins.mjs scripts/mint-recover.mjs scripts/lib/mint-generation-transaction.mjs packages/mint/src/cli.ts packages/mint/test/cli.test.ts packages/mint/test/dogfood.test.ts package.json turbo.json plugins .claude-plugin/marketplace.json docs/moe/generated/plugin-catalog.md
git commit -m "feat(mint): transact complete artifact generation"
```

## Plan 2 Completion Evidence

- No adapter emits or replaces `package.json`.
- Source runtime fields and dependencies coexist with Pi/OpenCode additions.
- Declared payloads are binary-safe, mode-safe, contained, collision-checked, and exhaustive.
- All six artifacts preflight before the first canonical tree rename.
- Every tested crash transition recovers one complete tree or fails closed with recoverable state intact.
- `pnpm mint`, `pnpm mint:check`, and `pnpm check` pass.
