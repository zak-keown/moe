# Moe Memory Storage and Native Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `better-sqlite3` with Node's built-in SQLite and a verified package-owned `sqlite-vec` runtime while preserving the version-2 database contract.

**Architecture:** `db.ts` continues to be the internal store boundary, but it returns `node:sqlite` `DatabaseSync` connections configured by a native-asset resolver. Package-owned transaction and lease helpers replace dependency-specific convenience APIs and establish the maintenance-quiescence contract used by later migration and rollback plans.

**Tech Stack:** TypeScript 5.9, Node `node:sqlite`, sqlite-vec 0.1.9, Vitest, pnpm 11.23.0

**Spec:** `docs/moe/specs/2026-09-02-moe-memory-self-contained-plugin-design.md`

## Global Constraints

- Start from the HEAD produced by the prerequisite plan set; record that base SHA before dispatch, and require delegated findings to name the SHA they inspected.
- Published Node range is exactly `>=22.13.0 <23 || >=24 <25`; the repository toolchain remains Node 24.
- Preserve the existing SQLite schema, WAL mode, foreign keys, `busy_timeout = 5000`, 384-dimensional float blobs, database paths, and search semantics.
- Supported native floors are macOS 13.5 and Linux kernel 4.18 with glibc 2.28, each on arm64 and x64. The Windows x64 DLL is a database smoke-test asset, not a native-Windows support claim.
- Native extensions resolve only beneath the real installed plugin root injected by a public entrypoint, must match the checked manifest, and are disabled immediately after loading. A shared split chunk must never derive the package root from its own `import.meta.url`.
- Normal build and Mint runs stage committed canonical native bytes; only the pinned macOS refresh workflow may rebuild Darwin assets.
- Source belongs under `packages/`; never hand-edit `plugins/`.
- Every task must keep `pnpm --filter @bubstack/moe-memory test`, typecheck, and build green before commit.

## Not Yet Specified

None. Output hashes from the pinned Darwin rebuild are implementation evidence, not an architectural choice; the refresh command records the bytes it actually verifies.

## Out of Scope

- Embedding inference and version-3 migration are Plan 02.
- MCP startup, summarizer processes, and bundling are Plan 03.
- Generated artifact staging and publication are Plans 04–07.

---

### Task 1: Narrow the Public Library Contract for the 0.2 Line

**Files:**
- Modify: `packages/memory/src/index.ts`
- Modify: `packages/memory/package.json`
- Create: `packages/memory/docs/MIGRATING-0.2.md`
- Create: `packages/memory/docs/API-DIFF-0.1.5-to-0.2.0.md`
- Create: `packages/memory/scripts/check-public-api.mjs`
- Create: `packages/memory/test/fixtures/public-api-0.1.5.json`
- Create: `packages/memory/test/fixtures/public-consumer/package.json`
- Create: `packages/memory/test/fixtures/public-consumer/tsconfig.json`
- Create: `packages/memory/test/fixtures/public-consumer/index.ts`
- Test: `packages/memory/test/public-api.test.ts`

**Interfaces:**
- Consumes: package-owned DTOs and high-level operations already defined in `types.ts`, `parser.ts`, `search.ts`, and journal modules.
- Produces: the supported future-0.2 `@bubstack/moe-memory` root export with no raw database types, an explicit root export map, generated API diff against the verified 0.1.5 predecessor, and a migration guide.

- [ ] **Step 1: Add API snapshot and clean-consumer tests**

```ts
it("does not export raw sqlite handles", async () => {
  const api = await import("../src/index.js");
  expect(Object.keys(api)).not.toContain("initDatabase");
  expect(Object.keys(api)).not.toContain("migrateSchema");
});

it("typechecks the retained package-owned API", () => {
  expect(runPublicConsumerTypecheck()).toEqual({ status: 0, stderr: "" });
});

it("accounts for every 0.1.5 export", () => {
  expect(comparePublicApi(verified015Snapshot, currentExports)).toEqual({
    unclassified: [],
    retained: expect.any(Array),
    removed: expect.any(Array),
  });
});
```

- [ ] **Step 2: Run the public API tests to verify they fail**

Run: `pnpm --filter @bubstack/moe-memory exec vitest run --project unit test/public-api.test.ts`

Expected: FAIL because `index.ts` still exports raw database handles.

- [ ] **Step 3: Define retained exports and document removals**

