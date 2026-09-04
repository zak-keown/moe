/**
 * The one store.
 *
 * Two record types, two table families, one SQLite file:
 *
 *   exchanges       + tool_calls + vec_exchanges        harvested transcript turns
 *   journal_entries             + vec_journal_entries   deliberately written entries
 *
 * They are deliberately NOT one undifferentiated table. A journal entry and a
 * transcript turn have different write paths, different privacy properties and
 * different query surfaces; sharing an encoder and a database file is the whole
 * of what they share. Both vector tables are `FLOAT[384]` and both carry an
 * `embedding_version`, so the migration in embedding-migration.ts covers either.
 *
 */
import { DatabaseSync } from "node:sqlite";
import { type DatabaseLease } from "./database-lease.js";
import type { InstalledPackageRoot } from "./installed-package-root.js";
import type { ConversationExchange, JournalEntry, JournalScope, MemoryEdge, MemoryNode } from "./types.js";
export type MemoryDatabase = DatabaseSync;
export interface DatabaseOptions {
    path?: string;
    packageRoot?: InstalledPackageRoot;
}
export declare function setDefaultPackageRoot(root: InstalledPackageRoot): void;
export declare function getDefaultPackageRoot(): InstalledPackageRoot | undefined;
export declare function getDatabaseLease(db: MemoryDatabase): DatabaseLease | undefined;
export declare function closeDatabase(db: MemoryDatabase): void;
export declare function migrateSchema(db: MemoryDatabase): void;
/**
 * Add `journal_entries.root` and discard the journal index once.
 *
 * Every project on the machine shares one database, and until this column
 * existed nothing recorded which journal root a row came from. Three defects
 * followed, all of them data loss or leakage:
 *
 *   - `indexJournal` pruned every row it had not just walked, and it walks only
 *     the current project's roots — so indexing in one repo deleted every other
 *     repo's `project`-scoped rows. `mcp-server.ts` runs it on every start.
 *   - Retrieval filtered on scope and timestamp only, so one repo's project
 *     notes surfaced in another.
 *   - `journalEntryId` hashed `scope:<relative path>`, so two repos whose entries
 *     shared a relative path — a date directory and a timestamp — collided on the
 *     primary key and overwrote each other.
 *
 * The fix changes the id, so old rows are unreachable by their new ids and
 * cannot be backfilled reliably: `path` is absolute, but nothing in it marks
 * where the root stopped and the entry began. The index is a derived cache —
 * `mcp-server.ts` says so ("the markdown files are the source of truth, and a
 * failed index is retried on the next start") — so it is dropped and rebuilt.
 * Each project restores its own rows the next time it indexes, which is what
 * makes this recoverable rather than the deletion it replaces.
 */
export declare function migrateJournalRoot(db: MemoryDatabase): void;
/**
 * Earlier versions created `tool_calls` with a plain
 * `FOREIGN KEY (exchange_id) REFERENCES exchanges(id)`.
 * Without ON DELETE CASCADE, deleting an exchange that had tool calls
 * raised SQLITE_CONSTRAINT_FOREIGNKEY (#81), and orphans accumulated.
 *
 * This migration:
 *   1. Detects the legacy schema by inspecting sqlite_master.sql.
 *   2. Drops orphaned tool_calls rows.
 *   3. Recreates the table with ON DELETE CASCADE and copies surviving rows.
 */
export declare function migrateToolCallsCascade(db: MemoryDatabase): void;
export declare function initDatabase(options?: DatabaseOptions): MemoryDatabase;
export declare function insertExchange(db: MemoryDatabase, exchange: ConversationExchange, embedding: number[] | null, _toolNames?: string[]): void;
export declare function getAllExchanges(db: MemoryDatabase): Array<{
    id: string;
    archivePath: string;
}>;
export declare function getFileLastIndexed(db: MemoryDatabase, archivePath: string): number | null;
export declare function deleteExchange(db: MemoryDatabase, id: string): void;
interface JournalRow {
    id: string;
    path: string;
    root: string;
    scope: string;
    timestamp: number;
    text: string;
    sections: string;
}
export declare function journalEntryFromRow(row: JournalRow): JournalEntry;
export declare const JOURNAL_SELECT_COLUMNS = "\n        j.id,\n        j.path,\n        j.root,\n        j.scope,\n        j.timestamp,\n        j.text,\n        j.sections";
/**
 * Insert or replace one journal entry and its vector.
 *
 * Same shape as insertExchange: the vec0 virtual table rejects REPLACE, so the
 * vector row is deleted then inserted.
 */
export declare function upsertJournalEntry(db: MemoryDatabase, entry: JournalEntry, sourceMtimeMs: number, embedding?: number[] | null): void;
export declare function deleteJournalEntry(db: MemoryDatabase, id: string): void;
export interface JournalIndexState {
    id: string;
    path: string;
    /** The journal root the row was indexed under. `''` for pre-migration rows. */
    root: string;
    sourceMtimeMs: number;
    embeddingVersion: number;
}
/**
 * Everything the incremental journal scan needs to decide whether a file on
 * disk is already indexed at the current embedding version.
 *
 * private-journal-mcp's equivalent keyed purely on the ABSENCE of a `.embedding`
 * sidecar, so it would never re-embed a stale one and never notice an edited
 * entry. Carrying mtime and version means a changed file and a bumped
 * EMBEDDING_VERSION both re-index.
 */
export declare function getJournalIndexState(db: MemoryDatabase, scope?: JournalScope): Map<string, JournalIndexState>;
export declare function countJournalEntries(db: MemoryDatabase, scope?: JournalScope): number;
export declare function insertNode(db: MemoryDatabase, node: MemoryNode): void;
export declare function insertEdge(db: MemoryDatabase, edge: MemoryEdge): void;
export declare function getNode(db: MemoryDatabase, id: string): MemoryNode | null;
export declare function getEdgesFrom(db: MemoryDatabase, sourceType: string, sourceId: string): MemoryEdge[];
export declare function getEdgesTo(db: MemoryDatabase, targetType: string, targetId: string): MemoryEdge[];
/**
 * Walk the edge graph from a starting record, collecting edges up to `depth`.
 *
 * `direction`:
 *   - `"causes"` — follow edges where the current node is the **target**
 *     (i.e. find what caused it), walking target→source.
 *   - `"effects"` — follow edges where the current node is the **source**
 *     (i.e. find what it caused), walking source→target.
 *
 * Uses an iterative BFS to avoid stack overflow on deep chains.
 */
export declare function traceProvenance(db: MemoryDatabase, type: string, id: string, depth: number, direction: "causes" | "effects"): Array<{
    depth: number;
    edge: MemoryEdge;
}>;
export {};
