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

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { EMBEDDING_DIMENSIONS } from "./constants.js";
import { acquireSharedDatabaseLease, type DatabaseLease } from "./database-lease.js";
import { withTransaction, withForeignKeysDisabled } from "./database-transaction.js";
import { EMBEDDING_VERSION } from "./embedding-migration.js";
import { resolveNativeAsset } from "./native-assets.js";
import type { InstalledPackageRoot } from "./installed-package-root.js";
import { getDbPath } from "./paths.js";
import type {
  ConversationExchange,
  JournalEntry,
  JournalScope,
  MemoryEdge,
  MemoryNode,
} from "./types.js";

export type MemoryDatabase = DatabaseSync;

const _leases = new WeakMap<MemoryDatabase, DatabaseLease>();

export interface DatabaseOptions {
  path?: string;
  packageRoot?: InstalledPackageRoot;
}

let _defaultPackageRoot: InstalledPackageRoot | undefined;

export function setDefaultPackageRoot(root: InstalledPackageRoot): void {
  _defaultPackageRoot = root;
}

export function getDefaultPackageRoot(): InstalledPackageRoot | undefined {
  return _defaultPackageRoot;
}

export function closeDatabase(db: MemoryDatabase): void {
  const lease = _leases.get(db);
  if (lease) {
    _leases.delete(db);
    lease.release();
  }
  db.close();
}