```ts
export * from "./constants.js";
export * from "./parser.js";
export * from "./paths.js";
export * from "./search.js";
export * from "./types.js";
```

Verify the baseline snapshot against the exact published 0.1.5 tarball and registry integrity, then fail if any old export is unclassified. Remove raw database handles, `JournalStore`/`indexJournal`, and every `better-sqlite3`-typed helper from the barrel; journal write/index operations remain available through the CLI and MCP instead of the library root. Add explicit `exports["."]` import/types targets, generate `API-DIFF-0.1.5-to-0.2.0.md`, and record each removed symbol plus its high-level replacement in `MIGRATING-0.2.md`. Keep OpenCode ownership out of `main`; Plan 05 composes that adapter path.

- [ ] **Step 4: Run the complete package gate**

Run: `pnpm --filter @bubstack/moe-memory test && pnpm --filter @bubstack/moe-memory typecheck && pnpm --filter @bubstack/moe-memory build && node packages/memory/scripts/check-public-api.mjs --check`

Expected: PASS; emitted declarations contain no `better-sqlite3` reference and the clean consumer can use every retained public symbol. Plan 04 owns the coordinated version change.

- [ ] **Step 5: Commit the 0.2 public API**

```bash
git add packages/memory/src/index.ts packages/memory/package.json packages/memory/docs/MIGRATING-0.2.md packages/memory/docs/API-DIFF-0.1.5-to-0.2.0.md packages/memory/scripts/check-public-api.mjs packages/memory/test/fixtures/public-api-0.1.5.json packages/memory/test/fixtures/public-consumer packages/memory/test/public-api.test.ts
git commit -m "feat(memory): define the 0.2 public API"
```

### Task 2: Pin and Resolve Native sqlite-vec Assets

**Files:**
- Create: `.github/workflows/memory-native-refresh.yml`
- Create: `packages/memory/src/installed-package-root.ts`
- Create: `packages/memory/src/native-assets.ts`
- Create: `packages/memory/scripts/refresh-sqlite-vec.mjs`
- Create: `packages/memory/vendor/sqlite-vec/manifest.json`
- Create: `packages/memory/vendor/sqlite-vec/darwin-arm64/vec0.dylib`
- Create: `packages/memory/vendor/sqlite-vec/darwin-x64/vec0.dylib`
- Create: `packages/memory/vendor/sqlite-vec/linux-arm64/vec0.so`
- Create: `packages/memory/vendor/sqlite-vec/linux-x64/vec0.so`
- Create: `packages/memory/vendor/sqlite-vec/win32-x64/vec0.dll`
- Test: `packages/memory/test/native-assets.test.ts`
- Test: `packages/memory/test/installed-package-root.test.ts`
- Modify: `packages/memory/package.json`
- Modify: `package.json`
- Modify: `pnpm-workspace.yaml`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: each public runtime entrypoint's URL; `getMemoryDataDir()` only for diagnostics. Native resolution never uses writable state or a split chunk's location.
- Produces: opaque `InstalledPackageRoot`, `resolveInstalledPackageRoot(entrypointUrl)`, `NativeAssetRecord`, `ResolvedNativeAsset`, `loadNativeAssetManifest(root)`, `resolveNativeAsset(root, platform, arch)`, and `verifyNativeAsset(root, record)`; root `pnpm memory:native:refresh [--check]`.

- [ ] **Step 1: Write failing manifest and containment tests**

```ts
it("selects exactly one verified asset and rejects an escape", () => {
  const fixture = makePackageShapedNativeFixture({ "linux-x64": Buffer.from("vec") });
  const root = resolveInstalledPackageRoot(pathToFileURL(fixture.distIndex));
  const asset = resolveNativeAsset(root, "linux", "x64");
  expect(asset.record.target).toBe("linux-x64");
  expect(() => verifyNativeAsset(root, { ...asset.record, path: "../vec0.so" })).toThrow(/escape/);
});

it.each(["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64", "win32-x64"])(
  "accounts for %s once",
  (target) => expect(loadNativeAssetManifest(installedFixtureRoot).targets[target]).toBeDefined(),
);

it("resolves the package root from either public entrypoint, not a shared chunk", () => {
  expect(resolveInstalledPackageRoot(distCliUrl)).toEqual(packageRoot);
  expect(resolveInstalledPackageRoot(distIndexUrl)).toEqual(packageRoot);
  expect(() => resolveInstalledPackageRoot(distChunkUrl)).toThrow(/entrypoint/);
});
```

