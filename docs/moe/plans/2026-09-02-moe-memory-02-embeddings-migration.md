# Moe Memory Embeddings and Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace eager Transformers inference with a verified, lazy ORT-WASM pipeline and migrate both record families safely to embedding version 3 without sacrificing offline text recall.

**Architecture:** Raw transcript and journal text is committed first as version-0 pending state. A revision-scoped model cache feeds an injectable tokenizer/ORT backend, while one coordinator owns version predicates, recovery-capsule preflight, snapshots, batches, epochs, and readiness across exchange and journal tables.

**Tech Stack:** TypeScript, Node.js, `@huggingface/tokenizers` 0.1.3, `onnxruntime-web` 1.26.0-dev.20260416-b7804b056c, Vitest, SQLite vec0

**Spec:** `docs/moe/specs/2026-09-02-moe-memory-self-contained-plugin-design.md`

## Global Constraints

- Start from the HEAD produced by Plan 01; record that base SHA before dispatch, and require delegated findings to name the SHA they inspected.
- Preserve model `Xenova/bge-small-en-v1.5`, q8 inference, 384 dimensions, 2,000-character input truncation, 512-token right padding, query-only BGE prefix, masked mean pooling, and L2 normalization.
- `EMBEDDING_VERSION` becomes exactly `3`; old and new vectors are never queried together.
- The model remains a roughly 34.7 MB first-use download and is never included in the plugin tarball.
- The plugin includes `ort-wasm-simd-threaded.wasm` at 12,942,611 bytes with SHA-256 `f4f290847a4df02d0b93cdbf39b4b0e71acefbe80573e7e6b9342a7abd7b290a`.
- Missing model/network never prevents raw ingestion, MCP initialization, or text search.
- No version-3 vector write may occur until the exact 0.1.5 predecessor capsule for the running macOS/Linux target and the version-2 snapshot are verified.
- Migration covers conversations and journals under one readiness result. Vector-only search reports upgrading; combined search returns text results plus progress.
- Every task preserves MCP stdout for JSON-RPC by using stderr for progress.

## Not Yet Specified

None. Exact model-file hashes and the selected minimum cache revision are evidence produced by the manifest-verification task for the already-fixed model/variant contract.

## Out of Scope

- Claude/Codex summarizer processes and MCP transport order are Plan 03.
- Artifact composition and host manifests are later plans in this set.
- The user-facing rollback state machine is Plan 06; this plan creates only its required capsule/snapshot inputs.

---

### Task 1: Persist Searchable Text Before Enrichment

**Files:**
- Create: `packages/memory/src/enrichment.ts`
- Test: `packages/memory/test/offline-ingestion.test.ts`
- Modify: `packages/memory/src/db.ts`
- Modify: `packages/memory/src/indexer.ts`
- Modify: `packages/memory/src/sync.ts`
- Modify: `packages/memory/src/journal/store.ts`
- Modify: `packages/memory/src/journal/search.ts`
- Modify: `packages/memory/src/verify.ts`
- Modify: `packages/memory/test/sync.test.ts`
- Modify: `packages/memory/test/journal-store.test.ts`
- Modify: `packages/memory/test/journal-search.test.ts`
- Modify: `packages/memory/test/verify.test.ts`

**Interfaces:**
- Consumes: `MemoryDatabase`, `withTransaction()`, and writer/epoch primitives from Plan 01.
- Produces: `upsertPendingExchange()`, `upsertPendingJournalEntry()`, `searchJournalText()`, `pickPendingEnrichment()`, and `commitEnrichment(expectedEpoch, item)`.

- [ ] **Step 1: Write an offline transcript-and-journal ingestion test**

```ts
it("commits raw text when summaries and embeddings are unavailable", async () => {
  const runtime = makeIndexer({ summarize: rejectOffline, embed: rejectOffline });
  await runtime.ingest(transcriptFixture, journalFixture);
  expect(await runtime.searchText("atomic swap")).toEqual(
    expect.arrayContaining([expect.objectContaining({ embeddingVersion: 0 })]),
  );
  expect(await runtime.searchJournalText("atomic swap")).toEqual(
    expect.arrayContaining([expect.objectContaining({ embeddingVersion: 0 })]),
  );
  expect(runtime.modelAttempts).toBe(0);
});
```

- [ ] **Step 2: Run the offline test to verify it fails**

Run: `pnpm --filter @bubstack/moe-memory exec vitest run --project unit test/offline-ingestion.test.ts test/sync.test.ts test/journal-store.test.ts test/journal-search.test.ts`

