# Moe Memory Rollback Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an existing Node 24 user safely prepare a downgrade from Memory 0.2.0 to the exact offline 0.1.5 predecessor without exposing that old runtime to version-3 data.

**Architecture:** The v3 CLI owns a durable `prepare`/`abort` state machine. It requires exclusive database quiescence, reconciles mutable source files into a staged version-2 snapshot, runs the verified historical runtime offline, fences all v3 writers, and atomically swaps only after integrity and complete-v2-vector checks pass.

**Tech Stack:** TypeScript, Node.js, SQLite `VACUUM INTO`, filesystem journals, platform recovery capsules, Vitest child-process/fault-injection fixtures

**Spec:** `docs/moe/specs/2026-09-02-moe-memory-self-contained-plugin-design.md`

## Global Constraints

- Start from the HEAD produced by Plan 05; record that base SHA before dispatch, and require delegated findings to name the SHA they inspected.
- Rollback is supported only for databases upgraded from the composed 0.1.5 predecessor on Node 24 and only on supported macOS/Linux targets; a Node 22 or native-Windows preflight fails before changing state.
- The exact verified platform recovery capsule and version-2 snapshot must already exist before prepare proceeds.
- Maintenance refuses while any v3 shared lease, v2 sync/MCP process, known sync lock, or open legacy database handle exists; it never kills a process.
- Every v3 writer checks the durable rollback fence under the writer mutex before changing database or index state.
- Reconciliation accounts for created, modified, and deleted transcript and journal sources. Changed rows become raw version-0 state and lose stale vectors.
- The old runtime executes only inside its isolated capsule with registry/network access disabled and the preserved legacy model cache.
- A crash before the fence leaves the active v3 database unchanged. After the fence, retry or abort resumes from durable metadata.
- The version-3 database is retained under a recoverable name after swap; no destructive cleanup belongs to prepare.

## Not Yet Specified

None. Capsule naming, digests, platform selection, and hosting are supplied by Plan 02 and the foundation release catalog.

## Out of Scope

- Fresh 0.2.0 installations on Node 22 cannot downgrade to 0.1.5.
- Automatic host-plugin downgrade is not performed; prepare tells the user when the database is safe for the host's normal install/update mechanism.
- Cleanup of retained version-3 backups requires a separate, explicitly destructive design.

---

### Task 1: Define the Durable Rollback State and Fence

**Files:**
- Create: `packages/memory/src/rollback/state.ts`
- Create: `packages/memory/src/rollback/fence.ts`
- Create: `packages/memory/test/rollback-state.test.ts`
- Modify: `packages/memory/src/paths.ts`
- Modify: `packages/memory/src/database-lease.ts`
- Modify: `packages/memory/src/enrichment.ts`
- Modify: `packages/memory/src/db.ts`
- Modify: `packages/memory/src/journal/store.ts`
- Modify: `packages/memory/src/sync.ts`

**Interfaces:**
- Consumes: database identity/epoch, shared/writer/exclusive leases, snapshot sidecar, and verified capsule identifiers.
- Produces: `RollbackState`, `readRollbackState()`, `advanceRollbackState(expected, next)`, `assertWritesAllowed()`, and `clearRollbackFence()`.

- [ ] **Step 1: Write transition, durability, and writer-block tests**

```ts
it("blocks every writer after the durable fenced transition", () => {
  createRollbackState({ phase: "staging", databaseId, capsuleDigest });
  advanceRollbackState("staging", "fenced");
  expect(() => upsertPendingExchange(db, exchange)).toThrow(/rollback is prepared/);
  expect(readRollbackState().phase).toBe("fenced");
});
```

Reject skipped/backward transitions, mismatched database/capsule/snapshot identity, malformed JSON, path escapes, and clearing a fence after swap.

- [ ] **Step 2: Run state tests to verify they fail**

Run: `pnpm --filter @bubstack/moe-memory exec vitest run --project unit test/rollback-state.test.ts`

Expected: FAIL because no state machine/fence exists.

- [ ] **Step 3: Implement atomic state writes and wire every write path**

```ts
export type RollbackPhase = "staging" | "fenced" | "swapped";

export interface RollbackState {
  schema: 1;
  phase: RollbackPhase;
  databaseId: string;
  snapshotSha256: string;
  capsuleSha256: string;
  stagedDatabase: string;
  retainedV3Database: string;
}
```

Write state to a sibling temp file, fsync it, rename, then fsync the parent. Add `assertWritesAllowed()` inside the writer critical section used by raw ingestion, enrichment, migration, journal indexing, repair, and database replacement.

- [ ] **Step 4: Run state, store, sync, and migration tests**

Run: `pnpm --filter @bubstack/moe-memory exec vitest run --project unit test/rollback-state.test.ts test/sync.test.ts test/journal-store.test.ts test/embedding-migration.test.ts`

Expected: PASS; no write succeeds once the fence is durable.