- [ ] **Step 2: Run the native-asset tests to verify they fail**

Run: `pnpm --filter @bubstack/moe-memory exec vitest run --project unit test/installed-package-root.test.ts test/native-assets.test.ts`

Expected: FAIL because `src/native-assets.ts` and the package-owned native manifest do not exist.

- [ ] **Step 3: Implement the typed manifest, canonical inputs, and refresh command**

```ts
export interface NativeAssetRecord {
  target: "darwin-arm64" | "darwin-x64" | "linux-arm64" | "linux-x64" | "win32-x64";
  path: string;
  bytes: number;
  sha256: string;
  minimumPlatform: string;
  source: { package?: string; integrity?: string; revision?: string };
}

export interface ResolvedNativeAsset {
  record: NativeAssetRecord;
  absolutePath: string;
}

export function resolveNativeAsset(
  root: InstalledPackageRoot,
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): ResolvedNativeAsset {
  const target = `${platform}-${arch}`;
  const record = loadNativeAssetManifest(root).targets[target];
  if (!record) throw new Error(`unsupported sqlite-vec target: ${target}`);
  const absolutePath = verifyNativeAsset(root, record);
  return { record, absolutePath };
}
```

Pin sqlite-vec 0.1.9 and all five platform packages in the lockfile, then commit the canonical bytes for every target under `vendor/sqlite-vec/`. The separate pinned macOS refresh workflow must verify the source archive, Xcode build, SDK hash, compiler identity, `MACOSX_DEPLOYMENT_TARGET=13.5`, flags, Mach-O minimum version, output size, and SHA-256 before replacing either committed Darwin file. `--check` rebuilds into a temporary directory and byte-compares without writing tracked files; ordinary build and Mint jobs never rebuild native code.

- [ ] **Step 4: Run asset and package gates**

Run: `pnpm --filter @bubstack/moe-memory exec vitest run --project unit test/installed-package-root.test.ts test/native-assets.test.ts && pnpm --filter @bubstack/moe-memory typecheck`

Expected: PASS; corrupt hashes, duplicate targets, unsupported pairs, symlinks, and escaping paths are rejected.

- [ ] **Step 5: Commit the native asset contract**

```bash
git add .github/workflows/memory-native-refresh.yml packages/memory/src/installed-package-root.ts packages/memory/src/native-assets.ts packages/memory/scripts/refresh-sqlite-vec.mjs packages/memory/vendor/sqlite-vec packages/memory/test/installed-package-root.test.ts packages/memory/test/native-assets.test.ts packages/memory/package.json package.json pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "feat(memory): pin portable sqlite-vec assets"
```

### Task 3: Port the Store to DatabaseSync

**Files:**
- Create: `packages/memory/src/runtime-context.ts`
- Test: `packages/memory/test/runtime-context.test.ts`
- Modify: `packages/memory/src/db.ts`
- Modify: `packages/memory/src/embedding-migration.ts`
- Modify: `packages/memory/src/install-check.ts`
- Modify: `packages/memory/src/cli.ts`
- Modify: `packages/memory/src/index.ts`
- Modify: `packages/memory/src/index-cli.ts`
- Modify: `packages/memory/src/indexer.ts`
- Modify: `packages/memory/src/sync.ts`
- Modify: `packages/memory/src/sync-cli.ts`
- Modify: `packages/memory/src/mcp-server.ts`
- Modify: `packages/memory/src/search.ts`
- Modify: `packages/memory/src/stats.ts`
- Modify: `packages/memory/src/stats-cli.ts`
- Modify: `packages/memory/src/verify.ts`
- Modify: `packages/memory/src/journal-cli.ts`
- Modify: `packages/memory/src/journal/search.ts`
- Modify: `packages/memory/src/journal/store.ts`
- Modify: `packages/memory/package.json`
- Modify: `pnpm-workspace.yaml`
- Modify: `pnpm-lock.yaml`
- Modify: `packages/memory/test/test-utils.ts`
- Modify: `packages/memory/test/codex-transcripts.test.ts`
- Modify: `packages/memory/test/cross-harness-recall.test.ts`
- Test: `packages/memory/test/db.test.ts`
- Modify: `packages/memory/test/do-not-index-indexer.test.ts`
- Modify: `packages/memory/test/embedding-migration.test.ts`
- Modify: `packages/memory/test/exclude-codex-project.test.ts`
- Modify: `packages/memory/test/install-check.test.ts`
- Modify: `packages/memory/test/journal-project-isolation.test.ts`
- Modify: `packages/memory/test/journal-search.test.ts`
- Test: `packages/memory/test/journal-store.test.ts`
- Modify: `packages/memory/test/model/integration.test.ts`
- Modify: `packages/memory/test/model/embedding-migration-encoder.test.ts`
- Modify: `packages/memory/test/model/exclude-nested-indexer.test.ts`
- Modify: `packages/memory/test/model/incremental-indexing.test.ts`
- Modify: `packages/memory/test/model/journal-encoder.test.ts`
- Modify: `packages/memory/test/model/multi-concept.test.ts`
- Modify: `packages/memory/test/model/sync-indexing.test.ts`
- Modify: `packages/memory/test/model/verify-repair.test.ts`
- Modify: `packages/memory/test/repair-do-not-index.test.ts`
- Test: `packages/memory/test/search-date-filter-vector.test.ts`
- Modify: `packages/memory/test/search-text-only-confidence.test.ts`
- Test: `packages/memory/test/stats.test.ts`
- Modify: `packages/memory/test/sync-cli-single-instance.test.ts`
- Modify: `packages/memory/test/test-indexer.ts`
- Modify: `packages/memory/test/tool-calls-cascade.test.ts`
- Test: `packages/memory/test/verify.test.ts`