Expected: FAIL because current indexing initializes embeddings before inserting either record type.

- [ ] **Step 3: Add pending writes and separate enrichment**

```ts
export interface PendingEnrichment {
  family: "exchange" | "journal";
  id: string;
  sourceText: string;
  epoch: number;
}

export function commitEnrichment(
  db: MemoryDatabase,
  expectedEpoch: number,
  item: PendingEnrichment,
  vector: Float32Array,
): void {
  withDatabaseWriter(db, expectedEpoch, () => {
    replaceVectorAndVersion(db, item.family, item.id, vector, EMBEDDING_VERSION);
  });
}
```

Make raw inserts transactionally write text/tool calls, stamp `embedding_version = 0`, and delete any stale vec row before scheduling summary/vector enrichment. Add a bound-parameter SQL `LIKE` journal path over `journal_entries.text`, preserving scope/timestamp filters and generating excerpts from the stored text; do not claim or add an FTS table. A failed enrichment remains discoverable through conversation and journal text queries and remains retryable.

- [ ] **Step 4: Run offline ingestion, sync, journal, and repair tests**

Run: `pnpm --filter @bubstack/moe-memory exec vitest run --project unit test/offline-ingestion.test.ts test/sync.test.ts test/journal-store.test.ts test/journal-search.test.ts test/verify.test.ts`

Expected: PASS; no model initializer runs during raw-only ingestion.

- [ ] **Step 5: Commit text-first persistence**

```bash
git add packages/memory/src/enrichment.ts packages/memory/src/db.ts packages/memory/src/indexer.ts packages/memory/src/sync.ts packages/memory/src/journal/store.ts packages/memory/src/journal/search.ts packages/memory/src/verify.ts packages/memory/test/offline-ingestion.test.ts packages/memory/test/sync.test.ts packages/memory/test/journal-store.test.ts packages/memory/test/journal-search.test.ts packages/memory/test/verify.test.ts
git commit -m "feat(memory): persist text before vector enrichment"
```

### Task 2: Own the Model Manifest, Cache, and Downloader

**Files:**
- Create: `packages/memory/runtime/model-manifest.json`
- Create: `packages/memory/src/model-manifest.ts`
- Create: `packages/memory/src/model-source.ts`
- Create: `packages/memory/src/model-cache.ts`
- Create: `packages/memory/test/fixtures/model-set/config.json`
- Create: `packages/memory/test/fixtures/model-set/tokenizer.json`
- Create: `packages/memory/test/fixtures/model-set/model_quantized.onnx`
- Test: `packages/memory/test/model-cache.test.ts`
- Modify: `packages/memory/src/paths.ts`
- Modify: `packages/memory/test/paths.test.ts`

**Interfaces:**
- Consumes: `getModelCacheDir()` and existing file-lock primitives.
- Produces: `ModelManifest`, injectable `ModelSource`, `ensureModelSet(manifest, source)`, `inspectModelCache(manifest)`, and `VerifiedModelSet`.

- [ ] **Step 1: Add cache integrity, concurrency, and legacy-adoption tests**

```ts
it("activates only a complete hash-verified revision", async () => {
  const source = new FixtureModelSource(validFiles);
  const [a, b] = await Promise.all([
    ensureModelSet(manifest, source),
    ensureModelSet(manifest, source),
  ]);
  expect(a.root).toBe(b.root);
  expect(source.downloadCount).toBe(manifest.files.length);
  expect(readFileSync(join(a.root, ".complete"), "utf8")).toContain(manifest.revision);
});
```

Cover HTTP failure, timeout, wrong length/hash, crash before completion marker, stale staging cleanup, warm offline hit, and copy/reflink legacy adoption that leaves the old cache byte-identical.

- [ ] **Step 2: Run the cache suite to verify it fails**

Run: `pnpm --filter @bubstack/moe-memory exec vitest run --project unit test/model-cache.test.ts test/paths.test.ts`

Expected: FAIL because the package currently delegates cache layout and download behavior to Transformers.

- [ ] **Step 3: Implement manifest validation and atomic activation**

```ts
export interface VerifiedModelSet {
  root: string;
  revision: string;
  variant: "q8";
  files: ReadonlyMap<string, { path: string; sha256: string; bytes: number }>;
}

export interface ModelSource {
  fetch(file: ModelFile, destination: string, signal: AbortSignal): Promise<void>;
}

export async function ensureModelSet(
  manifest: ModelManifest,
  source: ModelSource,
): Promise<VerifiedModelSet> {
  return withModelLock(manifest, () => stageVerifyAndActivate(manifest, source));
}
```