export function migrateSchema(db: MemoryDatabase): void {
  const columns = db.prepare(`SELECT name FROM pragma_table_info('exchanges')`).all() as Array<{
    name: string;
  }>;
  const columnNames = new Set(columns.map((c) => c.name));

  const migrations: Array<{ name: string; sql: string }> = [
    { name: "last_indexed", sql: "ALTER TABLE exchanges ADD COLUMN last_indexed INTEGER" },
    { name: "parent_uuid", sql: "ALTER TABLE exchanges ADD COLUMN parent_uuid TEXT" },
    {
      name: "is_sidechain",
      sql: "ALTER TABLE exchanges ADD COLUMN is_sidechain BOOLEAN DEFAULT 0",
    },
    {
      name: "harness",
      sql: "ALTER TABLE exchanges ADD COLUMN harness TEXT NOT NULL DEFAULT 'claude'",
    },
    { name: "session_id", sql: "ALTER TABLE exchanges ADD COLUMN session_id TEXT" },
    { name: "cwd", sql: "ALTER TABLE exchanges ADD COLUMN cwd TEXT" },
    { name: "git_branch", sql: "ALTER TABLE exchanges ADD COLUMN git_branch TEXT" },
    { name: "git_commit", sql: "ALTER TABLE exchanges ADD COLUMN git_commit TEXT" },
    { name: "claude_version", sql: "ALTER TABLE exchanges ADD COLUMN claude_version TEXT" },
    { name: "agent_version", sql: "ALTER TABLE exchanges ADD COLUMN agent_version TEXT" },
    { name: "model", sql: "ALTER TABLE exchanges ADD COLUMN model TEXT" },
    { name: "model_provider", sql: "ALTER TABLE exchanges ADD COLUMN model_provider TEXT" },
    { name: "thinking_level", sql: "ALTER TABLE exchanges ADD COLUMN thinking_level TEXT" },
    {
      name: "thinking_disabled",
      sql: "ALTER TABLE exchanges ADD COLUMN thinking_disabled BOOLEAN",
    },
    { name: "thinking_triggers", sql: "ALTER TABLE exchanges ADD COLUMN thinking_triggers TEXT" },
    {
      name: "embedding_version",
      sql: "ALTER TABLE exchanges ADD COLUMN embedding_version INTEGER NOT NULL DEFAULT 0",
    },
  ];

  let migrated = false;
  for (const migration of migrations) {
    if (!columnNames.has(migration.name)) {
      console.log(`Migrating schema: adding ${migration.name} column...`);
      db.prepare(migration.sql).run();
      migrated = true;
    }
  }

  if (migrated) {
    console.log("Migration complete.");
  }

  migrateToolCallsCascade(db);
  migrateJournalRoot(db);
}

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
export function migrateJournalRoot(db: MemoryDatabase): void {
  const table = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='journal_entries'`)
    .get() as { sql: string } | undefined;
  if (!table) return; // caller creates it with the column already present
  const columns = db
    .prepare(`SELECT name FROM pragma_table_info('journal_entries')`)
    .all() as Array<{
    name: string;
  }>;
  if (columns.some((c) => c.name === "root")) return;

  console.log("Migrating journal_entries: adding root column and rebuilding the index...");
  db.prepare("ALTER TABLE journal_entries ADD COLUMN root TEXT NOT NULL DEFAULT ''").run();
  // vec0 rows are keyed by the same ids, so they go too or they orphan.
  db.prepare("DELETE FROM vec_journal_entries").run();
  db.prepare("DELETE FROM journal_entries").run();
  console.log("  journal index cleared; it rebuilds per project on next index.");
}

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
export function migrateToolCallsCascade(db: MemoryDatabase): void {
  const row = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='tool_calls'`)
    .get() as { sql: string } | undefined;
  if (!row) return; // table doesn't exist yet (caller will create it)
  if (row.sql.toUpperCase().includes("ON DELETE CASCADE")) return; // already migrated

  console.log("Migrating tool_calls to ON DELETE CASCADE schema...");

  const orphanCount = (
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM tool_calls
     WHERE exchange_id NOT IN (SELECT id FROM exchanges)`,
      )
      .get() as { c: number }
  ).c;
  if (orphanCount > 0) {
    console.log(`  Removing ${orphanCount} orphaned tool_calls row(s)`);
  }

  withForeignKeysDisabled(db, () => withTransaction(db, () => {
    db.exec(`
      CREATE TABLE tool_calls_new (
        id TEXT PRIMARY KEY,
        exchange_id TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        tool_input TEXT,
        tool_result TEXT,
        is_error BOOLEAN DEFAULT 0,
        timestamp TEXT NOT NULL,
        FOREIGN KEY (exchange_id) REFERENCES exchanges(id) ON DELETE CASCADE
      )
    `);
    db.exec(`
      INSERT INTO tool_calls_new
      SELECT id, exchange_id, tool_name, tool_input, tool_result, is_error, timestamp
      FROM tool_calls
      WHERE exchange_id IN (SELECT id FROM exchanges)
    `);
    db.exec(`DROP TABLE tool_calls`);
    db.exec(`ALTER TABLE tool_calls_new RENAME TO tool_calls`);
  }));

  console.log("  tool_calls migration complete.");
}

export function initDatabase(options?: DatabaseOptions): MemoryDatabase {
  const dbPath = options?.path ?? getDbPath();
  const packageRoot = options?.packageRoot ?? _defaultPackageRoot;
  if (!packageRoot) {
    throw new Error(
      "initDatabase requires a packageRoot — either pass it in options or call setDefaultPackageRoot() first",
    );
  }

  // Ensure directory exists
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  // Acquire a shared lease before opening the database
  const lease = acquireSharedDatabaseLease(dbPath);

  const db = new DatabaseSync(dbPath, { allowExtension: true });
  _leases.set(db, lease);

  // Load sqlite-vec extension from vendored binary
  const asset = resolveNativeAsset(packageRoot);
  db.loadExtension(asset.absolutePath);
  db.enableLoadExtension(false);

  // Enable WAL mode and foreign keys
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");

  // Create exchanges table
  db.exec(`
    CREATE TABLE IF NOT EXISTS exchanges (
      id TEXT PRIMARY KEY,
      project TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      user_message TEXT NOT NULL,
      assistant_message TEXT NOT NULL,
      archive_path TEXT NOT NULL,
      line_start INTEGER NOT NULL,
      line_end INTEGER NOT NULL,
      embedding BLOB,
      last_indexed INTEGER,
      parent_uuid TEXT,
      is_sidechain BOOLEAN DEFAULT 0,
      harness TEXT NOT NULL DEFAULT 'claude',
      session_id TEXT,
      cwd TEXT,
      git_branch TEXT,
      git_commit TEXT,
      claude_version TEXT,
      agent_version TEXT,
      model TEXT,
      model_provider TEXT,
      thinking_level TEXT,
      thinking_disabled BOOLEAN,
      thinking_triggers TEXT,
      embedding_version INTEGER NOT NULL DEFAULT 0
    )
  `);

  // Create tool_calls table.
  // ON DELETE CASCADE keeps the table consistent when exchanges go away
  // (search reindex, repair, etc.) without callers having to remember to
  // delete dependents first.
  db.exec(`
    CREATE TABLE IF NOT EXISTS tool_calls (
      id TEXT PRIMARY KEY,
      exchange_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      tool_input TEXT,
      tool_result TEXT,
      is_error BOOLEAN DEFAULT 0,
      timestamp TEXT NOT NULL,
      FOREIGN KEY (exchange_id) REFERENCES exchanges(id) ON DELETE CASCADE
    )
  `);

  // Create vector search index
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS vec_exchanges USING vec0(
      id TEXT PRIMARY KEY,
      embedding FLOAT[${EMBEDDING_DIMENSIONS}]
    )
  `);

  // Journal entries. The markdown file on disk stays the source of truth — this
  // is an index, and `moe-memory journal index` rebuilds it from the files.
  // `path` is refreshed from the walk on every index run, which is the fix for
  // an upstream defect: the sidecar format baked an ABSOLUTE path into its JSON,
  // search returned that stale path, and read_journal_entry then refused it with
  // a security-flavoured error.
  db.exec(`
    CREATE TABLE IF NOT EXISTS journal_entries (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL,
      root TEXT NOT NULL DEFAULT '',
      scope TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      text TEXT NOT NULL,
      sections TEXT NOT NULL,
      source_mtime_ms INTEGER NOT NULL,
      last_indexed INTEGER,
      embedding_version INTEGER NOT NULL DEFAULT 0
    )
  `);
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS vec_journal_entries USING vec0(
      id TEXT PRIMARY KEY,
      embedding FLOAT[${EMBEDDING_DIMENSIONS}]
    )
  `);

  // Graph memory: nodes, node vectors, and edges.
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_nodes (
      id TEXT PRIMARY KEY,
      node_type TEXT NOT NULL,
      project TEXT,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      superseded_at TEXT,
      embedding_version INTEGER NOT NULL DEFAULT 0
    )
  `);
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS vec_memory_nodes USING vec0(
      id TEXT PRIMARY KEY,
      embedding FLOAT[${EMBEDDING_DIMENSIONS}]
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_edges (
      id TEXT PRIMARY KEY,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      relation TEXT NOT NULL,
      confidence REAL DEFAULT 1.0,
      created_at TEXT NOT NULL,
      created_by TEXT,
      metadata TEXT
    )
  `);

  // Run migrations first
  migrateSchema(db);

  // Create indexes (after migrations ensure columns exist)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_timestamp ON exchanges(timestamp DESC)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_session_id ON exchanges(session_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_project ON exchanges(project)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_harness ON exchanges(harness)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sidechain ON exchanges(is_sidechain)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_git_branch ON exchanges(git_branch)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tool_name ON tool_calls(tool_name)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tool_exchange ON tool_calls(exchange_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_journal_scope ON journal_entries(scope)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_journal_timestamp ON journal_entries(timestamp DESC)
  `);
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_journal_path ON journal_entries(path)
  `);

  // Graph memory indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_edge_source ON memory_edges(source_type, source_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_edge_target ON memory_edges(target_type, target_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_node_type ON memory_nodes(node_type)
  `);

  return db;
}