**Interfaces:**
- Consumes: `InstalledPackageRoot`, `resolveNativeAsset()`, and `verifyNativeAsset()` from Task 2.
- Produces: internal `MemoryDatabase = DatabaseSync`, `MemoryRuntimeContext`, `createMemoryRuntimeContext(entrypointUrl)`, `createMemoryOperations(context)`, `DatabaseOptions` with required entrypoint-injected `packageRoot`, `initDatabase(options)`, and `closeDatabase(db)` contracts; public search/index signatures remain unchanged through root-bound facade functions.

- [ ] **Step 1: Add DatabaseSync compatibility tests before changing production imports**

```ts
it("opens the existing schema with node:sqlite and loads vec0", () => {
  const db = initDatabase({ path: fixtureDbPath(), packageRoot });
  expect(db.prepare("SELECT vec_version() AS version").get()).toMatchObject({ version: "v0.1.9" });
  expect(db.prepare("PRAGMA journal_mode").get()).toMatchObject({ journal_mode: "wal" });
  expect(db.prepare("PRAGMA foreign_keys").get()).toMatchObject({ foreign_keys: 1 });
  closeDatabase(db);
});

it("binds retained library operations to the public entrypoint root", async () => {
  const context = createMemoryRuntimeContext(distIndexUrl);
  const memory = createMemoryOperations(context);
  expect(await memory.searchConversations("package roots")).toEqual(expect.any(Array));
  expect(context.packageRoot).toEqual(packageRoot);
});
```

Add an inventory assertion over `packages/memory/src` and TypeScript files under `packages/memory/test`: after the migration, production calls may reach `initDatabase()` only through `MemoryRuntimeContext.openDatabase()`, and tests may reach it only through package-shaped helpers in `test-utils.ts`. Reject every remaining `better-sqlite3` import/type/construction as well as any newly unbound `initDatabase()` caller. The test helper supports both writable setup and read-only postcondition inspection with the same branded package root.

- [ ] **Step 2: Run the focused store suite to verify the new contract fails**

Run: `pnpm --filter @bubstack/moe-memory exec vitest run --project unit test/db.test.ts test/journal-store.test.ts test/search-date-filter-vector.test.ts test/stats.test.ts test/verify.test.ts`

Expected: FAIL because `initDatabase` has no options object and returns `better-sqlite3`.

- [ ] **Step 3: Replace dependency-specific types and calls**

```ts
import { DatabaseSync } from "node:sqlite";

export type MemoryDatabase = DatabaseSync;

export interface MemoryRuntimeContext {
  packageRoot: InstalledPackageRoot;
  openDatabase(path?: string): MemoryDatabase;
}

export function createMemoryRuntimeContext(entrypointUrl: URL): MemoryRuntimeContext {
  const packageRoot = resolveInstalledPackageRoot(entrypointUrl);
  return { packageRoot, openDatabase: (path) => initDatabase({ path, packageRoot }) };
}

export function initDatabase(options: DatabaseOptions): MemoryDatabase {
  const db = new DatabaseSync(options.path ?? getDbPath(), { allowExtension: true });
  const asset = resolveNativeAsset(options.packageRoot);
  db.loadExtension(asset.absolutePath);
  db.enableLoadExtension(false);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000");
  createSchema(db);
  migrateSchema(db);
  return db;
}
```