- [ ] **Step 5: Commit rollback state and fence enforcement**

```bash
git add packages/memory/src/rollback/state.ts packages/memory/src/rollback/fence.ts packages/memory/src/paths.ts packages/memory/src/database-lease.ts packages/memory/src/enrichment.ts packages/memory/src/db.ts packages/memory/src/journal/store.ts packages/memory/src/sync.ts packages/memory/test/rollback-state.test.ts
git commit -m "feat(memory): fence writes during rollback preparation"
```

### Task 2: Reconcile Durable Sources into a Staged Version-2 Database

**Files:**
- Create: `packages/memory/src/rollback/reconcile.ts`
- Create: `packages/memory/test/rollback-reconcile.test.ts`
- Create: `packages/memory/test/fixtures/rollback-sources/`
- Modify: `packages/memory/src/parser.ts`
- Modify: `packages/memory/src/journal/markdown.ts`
- Modify: `packages/memory/src/db.ts`

**Interfaces:**
- Consumes: copied version-2 snapshot, current transcript/journal source roots, source audit from the migration snapshot, and package-owned parsers.
- Produces: `ReconciliationPlan`, `planSourceReconciliation()`, and `applySourceReconciliation(stagedDb, plan)`.

- [ ] **Step 1: Write created/modified/deleted/source-less-row tests**

```ts
it("reconciles all source changes without trusting mtimes", async () => {
  const plan = await planSourceReconciliation(snapshotSidecar, currentSources);
  expect(plan).toMatchObject({ created: [createdId], modified: [modifiedId], deleted: [deletedId] });
  await applySourceReconciliation(stagedDb, plan);
  expect(readRow(stagedDb, modifiedId)).toMatchObject({ embeddingVersion: 0 });
  expect(readVector(stagedDb, modifiedId)).toBeUndefined();
});
```

Add a database-only mutable row fixture and require a hard preflight failure before fence/swap.

- [ ] **Step 2: Run reconciliation tests to verify they fail**

Run: `pnpm --filter @bubstack/moe-memory exec vitest run --project unit test/rollback-reconcile.test.ts`

Expected: FAIL because current sync's `copyIfNewer` behavior cannot account for deletions or content-identical mtimes.

- [ ] **Step 3: Implement hash-based source inventory and staged updates**

```ts
export interface ReconciliationPlan {
  created: readonly SourceChange[];
  modified: readonly SourceChange[];
  deleted: readonly SourceChange[];
  unchanged: readonly SourceChange[];
}
```

Compare durable source identities and content hashes from the snapshot sidecar with current sources. Apply only to the staged copy inside transactions. Delete removed rows/tool calls/vectors; reparse created/modified sources as raw version-0 rows; reset journal index state for affected roots.

- [ ] **Step 4: Run reconciliation and database integrity tests**

Run: `pnpm --filter @bubstack/moe-memory exec vitest run --project unit test/rollback-reconcile.test.ts test/db.test.ts test/tool-calls-cascade.test.ts`

Expected: PASS; the active v3 database remains byte-identical during this task.

- [ ] **Step 5: Commit complete source reconciliation**

```bash
git add packages/memory/src/rollback/reconcile.ts packages/memory/src/parser.ts packages/memory/src/journal/markdown.ts packages/memory/src/db.ts packages/memory/test/rollback-reconcile.test.ts packages/memory/test/fixtures/rollback-sources
git commit -m "feat(memory): reconcile rollback sources safely"
```

### Task 3: Implement `rollback prepare` and `rollback abort`

**Files:**
- Create: `packages/memory/src/rollback/prepare.ts`
- Create: `packages/memory/src/rollback/abort.ts`
- Create: `packages/memory/src/rollback-cli.ts`
- Create: `packages/memory/test/rollback-cli.test.ts`
- Modify: `packages/memory/src/cli.ts`
- Modify: `packages/memory/src/recovery-capsule.ts`
- Modify: `packages/memory/src/database-snapshot.ts`

**Interfaces:**
- Consumes: Tasks 1–2 state/reconciliation, exclusive maintenance lease, verified capsule, snapshot, and platform release catalog.
- Produces: `prepareRollback({ to: "0.1.5" })`, `abortRollback()`, and CLI routes `rollback prepare --to 0.1.5` / `rollback abort`.

- [ ] **Step 1: Add successful, refused, retry, and abort CLI tests**

```ts
it("swaps only after the isolated old runtime completes version-2 vectors", async () => {
  const result = await prepareRollback({ to: "0.1.5", paths: fixturePaths });
  expect(result.phase).toBe("swapped");
  expect(openWithRecoveredRuntime(result.activeDatabase).vectorVersion).toBe(2);
  expect(readChangedJournalRows(result.activeDatabase).every((row) => row.embeddingVersion === 2)).toBe(true);
  expect(readChangedExchangeRows(result.activeDatabase).every((row) => row.embeddingVersion === 2)).toBe(true);
  expect(sha256(result.retainedV3Database)).toBe(originalV3Sha);
});
```