Namespace complete sets by model/revision/variant, verify a complete set before network access, stage in a sibling directory, write `.complete` last, and rename atomically. Pin URLs, revision, license, filenames, byte counts, and SHA-256 in the checked manifest.

- [ ] **Step 4: Run cache and path tests**

Run: `pnpm --filter @bubstack/moe-memory exec vitest run --project unit test/model-cache.test.ts test/paths.test.ts`

Expected: PASS with deterministic paths and zero network calls for a valid warm cache.

- [ ] **Step 5: Commit model ownership**

```bash
git add packages/memory/runtime/model-manifest.json packages/memory/src/model-manifest.ts packages/memory/src/model-source.ts packages/memory/src/model-cache.ts packages/memory/src/paths.ts packages/memory/test/model-cache.test.ts packages/memory/test/paths.test.ts packages/memory/test/fixtures/model-set
git commit -m "feat(memory): own verified model acquisition"
```

### Task 3: Implement the Direct Tokenizer and ORT-WASM Backend

**Files:**
- Create: `packages/memory/runtime/embedding-assets.json`
- Create: `packages/memory/runtime/ort-wasm-simd-threaded.wasm`
- Create: `packages/memory/src/tokenizer.ts`
- Create: `packages/memory/src/embedding-runtime.ts`
- Test: `packages/memory/test/embedding-wasm-contract.test.ts`
- Test: `packages/memory/test/model/embedding-equivalence.test.ts`
- Modify: `packages/memory/src/embeddings.ts`
- Modify: `packages/memory/test/embedding-init.test.ts`
- Modify: `packages/memory/test/query-prefix.test.ts`
- Modify: `packages/memory/package.json`
- Modify: `pnpm-workspace.yaml`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: `VerifiedModelSet` from Task 2.
- Produces: injectable `EmbeddingBackend.embed(text): Promise<Float32Array>` behind the existing `initEmbeddings`, `resetEmbeddings`, and `generate*Embedding` facade.

- [ ] **Step 1: Write tensor-shape, pooling, laziness, and equivalence tests**

```ts
it("creates normalized 384-value embeddings with int64 inputs", async () => {
  const backend = await createEmbeddingBackend(verifiedFixtureModel, packagedWasm);
  const vector = await backend.embed("release artifact");
  expect(vector).toHaveLength(384);
  expect(Math.hypot(...vector)).toBeCloseTo(1, 5);
  expect(backend.debugInputTypes()).toEqual(["int64", "int64", "int64"]);
});
```

The model project compares the direct backend with the pinned Transformers browser/WASM reference and records the approved equivalence envelope.

- [ ] **Step 2: Run the embedding tests to verify they fail**

Run: `pnpm --filter @bubstack/moe-memory exec vitest run --project unit test/embedding-wasm-contract.test.ts test/embedding-init.test.ts test/query-prefix.test.ts`

Expected: FAIL because the direct runtime and package-owned WASM do not exist.

- [ ] **Step 3: Implement tokenizer tensors, masked mean pooling, and lazy runtime setup**

```ts
export interface EmbeddingBackend {
  embed(text: string): Promise<Float32Array>;
  close(): Promise<void>;
}

export async function createEmbeddingBackend(
  model: VerifiedModelSet,
  wasm: VerifiedRuntimeAsset,
): Promise<EmbeddingBackend> {
  ort.env.wasm.proxy = false;
  ort.env.wasm.numThreads = 1;
  return createOrtBackend(await loadTokenizer(model), model, wasm);
}
```

Create `BigInt64Array` inputs, truncate source text to 2,000 characters, enforce tokenizer max length 512 with right padding, apply masked mean pooling and L2 normalization, and keep the BGE prefix query-only. Preserve memoized concurrent initialization, timeout, reset, and retry after failure. Declare `@huggingface/tokenizers` `0.1.3` and `onnxruntime-web` `1.26.0-dev.20260416-b7804b056c` as exact direct source dependencies, alongside exact `sqlite-vec` `0.1.9`; Plan 04's checked composition policy—not dependency reclassification—removes them from the generated artifact manifest.

- [ ] **Step 4: Run offline and live-model embedding gates**

Run: `pnpm --filter @bubstack/moe-memory test && pnpm --filter @bubstack/moe-memory test:model`

Expected: PASS; the equivalence test records approximately 0.995 cosine similarity and no output dimension changes.