Convert `Database.Database` annotations to `MemoryDatabase`, explicit pragma SQL, and `Uint8Array`/`Buffer` normalization. `src/index.ts` constructs one context from its own URL and exports facade functions from `createMemoryOperations(context)` with the retained signatures; `src/cli.ts` does the same and passes the context into `index-cli`, sync, stats, verify, journal, and MCP command handlers. Replace every enumerated production direct call with `context.openDatabase()`. Replace every direct test call and raw `new Database(...)` fixture—including read-only inspection connections—with the package-shaped test helper. Update the transitional install check so it no longer names the removed dependency; Plan 03 later deletes that eager check entirely. No database/native/WASM/model helper may use its own `import.meta.url` as an implicit fallback. Route all connection teardown through `closeDatabase()` in this task; initially it delegates to `db.close()`, and Task 5 binds lease release there. Set the package engine to exactly `>=22.13.0 <23 || >=24 <25`. Remove `better-sqlite3`, `@types/better-sqlite3`, and their stale build approval only after every call site and fixture compiles. Keep exact direct `sqlite-vec` source ownership; Plan 04's bundle-proven package policy removes runtime dependencies only from the generated artifact.

- [ ] **Step 4: Run the complete offline Memory suite**

Run: `pnpm --filter @bubstack/moe-memory test && pnpm --filter @bubstack/moe-memory typecheck`

Expected: PASS with no `better-sqlite3` import in `packages/memory/src`.

- [ ] **Step 5: Commit the DatabaseSync port**

```bash
git add packages/memory/src packages/memory/test packages/memory/package.json pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "refactor(memory): use built-in sqlite storage"
```

### Task 4: Make Transactions and Foreign-Key Restoration Exception-Safe

**Files:**
- Create: `packages/memory/src/database-transaction.ts`
- Test: `packages/memory/test/database-transaction.test.ts`
- Modify: `packages/memory/src/db.ts`
- Modify: `packages/memory/src/embedding-migration.ts`
- Test: `packages/memory/test/tool-calls-cascade.test.ts`
- Test: `packages/memory/test/db.test.ts`

**Interfaces:**
- Consumes: `MemoryDatabase` from Task 3.
- Produces: `withTransaction<T>(db, body): T` and `withForeignKeysDisabled<T>(db, body): T`.

- [ ] **Step 1: Write failure-path tests**

```ts
it("rolls back and restores foreign keys after a migration throws", () => {
  const db = openFixtureDatabase();
  expect(() => withForeignKeysDisabled(db, () => withTransaction(db, () => {
    db.exec("INSERT INTO exchanges(id) VALUES ('incomplete')");
    throw new Error("stop");
  }))).toThrow("stop");
  expect(db.prepare("PRAGMA foreign_keys").get()).toEqual({ foreign_keys: 1 });
  expect(db.prepare("SELECT count(*) AS n FROM exchanges WHERE id='incomplete'").get()).toEqual({ n: 0 });
});
```

- [ ] **Step 2: Run the transaction tests to verify they fail**

Run: `pnpm --filter @bubstack/moe-memory exec vitest run --project unit test/database-transaction.test.ts test/tool-calls-cascade.test.ts`

Expected: FAIL because the helpers do not exist and the current migration does not restore foreign keys in `finally`.

- [ ] **Step 3: Implement the helpers and replace `.transaction()`**

```ts
export function withTransaction<T>(db: MemoryDatabase, body: () => T): T {
  db.exec("BEGIN");
  try {
    const value = body();
    db.exec("COMMIT");
    return value;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function withForeignKeysDisabled<T>(db: MemoryDatabase, body: () => T): T {
  const row = db.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number };
  db.exec("PRAGMA foreign_keys = OFF");
  try { return body(); } finally { db.exec(`PRAGMA foreign_keys = ${row.foreign_keys ? "ON" : "OFF"}`); }
}
```

Use the helpers in `migrateToolCallsCascade` and embedding batch writes. Add two-connection contention coverage for WAL and the five-second busy timeout.

- [ ] **Step 4: Run transaction, cascade, and contention tests**

Run: `pnpm --filter @bubstack/moe-memory exec vitest run --project unit test/database-transaction.test.ts test/tool-calls-cascade.test.ts test/db.test.ts`