- [ ] **Step 2: Run rollback CLI tests to verify they fail**

Run: `pnpm --filter @bubstack/moe-memory exec vitest run --project unit test/rollback-cli.test.ts`

Expected: FAIL because no rollback CLI exists.

- [ ] **Step 3: Implement the prepare/abort orchestration**

Preflight Node 24, capsule/catalog/snapshot hashes, durable sources, and no legacy/shared holders. Acquire exclusive maintenance, copy snapshot to staging, reconcile sources, and unpack the capsule to an isolated directory. For every reconciled journal root, invoke the recovered 0.1.5 runtime's own `journal index` operation against the staged database and preserved model cache; then invoke its exchange sync/migration. Disable network and registries for both operations. Before the fence, require SQLite integrity, zero incomplete version-2 vectors, and explicit version-2 rows/vectors for every created or modified journal and exchange record. Only then durably fence and atomically swap. Keep the v3 database. `abort` may clear only a pre-swap fence after verifying the active database is still v3 and no v3 writer is active.

- [ ] **Step 4: Run CLI and offline recovered-runtime tests**

Run: `pnpm --filter @bubstack/moe-memory exec vitest run --project unit test/rollback-cli.test.ts test/artifact/recovery-capsule-offline.test.ts`

Expected: PASS; failures before fence leave active state untouched, and retries resume from the recorded phase.

- [ ] **Step 5: Commit the rollback commands**

```bash
git add packages/memory/src/rollback/prepare.ts packages/memory/src/rollback/abort.ts packages/memory/src/rollback-cli.ts packages/memory/src/cli.ts packages/memory/src/recovery-capsule.ts packages/memory/src/database-snapshot.ts packages/memory/test/rollback-cli.test.ts
git commit -m "feat(memory): prepare safe rollback to 0.1.5"
```

### Task 4: Prove Crash, Race, Offline, and Version-Boundary Recovery

**Files:**
- Create: `packages/memory/test/rollback-crash.test.ts`
- Create: `packages/memory/test/rollback-process.test.ts`
- Create: `packages/memory/test/artifact/rollback-offline.test.ts`
- Create: `packages/memory/test/fixtures/rollback-worker.mjs`
- Modify: `packages/memory/test/manual/claude-e2e.js`
- Modify: `packages/memory/test/manual/codex-e2e.js`
- Modify: `packages/memory/docs/MIGRATING-0.2.md`
- Modify: `packages/memory/README.md`

**Interfaces:**
- Consumes: complete rollback implementation and exact packed 0.2.0/0.1.5 artifacts.
- Produces: fault-injection evidence for every durable boundary and operator documentation that cannot reverse the required order.

- [ ] **Step 1: Add a table-driven crash/race matrix**

```ts
it.each(["staging-created", "old-runtime-complete", "fence-durable", "active-renamed", "swap-complete"])(
  "recovers after crash at %s",
  async (boundary) => expect(await crashAndResume(boundary)).toMatchObject({ integrity: "ok" }),
);
```

Also hold a real 0.1.5 sync and MCP process open, assert refusal/no mutation, stop both, then assert success. Cover partial v3 migration, future-version input, bad capsule, bad snapshot, missing source, Node 22, native Windows, and unavailable network.

- [ ] **Step 2: Run the recovery matrix to verify uncovered boundaries fail**

Run: `pnpm --filter @bubstack/moe-memory exec vitest run --project unit test/rollback-crash.test.ts test/rollback-process.test.ts test/artifact/rollback-offline.test.ts`

Expected: FAIL until every injected boundary has deterministic retry/abort behavior.

- [ ] **Step 3: Close implementation gaps and document the operator sequence**

Documentation order is: stop all hosts, run `moe-memory rollback prepare --to 0.1.5` under Node 24 on a supported macOS/Linux target, wait for successful `swapped`, downgrade the host plugin, verify 0.1.5 recall. Explain `rollback abort` eligibility and retained v3 database path; do not suggest installing 0.1.5 before prepare.

- [ ] **Step 4: Run full Memory and artifact gates**

Run: `pnpm --filter @bubstack/moe-memory test && pnpm --filter @bubstack/moe-memory test:model && pnpm memory:artifact:test && pnpm provenance`

Expected: PASS; final old runtime provides offline text recall and complete version-2 vector search.

- [ ] **Step 5: Commit rollback recovery evidence and docs**

```bash
git add packages/memory/test/rollback-crash.test.ts packages/memory/test/rollback-process.test.ts packages/memory/test/artifact/rollback-offline.test.ts packages/memory/test/fixtures/rollback-worker.mjs packages/memory/test/manual/claude-e2e.js packages/memory/test/manual/codex-e2e.js packages/memory/docs/MIGRATING-0.2.md packages/memory/README.md
git commit -m "test(memory): prove rollback crash recovery"
```