- [ ] **Step 5: Commit the direct WASM backend and remove Transformers-only inputs**

```bash
git add packages/memory/runtime packages/memory/src/tokenizer.ts packages/memory/src/embedding-runtime.ts packages/memory/src/embeddings.ts packages/memory/test packages/memory/package.json pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "feat(memory): run embeddings through packaged wasm"
```

Remove `@huggingface/transformers` only in this commit, when its final import is gone. Remove stale `onnxruntime-node` and `sharp` build approvals here; retain the Claude SDK until Plan 03 removes its final import.

### Task 4: Build and Verify the 0.1.5 Predecessor Capsules

**Files:**
- Create: `packages/memory/src/recovery-capsule.ts`
- Create: `packages/memory/recovery/0.1.5/catalog.json`
- Create: `scripts/build-memory-recovery-capsule.mjs`
- Create: `scripts/verify-memory-recovery-capsule.mjs`
- Test: `packages/memory/test/recovery-capsule.test.ts`
- Test: `packages/memory/test/artifact/recovery-capsule-offline.test.ts`
- Modify: `package.json`
- Modify: `NOTICE`
- Modify: `scripts/check-provenance.mjs`

**Interfaces:**
- Consumes: the artifact-foundation packed-artifact and platform-catalog JSON contracts; published `@bubstack/moe-memory@0.1.5` plus its historical lock/install closure. Memory validates serialized records locally and never takes a runtime/project-reference dependency on Mint.
- Produces: `RecoveryCapsuleManifest`, `VerifiedRecoveryCapsule`, `ensureRecoveryCapsule({ fromVersion, platform, arch })`, and `pnpm memory:recovery:check`.

- [ ] **Step 1: Write manifest, tamper, platform, and offline-runtime tests**

```ts
it("runs the exact old runtime with registry access disabled", async () => {
  const capsule = verifyRecoveryCapsule(fixtureCapsule, { platform: "linux", arch: "x64" });
  const result = await runRecoveredMemory(capsule, ["--version"], { network: "disabled" });
  expect(result).toEqual({ status: 0, stdout: "0.1.5\n", stderr: "" });
});
```

- [ ] **Step 2: Run capsule tests to verify they fail**

Run: `pnpm --filter @bubstack/moe-memory exec vitest run --project unit test/recovery-capsule.test.ts test/artifact/recovery-capsule-offline.test.ts`

Expected: FAIL because no closed historical runtime or recovery catalog exists.

- [ ] **Step 3: Define the exact capsule schema and build four supported payloads**

```ts
export interface RecoveryCapsuleManifest {
  schema: 1;
  memoryVersion: "0.1.5";
  nodeRange: ">=24";
  target: string;
  packageTarball: IntegrityFile;
  installedFiles: readonly IntegrityFile[];
  dependencies: readonly { name: string; version: string; integrity: string }[];
  lifecyclePolicy: readonly { package: string; script: string; executed: boolean }[];
  legalFiles: readonly IntegrityFile[];
}
```

Capture exact dependency, peer, optional-native, lifecycle-script, platform, file, and legal closure for Darwin/Linux arm64/x64. Windows x64 remains a database-asset smoke target and receives no rollback capsule until native Windows quiescence is designed and qualified. Reject path escapes, unknown files, integrity drift, wrong platforms, empty legal inventory, and Node versions below 24. Store catalog metadata in git; publish large capsules as catalog-addressed release assets rather than committing them.

- [ ] **Step 4: Run capsule and provenance gates with empty caches**

Run: `pnpm memory:recovery:check && pnpm provenance`

Expected: PASS with registry and package-manager caches disabled during the recovered-runtime probe.

- [ ] **Step 5: Commit the recovery input contract**

```bash
git add packages/memory/src/recovery-capsule.ts packages/memory/recovery/0.1.5 scripts/build-memory-recovery-capsule.mjs scripts/verify-memory-recovery-capsule.mjs packages/memory/test/recovery-capsule.test.ts packages/memory/test/artifact/recovery-capsule-offline.test.ts package.json NOTICE scripts/check-provenance.mjs
git commit -m "feat(memory): preserve offline 0.1.5 recovery runtimes"
```

### Task 5: Coordinate Version-3 Migration Across Both Record Families