Expected: PASS; failed migrations roll back and restore the incoming foreign-key state.

- [ ] **Step 5: Commit transaction safety**

```bash
git add packages/memory/src/database-transaction.ts packages/memory/src/db.ts packages/memory/src/embedding-migration.ts packages/memory/test/database-transaction.test.ts packages/memory/test/tool-calls-cascade.test.ts packages/memory/test/db.test.ts
git commit -m "fix(memory): make sqlite transactions exception safe"
```

### Task 5: Add Cross-Process Database Leases and Legacy Preflight

**Files:**
- Create: `packages/memory/src/database-lease.ts`
- Create: `packages/memory/test/fixtures/legacy-v2-holder.mjs`
- Test: `packages/memory/test/database-lease.test.ts`
- Modify: `packages/memory/src/db.ts`
- Modify: `packages/memory/src/file-lock.ts`

**Interfaces:**
- Consumes: `MemoryDatabase` and connection lifecycle from Task 3.
- Produces: `DatabaseLease`, `DatabaseWriter`, `acquireSharedDatabaseLease()`, `acquireDatabaseWriter()`, `withDatabaseWriter()`, `acquireExclusiveMaintenanceLease()`, `readDatabaseEpoch()`, `assertWritableEpoch()`, `inspectLegacyDatabaseUsers()`, and `DatabaseBusyError`.

- [ ] **Step 1: Write two-process lease and legacy-holder tests**

```ts
it("refuses maintenance while a v3 shared lease or v2 handle is active", async () => {
  const shared = acquireSharedDatabaseLease(dbPath);
  expect(() => acquireExclusiveMaintenanceLease(dbPath)).toThrow(DatabaseBusyError);
  shared.release();
  const legacy = await spawnLegacyV2Holder(dbPath);
  expect(inspectLegacyDatabaseUsers(dbPath)).not.toEqual([]);
  expect(() => acquireExclusiveMaintenanceLease(dbPath)).toThrow(/legacy/);
  await legacy.stop();
  expect(acquireExclusiveMaintenanceLease(dbPath)).toBeDefined();
});
```

- [ ] **Step 2: Run the lease test to verify it fails**

Run: `pnpm --filter @bubstack/moe-memory exec vitest run --project unit test/database-lease.test.ts`

Expected: FAIL because the lease module and legacy-holder fixture do not exist.

- [ ] **Step 3: Implement shared/exclusive leases and bind them to connections**

```ts
export interface DatabaseLease { mode: "shared" | "exclusive"; epoch: number; release(): void }
export interface DatabaseWriter { epoch: number; release(): void }

export function acquireSharedDatabaseLease(path: string): DatabaseLease;
export function acquireDatabaseWriter(path: string, shared: DatabaseLease): DatabaseWriter;
export function withDatabaseWriter<T>(db: MemoryDatabase, expectedEpoch: number, body: () => T): T;
export function acquireExclusiveMaintenanceLease(path: string): DatabaseLease;
export function readDatabaseEpoch(path: string): number;
export function assertWritableEpoch(path: string, expected: number): void;
```

Acquire a shared lease before every normal SQLite open and hold it until `closeDatabase()` releases it exactly once. A writer mutex may be acquired only while the caller holds that shared lease; every write rechecks the captured epoch under the writer mutex. Exclusive maintenance requires zero shared and writer holders, performs legacy open-handle preflight, and is acquired before opening a maintenance connection. Never upgrade a shared lease to exclusive in place. Snapshot, replacement, and rollback code in Plan 06 consumes this order. Implement supported macOS/Linux open-handle and known sync-lock/PID detection; return diagnostics instead of terminating processes.

- [ ] **Step 4: Run lease, database, and sync-lock suites**

Run: `pnpm --filter @bubstack/moe-memory exec vitest run --project unit test/database-lease.test.ts test/file-lock.test.ts test/sync-cli-single-instance.test.ts test/db.test.ts`

Expected: PASS; exclusive maintenance never overlaps a shared v3 connection or live v2 fixture.

- [ ] **Step 5: Commit the maintenance lease boundary**

```bash
git add packages/memory/src/database-lease.ts packages/memory/src/db.ts packages/memory/src/file-lock.ts packages/memory/test/database-lease.test.ts packages/memory/test/fixtures/legacy-v2-holder.mjs
git commit -m "feat(memory): coordinate database maintenance leases"
```