export function insertExchange(
  db: MemoryDatabase,
  exchange: ConversationExchange,
  embedding: number[] | null,
  _toolNames?: string[],
): void {
  const now = Date.now();
  const hasEmbedding = embedding !== null && embedding.length > 0;

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO exchanges
    (id, project, timestamp, user_message, assistant_message, archive_path, line_start, line_end, last_indexed,
     parent_uuid, is_sidechain, harness, session_id, cwd, git_branch, git_commit, claude_version, agent_version, model, model_provider,
     thinking_level, thinking_disabled, thinking_triggers, embedding_version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    exchange.id,
    exchange.project,
    exchange.timestamp,
    exchange.userMessage,
    exchange.assistantMessage,
    exchange.archivePath,
    exchange.lineStart,
    exchange.lineEnd,
    now,
    exchange.parentUuid || null,
    exchange.isSidechain ? 1 : 0,
    exchange.harness || "claude",
    exchange.sessionId || null,
    exchange.cwd || null,
    exchange.gitBranch || null,
    exchange.gitCommit || null,
    exchange.claudeVersion || null,
    exchange.agentVersion || exchange.claudeVersion || null,
    exchange.model || null,
    exchange.modelProvider || null,
    exchange.thinkingLevel || null,
    exchange.thinkingDisabled ? 1 : 0,
    exchange.thinkingTriggers || null,
    hasEmbedding ? EMBEDDING_VERSION : 0,
  );

  // Delete any stale vec row (virtual tables don't support REPLACE)
  db.prepare("DELETE FROM vec_exchanges WHERE id = ?").run(exchange.id);

  if (hasEmbedding) {
    db.prepare("INSERT INTO vec_exchanges (id, embedding) VALUES (?, ?)").run(
      exchange.id,
      new Uint8Array(new Float32Array(embedding).buffer),
    );
  }

  // Insert tool calls if present
  if (exchange.toolCalls && exchange.toolCalls.length > 0) {
    const toolStmt = db.prepare(`
      INSERT OR REPLACE INTO tool_calls
      (id, exchange_id, tool_name, tool_input, tool_result, is_error, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const toolCall of exchange.toolCalls) {
      toolStmt.run(
        toolCall.id,
        toolCall.exchangeId,
        toolCall.toolName,
        toolCall.toolInput ? JSON.stringify(toolCall.toolInput) : null,
        toolCall.toolResult || null,
        toolCall.isError ? 1 : 0,
        toolCall.timestamp,
      );
    }
  }
}

export function getAllExchanges(db: MemoryDatabase): Array<{ id: string; archivePath: string }> {
  const stmt = db.prepare(`SELECT id, archive_path as archivePath FROM exchanges`);
  return stmt.all() as Array<{ id: string; archivePath: string }>;
}

export function getFileLastIndexed(db: MemoryDatabase, archivePath: string): number | null {
  const stmt = db.prepare(`
    SELECT MAX(last_indexed) as lastIndexed
    FROM exchanges
    WHERE archive_path = ?
  `);
  const row = stmt.get(archivePath) as { lastIndexed: number | null };
  return row.lastIndexed;
}

export function deleteExchange(db: MemoryDatabase, id: string): void {
  // Delete from vector table
  db.prepare(`DELETE FROM vec_exchanges WHERE id = ?`).run(id);

  // Delete from main table
  db.prepare(`DELETE FROM exchanges WHERE id = ?`).run(id);
}

// ---------------------------------------------------------------------------
// Journal entries
// ---------------------------------------------------------------------------

interface JournalRow {
  id: string;
  path: string;
  root: string;
  scope: string;
  timestamp: number;
  text: string;
  sections: string;
}

export function journalEntryFromRow(row: JournalRow): JournalEntry {
  let sections: string[] = [];
  try {
    const parsed: unknown = JSON.parse(row.sections);
    if (Array.isArray(parsed)) sections = parsed.filter((s): s is string => typeof s === "string");
  } catch {
    // A hand-edited row should not take the whole query down.
  }
  return {
    id: row.id,
    path: row.path,
    root: row.root ?? "",
    scope: row.scope === "project" ? "project" : "user",
    timestamp: row.timestamp,
    text: row.text,
    sections,
  };
}

export const JOURNAL_SELECT_COLUMNS = `
        j.id,
        j.path,
        j.root,
        j.scope,
        j.timestamp,
        j.text,
        j.sections`;

/**
 * Insert or replace one journal entry and its vector.
 *
 * Same shape as insertExchange: the vec0 virtual table rejects REPLACE, so the
 * vector row is deleted then inserted.
 */
export function upsertJournalEntry(
  db: MemoryDatabase,
  entry: JournalEntry,
  sourceMtimeMs: number,
  embedding: number[] | null = null,
): void {
  const hasEmbedding = embedding !== null && embedding.length > 0;

  db.prepare(`
    INSERT OR REPLACE INTO journal_entries
      (id, path, root, scope, timestamp, text, sections, source_mtime_ms, last_indexed, embedding_version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    entry.id,
    entry.path,
    entry.root,
    entry.scope,
    entry.timestamp,
    entry.text,
    JSON.stringify(entry.sections),
    sourceMtimeMs,
    Date.now(),
    hasEmbedding ? EMBEDDING_VERSION : 0,
  );

  db.prepare("DELETE FROM vec_journal_entries WHERE id = ?").run(entry.id);

  if (hasEmbedding) {
    db.prepare("INSERT INTO vec_journal_entries (id, embedding) VALUES (?, ?)").run(
      entry.id,
      new Uint8Array(new Float32Array(embedding).buffer),
    );
  }
}

export function deleteJournalEntry(db: MemoryDatabase, id: string): void {
  db.prepare("DELETE FROM vec_journal_entries WHERE id = ?").run(id);
  db.prepare("DELETE FROM journal_entries WHERE id = ?").run(id);
}

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
export function getJournalIndexState(
  db: MemoryDatabase,
  scope?: JournalScope,
): Map<string, JournalIndexState> {
  const rows = (
    scope
      ? db
          .prepare(
            "SELECT id, path, root, source_mtime_ms, embedding_version FROM journal_entries WHERE scope = ?",
          )
          .all(scope)
      : db
          .prepare("SELECT id, path, root, source_mtime_ms, embedding_version FROM journal_entries")
          .all()
  ) as Array<{
    id: string;
    path: string;
    root: string;
    source_mtime_ms: number;
    embedding_version: number;
  }>;

  const state = new Map<string, JournalIndexState>();
  for (const row of rows) {
    state.set(row.id, {
      id: row.id,
      path: row.path,
      root: row.root ?? "",
      sourceMtimeMs: row.source_mtime_ms,
      embeddingVersion: row.embedding_version,
    });
  }
  return state;
}

export function countJournalEntries(db: MemoryDatabase, scope?: JournalScope): number {
  const row = (
    scope
      ? db.prepare("SELECT COUNT(*) AS c FROM journal_entries WHERE scope = ?").get(scope)
      : db.prepare("SELECT COUNT(*) AS c FROM journal_entries").get()
  ) as { c: number };
  return row.c;
}

// ---------------------------------------------------------------------------
// Graph memory: nodes and edges
// ---------------------------------------------------------------------------

export function insertNode(db: MemoryDatabase, node: MemoryNode): void {
  db.prepare(`
    INSERT OR REPLACE INTO memory_nodes
      (id, node_type, project, content, created_at, superseded_at, embedding_version)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    node.id,
    node.nodeType,
    node.project ?? null,
    node.content,
    node.createdAt,
    node.supersededAt ?? null,
    node.embeddingVersion,
  );
}

export function insertEdge(db: MemoryDatabase, edge: MemoryEdge): void {
  db.prepare(`
    INSERT OR REPLACE INTO memory_edges
      (id, source_type, source_id, target_type, target_id, relation, confidence, created_at, created_by, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    edge.id,
    edge.sourceType,
    edge.sourceId,
    edge.targetType,
    edge.targetId,
    edge.relation,
    edge.confidence,
    edge.createdAt,
    edge.createdBy,
    edge.metadata ? JSON.stringify(edge.metadata) : null,
  );
}

interface MemoryNodeRow {
  id: string;
  node_type: string;
  project: string | null;
  content: string;
  created_at: string;
  superseded_at: string | null;
  embedding_version: number;
}

function nodeFromRow(row: MemoryNodeRow): MemoryNode {
  return {
    id: row.id,
    nodeType: row.node_type as MemoryNode["nodeType"],
    project: row.project ?? undefined,
    content: row.content,
    createdAt: row.created_at,
    supersededAt: row.superseded_at ?? undefined,
    embeddingVersion: row.embedding_version,
  };
}

export function getNode(db: MemoryDatabase, id: string): MemoryNode | null {
  const row = db
    .prepare("SELECT * FROM memory_nodes WHERE id = ?")
    .get(id) as MemoryNodeRow | undefined;
  return row ? nodeFromRow(row) : null;
}

interface MemoryEdgeRow {
  id: string;
  source_type: string;
  source_id: string;
  target_type: string;
  target_id: string;
  relation: string;
  confidence: number;
  created_at: string;
  created_by: string | null;
  metadata: string | null;
}

function edgeFromRow(row: MemoryEdgeRow): MemoryEdge {
  let metadata: Record<string, unknown> | undefined;
  if (row.metadata) {
    try {
      metadata = JSON.parse(row.metadata) as Record<string, unknown>;
    } catch {
      // Ignore malformed metadata
    }
  }
  return {
    id: row.id,
    sourceType: row.source_type as MemoryEdge["sourceType"],
    sourceId: row.source_id,
    targetType: row.target_type as MemoryEdge["targetType"],
    targetId: row.target_id,
    relation: row.relation as MemoryEdge["relation"],
    confidence: row.confidence,
    createdAt: row.created_at,
    createdBy: (row.created_by ?? "system") as MemoryEdge["createdBy"],
    metadata,
  };
}

export function getEdgesFrom(
  db: MemoryDatabase,
  sourceType: string,
  sourceId: string,
): MemoryEdge[] {
  const rows = db
    .prepare("SELECT * FROM memory_edges WHERE source_type = ? AND source_id = ?")
    .all(sourceType, sourceId) as unknown as MemoryEdgeRow[];
  return rows.map(edgeFromRow);
}

export function getEdgesTo(
  db: MemoryDatabase,
  targetType: string,
  targetId: string,
): MemoryEdge[] {
  const rows = db
    .prepare("SELECT * FROM memory_edges WHERE target_type = ? AND target_id = ?")
    .all(targetType, targetId) as unknown as MemoryEdgeRow[];
  return rows.map(edgeFromRow);
}

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
export function traceProvenance(
  db: MemoryDatabase,
  type: string,
  id: string,
  depth: number,
  direction: "causes" | "effects",
): Array<{ depth: number; edge: MemoryEdge }> {
  const results: Array<{ depth: number; edge: MemoryEdge }> = [];
  const visited = new Set<string>();

  // BFS frontier: each entry is [currentType, currentId, currentDepth]
  let frontier: Array<[string, string, number]> = [[type, id, 0]];

  while (frontier.length > 0) {
    const next: Array<[string, string, number]> = [];
    for (const [curType, curId, curDepth] of frontier) {
      if (curDepth >= depth) continue;

      const edges =
        direction === "causes"
          ? getEdgesTo(db, curType, curId)
          : getEdgesFrom(db, curType, curId);

      for (const edge of edges) {
        if (visited.has(edge.id)) continue;
        visited.add(edge.id);
        results.push({ depth: curDepth + 1, edge });

        const nextType = direction === "causes" ? edge.sourceType : edge.targetType;
        const nextId = direction === "causes" ? edge.sourceId : edge.targetId;
        next.push([nextType, nextId, curDepth + 1]);
      }
    }
    frontier = next;
  }

  return results;
}