**Files:**
- Create: `packages/memory/src/database-snapshot.ts`
- Create: `packages/memory/src/vector-readiness.ts`
- Create: `packages/memory/src/embedding-coordinator.ts`
- Test: `packages/memory/test/database-snapshot.test.ts`
- Test: `packages/memory/test/vector-readiness.test.ts`
- Test: `packages/memory/test/migration-race.test.ts`
- Modify: `packages/memory/src/embedding-migration.ts`
- Modify: `packages/memory/src/search.ts`
- Modify: `packages/memory/src/journal/search.ts`
- Modify: `packages/memory/src/sync-cli.ts`
- Modify: `packages/memory/test/embedding-migration.test.ts`
- Modify: `packages/memory/test/journal-search.test.ts`

**Interfaces:**
- Consumes: leases/epochs from Plan 01, pending enrichment from Task 1, direct backend from Task 3, and verified capsules from Task 4.
- Produces: `VectorReadiness`, `EmbeddingCoordinator.ensureReady()`, version-predicated vector SQL, atomic version-2 snapshot/sidecar with canonical source inventory, and future-version rejection.

- [ ] **Step 1: Write combined-family readiness and race tests**

```ts
it("keeps vector search closed until exchanges and journals are current", async () => {
  const coordinator = makeCoordinator({ exchanges: 1, journals: 1 });
  expect(await coordinator.ensureReady()).toMatchObject({ state: "upgrading", remaining: 2 });
  await coordinator.runBatch(2);
  expect(await coordinator.ensureReady()).toEqual({
    state: "ready", total: 2, remaining: 0, fromVersion: 2, toVersion: 3,
  });
});
```

Add two processes racing first write, a pending insert between zero-count and query, partial resume, snapshot failure, missing capsule, future-version database, and journal-only stale corpus.

- [ ] **Step 2: Run migration tests to verify they fail**

Run: `pnpm --filter @bubstack/moe-memory exec vitest run --project unit test/database-snapshot.test.ts test/vector-readiness.test.ts test/migration-race.test.ts test/embedding-migration.test.ts test/journal-search.test.ts`

Expected: FAIL because the current migration handles exchanges only and has no readiness/snapshot contract.

- [ ] **Step 3: Implement snapshot preflight, batch migration, and query authorization**

```ts
export type VectorReadiness =
  | { state: "ready"; total: number; remaining: 0; fromVersion: 2; toVersion: 3 }
  | { state: "upgrading"; total: number; remaining: number; fromVersion: 2; toVersion: 3 }
  | { state: "blocked"; reason: string; total: number; remaining: number; fromVersion: 2; toVersion: 3 };

export interface EmbeddingCoordinator {
  ensureReady(): Promise<VectorReadiness>;
  runBatch(limit: number): Promise<VectorReadiness>;
}

export function createEmbeddingCoordinator(options: EmbeddingCoordinatorOptions): EmbeddingCoordinator;

export interface SnapshotSourceRecord {
  family: "transcript" | "journal";
  identity: string;
  canonicalPath: string;
  sha256: string;
}
```

Before the first v3 commit, verify the capsule, audit durable sources, take exclusive maintenance quiescence, run `VACUUM INTO` to a sibling file, hash it, and atomically write a sidecar containing database identity/schema/from/to/source-artifact integrity plus a sorted transcript/journal source inventory with canonical identity, contained path, and content SHA-256. Tests must reject missing, duplicate, escaping, and hash-mismatched inventory records. Set `EMBEDDING_VERSION` to 3 only in this task, after the capsule and snapshot preconditions exist. Compute embeddings outside the writer mutex, then reacquire it and revalidate epoch before writing. Query authorization holds the writer mutex across the final zero-pending check and vector query. Every vector SQL predicate requires version 3.

- [ ] **Step 4: Run migration and model integration gates**

Run: `pnpm --filter @bubstack/moe-memory test && pnpm --filter @bubstack/moe-memory test:model`

Expected: PASS; text queries remain available during blocked/upgrading states and no mixed-version KNN query executes.

- [ ] **Step 5: Commit the unified migration coordinator**

```bash
git add packages/memory/src/database-snapshot.ts packages/memory/src/vector-readiness.ts packages/memory/src/embedding-coordinator.ts packages/memory/src/embedding-migration.ts packages/memory/src/search.ts packages/memory/src/journal/search.ts packages/memory/src/sync-cli.ts packages/memory/test/database-snapshot.test.ts packages/memory/test/vector-readiness.test.ts packages/memory/test/migration-race.test.ts packages/memory/test/embedding-migration.test.ts packages/memory/test/journal-search.test.ts
git commit -m "feat(memory): coordinate version 3 vector migration"
```
