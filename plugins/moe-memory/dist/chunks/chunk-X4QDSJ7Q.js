// @generated — do not edit; see scripts/build-runtime.mjs
import { createRequire as __createRequire } from 'module';
const require = __createRequire(import.meta.url);
import {
  getDbPath,
  getMemoryDataDir
} from "./chunk-YFLZKW2J.js";
import {
  acquireFileLock,
  readLockHolder,
  releaseFileLock
} from "./chunk-OYWI4M6D.js";
import {
  EMBEDDING_DIMENSIONS
} from "./chunk-NH4NDHAK.js";
import {
  __require
} from "./chunk-XRZM5UX2.js";

// src/db.ts
import fs3 from "node:fs";
import path4 from "node:path";
import { DatabaseSync } from "node:sqlite";

// src/database-lease.ts
import fs from "node:fs";
import path from "node:path";
var DatabaseBusyError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "DatabaseBusyError";
  }
};
var LEASE_DIR_SUFFIX = ".leases";
var EPOCH_FILE_SUFFIX = ".epoch";
var WRITER_LOCK_SUFFIX = ".writer.lock";
function leaseDir(dbPath) {
  return dbPath + LEASE_DIR_SUFFIX;
}
function epochFile(dbPath) {
  return dbPath + EPOCH_FILE_SUFFIX;
}
function writerLockPath(dbPath) {
  return dbPath + WRITER_LOCK_SUFFIX;
}
function sharedLockPath(dbPath, id) {
  return path.join(leaseDir(dbPath), `shared-${id}.lock`);
}
function generateLeaseId() {
  return `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
function readDatabaseEpoch(dbPath) {
  const ep = epochFile(dbPath);
  try {
    const content = fs.readFileSync(ep, "utf-8").trim();
    const n = parseInt(content, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}
function writeDatabaseEpoch(dbPath, epoch) {
  const ep = epochFile(dbPath);
  fs.mkdirSync(path.dirname(ep), { recursive: true });
  fs.writeFileSync(ep, String(epoch), "utf-8");
}
function listSharedLeases(dbPath) {
  const dir = leaseDir(dbPath);
  try {
    return fs.readdirSync(dir).filter((f) => f.startsWith("shared-") && f.endsWith(".lock"));
  } catch {
    return [];
  }
}
function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
function cleanStaleSharedLeases(dbPath) {
  const dir = leaseDir(dbPath);
  for (const file of listSharedLeases(dbPath)) {
    const lockPath = path.join(dir, file);
    const pid = readLockHolder(lockPath);
    if (pid !== null && !isProcessAlive(pid)) {
      try {
        fs.unlinkSync(lockPath);
      } catch {
      }
      try {
        fs.rmSync(lockPath + ".lock", { recursive: true, force: true });
      } catch {
      }
    }
  }
}
function acquireSharedDatabaseLease(dbPath) {
  const dir = leaseDir(dbPath);
  fs.mkdirSync(dir, { recursive: true });
  const id = generateLeaseId();
  const lockPath = sharedLockPath(dbPath, id);
  const handle = acquireFileLock(lockPath);
  if (!handle) {
    throw new DatabaseBusyError(`Failed to acquire shared lease for ${dbPath}`);
  }
  const epoch = readDatabaseEpoch(dbPath);
  let released = false;
  return {
    mode: "shared",
    epoch,
    release() {
      if (released) return;
      released = true;
      releaseFileLock(handle);
    }
  };
}
function acquireDatabaseWriter(dbPath, shared) {
  if (shared.mode !== "shared") {
    throw new Error("acquireDatabaseWriter requires a shared lease");
  }
  const lockPath = writerLockPath(dbPath);
  const handle = acquireFileLock(lockPath);
  if (!handle) {
    throw new DatabaseBusyError(`Database writer lock is held by another process for ${dbPath}`);
  }
  const epoch = readDatabaseEpoch(dbPath);
  let released = false;
  return {
    epoch,
    release() {
      if (released) return;
      released = true;
      releaseFileLock(handle);
    }
  };
}
function withDatabaseWriter(db, expectedEpoch, body) {
  const dbPath = db.__leasePath;
  if (!dbPath) {
    return body();
  }
  const currentEpoch = readDatabaseEpoch(dbPath);
  if (currentEpoch !== expectedEpoch) {
    throw new DatabaseBusyError(
      `Database epoch changed (expected ${expectedEpoch}, got ${currentEpoch}) \u2014 a maintenance operation may have replaced the database`
    );
  }
  return body();
}
function inspectLegacyDatabaseUsers(dbPath) {
  const diagnostics = [];
  const walPath = dbPath + "-wal";
  const shmPath = dbPath + "-shm";
  const walExists = fs.existsSync(walPath);
  const shmExists = fs.existsSync(shmPath);
  if (!walExists && !shmExists) {
    return diagnostics;
  }
  const syncLockPath = path.join(path.dirname(dbPath), "sync.lock");
  const syncPid = readLockHolder(syncLockPath);
  if (syncPid !== null && isProcessAlive(syncPid)) {
    diagnostics.push({ pid: syncPid, alive: true });
  }
  if (process.platform === "darwin" || process.platform === "linux") {
    try {
      const { execSync } = __require("node:child_process");
      const output = execSync(`lsof -t "${dbPath}" 2>/dev/null`, {
        encoding: "utf-8",
        timeout: 5e3
      }).trim();
      if (output) {
        for (const line of output.split("\n")) {
          const pid = parseInt(line.trim(), 10);
          if (Number.isFinite(pid) && pid > 0 && pid !== process.pid) {
            if (!diagnostics.some((d) => d.pid === pid)) {
              diagnostics.push({ pid, alive: isProcessAlive(pid) });
            }
          }
        }
      }
    } catch {
    }
  }
  return diagnostics;
}
function acquireExclusiveMaintenanceLease(dbPath) {
  cleanStaleSharedLeases(dbPath);
  const activeLeases = listSharedLeases(dbPath);
  if (activeLeases.length > 0) {
    const dir = leaseDir(dbPath);
    for (const file of activeLeases) {
      const lockPath = path.join(dir, file);
      const pid = readLockHolder(lockPath);
      if (pid !== null && isProcessAlive(pid)) {
        throw new DatabaseBusyError(
          `Cannot acquire exclusive maintenance lease: shared lease held by PID ${pid}`
        );
      }
    }
    for (const file of activeLeases) {
      const lockPath = path.join(dir, file);
      try {
        fs.unlinkSync(lockPath);
      } catch {
      }
      try {
        fs.rmSync(lockPath + ".lock", { recursive: true, force: true });
      } catch {
      }
    }
  }
  const legacyUsers = inspectLegacyDatabaseUsers(dbPath);
  const aliveLegacy = legacyUsers.filter((d) => d.alive);
  if (aliveLegacy.length > 0) {
    const pids = aliveLegacy.map((d) => d.pid).join(", ");
    throw new DatabaseBusyError(
      `Cannot acquire exclusive maintenance lease: legacy database users detected (PIDs: ${pids})`
    );
  }
  const writerHandle = acquireFileLock(writerLockPath(dbPath));
  if (!writerHandle) {
    throw new DatabaseBusyError(`Cannot acquire exclusive maintenance lease: writer lock is held`);
  }
  const newEpoch = readDatabaseEpoch(dbPath) + 1;
  writeDatabaseEpoch(dbPath, newEpoch);
  let released = false;
  return {
    mode: "exclusive",
    epoch: newEpoch,
    release() {
      if (released) return;
      released = true;
      releaseFileLock(writerHandle);
    }
  };
}
function assertWritableEpoch(dbPath, expected) {
  const current = readDatabaseEpoch(dbPath);
  if (current !== expected) {
    throw new DatabaseBusyError(
      `Database epoch mismatch (expected ${expected}, got ${current}) \u2014 the database may have been replaced by a maintenance operation`
    );
  }
}

// src/database-transaction.ts
function withTransaction(db, body) {
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
function withForeignKeysDisabled(db, body) {
  const row = db.prepare("PRAGMA foreign_keys").get();
  db.exec("PRAGMA foreign_keys = OFF");
  try {
    return body();
  } finally {
    db.exec(`PRAGMA foreign_keys = ${row.foreign_keys ? "ON" : "OFF"}`);
  }
}

// src/embedding-migration.ts
import path2 from "node:path";
var EMBEDDING_VERSION = 3;
var acquireMigrationLock = acquireFileLock;
var releaseMigrationLock = releaseFileLock;
function pickStaleBatch(db, limit) {
  return db.prepare(`
    SELECT
      e.id,
      e.user_message,
      e.assistant_message,
      GROUP_CONCAT(DISTINCT tc.tool_name) AS tools
    FROM exchanges e
    LEFT JOIN tool_calls tc ON tc.exchange_id = e.id
    WHERE e.embedding_version < ?
    GROUP BY e.id
    LIMIT ?
  `).all(EMBEDDING_VERSION, limit);
}
function recordReembedded(db, id, embedding) {
  db.prepare("DELETE FROM vec_exchanges WHERE id = ?").run(id);
  db.prepare("INSERT INTO vec_exchanges (id, embedding) VALUES (?, ?)").run(
    id,
    new Uint8Array(new Float32Array(embedding).buffer)
  );
  db.prepare("UPDATE exchanges SET embedding_version = ? WHERE id = ?").run(EMBEDDING_VERSION, id);
}
function countStale(db) {
  const row = db.prepare("SELECT COUNT(*) AS c FROM exchanges WHERE embedding_version < ?").get(EMBEDDING_VERSION);
  return row.c;
}
function getMigrationLockPath(indexDir) {
  return path2.join(indexDir, ".embedding-migration.lock");
}
async function runMigrationBatch(db, indexDir, batchSize, embedFn) {
  const remaining = countStale(db);
  if (remaining === 0) return 0;
  const lockPath = getMigrationLockPath(indexDir);
  const lock = acquireMigrationLock(lockPath);
  if (!lock) {
    console.error(
      `moe-memory: another process is migrating embeddings (${remaining} rows still stale); skipping`
    );
    return 0;
  }
  try {
    const rows = pickStaleBatch(db, batchSize);
    if (rows.length === 0) return 0;
    console.error(`moe-memory: re-embedding batch of ${rows.length} (${remaining} stale total)...`);
    const embeddings = [];
    for (const row of rows) {
      const tools = row.tools ? row.tools.split(",") : void 0;
      const vec = await embedFn(row.user_message, row.assistant_message, tools);
      embeddings.push({ id: row.id, vec });
    }
    withTransaction(db, () => {
      for (const item of embeddings) recordReembedded(db, item.id, item.vec);
    });
    return embeddings.length;
  } finally {
    releaseMigrationLock(lock);
  }
}

// src/native-assets.ts
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { normalize, relative, resolve } from "node:path";
var ALL_TARGETS = [
  "darwin-arm64",
  "darwin-x64",
  "linux-arm64",
  "linux-x64",
  "win32-x64"
];
function loadNativeAssetManifest(root) {
  const manifestPath = resolve(root, "vendor", "sqlite-vec", "manifest.json");
  const raw = JSON.parse(readFileSync(manifestPath, "utf-8"));
  if (!raw.targets || typeof raw.targets !== "object") {
    throw new Error(`native asset manifest at ${manifestPath} has no targets`);
  }
  for (const target of ALL_TARGETS) {
    if (!raw.targets[target]) {
      throw new Error(`native asset manifest missing required target: ${target}`);
    }
  }
  return raw;
}
function verifyNativeAsset(root, record) {
  const normalized = normalize(record.path);
  if (normalized.startsWith("..") || normalized.startsWith("/")) {
    throw new Error(
      `native asset path escape detected: ${record.path} resolves outside package root`
    );
  }
  const absolutePath = resolve(root, "vendor", "sqlite-vec", normalized);
  const rel = relative(resolve(root, "vendor", "sqlite-vec"), absolutePath);
  if (rel.startsWith("..")) {
    throw new Error(
      `native asset path escape detected: ${record.path} resolves outside vendor directory`
    );
  }
  const content = readFileSync(absolutePath);
  if (content.byteLength !== record.bytes) {
    throw new Error(
      `native asset size mismatch for ${record.target}: expected ${record.bytes}, got ${content.byteLength}`
    );
  }
  const sha256 = createHash("sha256").update(content).digest("hex");
  if (sha256 !== record.sha256) {
    throw new Error(
      `native asset SHA-256 mismatch for ${record.target}: expected ${record.sha256}, got ${sha256}`
    );
  }
  return absolutePath;
}
function resolveNativeAsset(root, platform = process.platform, arch = process.arch) {
  const target = `${platform}-${arch}`;
  const manifest = loadNativeAssetManifest(root);
  const record = manifest.targets[target];
  if (!record) {
    throw new Error(`unsupported sqlite-vec target: ${target}`);
  }
  const absolutePath = verifyNativeAsset(root, record);
  return { record, absolutePath };
}

// src/rollback/state.ts
import fs2 from "node:fs";
import path3 from "node:path";
var VALID_TRANSITIONS = /* @__PURE__ */ new Map([
  ["staging", "fenced"],
  ["fenced", "swapped"]
]);
var RollbackStateError = class extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
    this.name = "RollbackStateError";
  }
};
function rollbackStatePath(dataDir) {
  return path3.join(dataDir, "rollback-state.json");
}
function validateState(raw) {
  if (!raw || typeof raw !== "object") return false;
  const s = raw;
  if (s.schema !== 1) return false;
  if (typeof s.phase !== "string") return false;
  if (!["staging", "fenced", "swapped"].includes(s.phase)) return false;
  if (typeof s.databaseId !== "string" || s.databaseId.length === 0) return false;
  if (typeof s.snapshotSha256 !== "string" || s.snapshotSha256.length !== 64) return false;
  if (typeof s.capsuleSha256 !== "string" || s.capsuleSha256.length !== 64) return false;
  if (typeof s.stagedDatabase !== "string" || s.stagedDatabase.length === 0) return false;
  if (typeof s.retainedV3Database !== "string" || s.retainedV3Database.length === 0) return false;
  if (path3.normalize(s.stagedDatabase).startsWith("..") || path3.isAbsolute(s.stagedDatabase)) {
    return false;
  }
  if (path3.normalize(s.retainedV3Database).startsWith("..") || path3.isAbsolute(s.retainedV3Database)) {
    return false;
  }
  return true;
}
function atomicWriteFile(filePath, content) {
  const dir = path3.dirname(filePath);
  fs2.mkdirSync(dir, { recursive: true });
  const tmpPath = `${filePath}.tmp.${process.pid}`;
  const fd = fs2.openSync(tmpPath, "w");
  try {
    fs2.writeSync(fd, content);
    fs2.fsyncSync(fd);
    fs2.closeSync(fd);
  } catch (err) {
    try {
      fs2.closeSync(fd);
    } catch {
    }
    try {
      fs2.unlinkSync(tmpPath);
    } catch {
    }
    throw err;
  }
  fs2.renameSync(tmpPath, filePath);
  const dirFd = fs2.openSync(dir, "r");
  try {
    fs2.fsyncSync(dirFd);
  } catch {
  } finally {
    fs2.closeSync(dirFd);
  }
}
function readRollbackState(dataDir) {
  const p = rollbackStatePath(dataDir);
  try {
    const content = fs2.readFileSync(p, "utf-8");
    const parsed = JSON.parse(content);
    if (!validateState(parsed)) {
      throw new RollbackStateError("malformed rollback state file", "MALFORMED_STATE");
    }
    return parsed;
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}
function createRollbackState(dataDir, init) {
  const existing = readRollbackState(dataDir);
  if (existing) {
    throw new RollbackStateError(
      `rollback state already exists in phase "${existing.phase}"`,
      "STATE_EXISTS"
    );
  }
  if (init.phase !== "staging") {
    throw new RollbackStateError(
      `initial rollback state must be "staging", got "${init.phase}"`,
      "INVALID_INITIAL_PHASE"
    );
  }
  const state = { schema: 1, ...init };
  if (!validateState(state)) {
    throw new RollbackStateError("invalid rollback state fields", "INVALID_STATE");
  }
  atomicWriteFile(rollbackStatePath(dataDir), JSON.stringify(state, null, 2));
  return state;
}
function advanceRollbackState(dataDir, expected, next) {
  const current = readRollbackState(dataDir);
  if (!current) {
    throw new RollbackStateError("no rollback state exists", "NO_STATE");
  }
  if (current.phase !== expected) {
    throw new RollbackStateError(
      `expected phase "${expected}", got "${current.phase}"`,
      "PHASE_MISMATCH"
    );
  }
  const allowed = VALID_TRANSITIONS.get(expected);
  if (allowed !== next) {
    throw new RollbackStateError(
      `invalid transition: "${expected}" -> "${next}"`,
      "INVALID_TRANSITION"
    );
  }
  const updated = { ...current, phase: next };
  atomicWriteFile(rollbackStatePath(dataDir), JSON.stringify(updated, null, 2));
  return updated;
}
function clearRollbackState(dataDir) {
  const current = readRollbackState(dataDir);
  if (current && current.phase === "swapped") {
    throw new RollbackStateError(
      "cannot clear rollback state after swap \u2014 the v3 database has been replaced",
      "CANNOT_CLEAR_AFTER_SWAP"
    );
  }
  const p = rollbackStatePath(dataDir);
  try {
    fs2.unlinkSync(p);
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
}

// src/rollback/fence.ts
var RollbackFencedError = class extends Error {
  constructor() {
    super("rollback is prepared \u2014 all writes are blocked until rollback completes or is aborted");
    this.name = "RollbackFencedError";
  }
};
function assertWritesAllowed(dataDir) {
  const dir = dataDir ?? getMemoryDataDir();
  const state = readRollbackState(dir);
  if (state && state.phase === "fenced") {
    throw new RollbackFencedError();
  }
}

// src/db.ts
var _leases = /* @__PURE__ */ new WeakMap();
var _defaultPackageRoot;
function setDefaultPackageRoot(root) {
  _defaultPackageRoot = root;
}
function getDefaultPackageRoot() {
  return _defaultPackageRoot;
}
function getDatabaseLease(db) {
  return _leases.get(db);
}
function closeDatabase(db) {
  const lease = _leases.get(db);
  if (lease) {
    _leases.delete(db);
    lease.release();
  }
  db.close();
}
function migrateSchema(db) {
  const columns = db.prepare(`SELECT name FROM pragma_table_info('exchanges')`).all();
  const columnNames = new Set(columns.map((c) => c.name));
  const migrations = [
    { name: "last_indexed", sql: "ALTER TABLE exchanges ADD COLUMN last_indexed INTEGER" },
    { name: "parent_uuid", sql: "ALTER TABLE exchanges ADD COLUMN parent_uuid TEXT" },
    {
      name: "is_sidechain",
      sql: "ALTER TABLE exchanges ADD COLUMN is_sidechain BOOLEAN DEFAULT 0"
    },
    {
      name: "harness",
      sql: "ALTER TABLE exchanges ADD COLUMN harness TEXT NOT NULL DEFAULT 'claude'"
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
      sql: "ALTER TABLE exchanges ADD COLUMN thinking_disabled BOOLEAN"
    },
    { name: "thinking_triggers", sql: "ALTER TABLE exchanges ADD COLUMN thinking_triggers TEXT" },
    {
      name: "embedding_version",
      sql: "ALTER TABLE exchanges ADD COLUMN embedding_version INTEGER NOT NULL DEFAULT 0"
    }
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
function migrateJournalRoot(db) {
  const table = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='journal_entries'`).get();
  if (!table) return;
  const columns = db.prepare(`SELECT name FROM pragma_table_info('journal_entries')`).all();
  if (columns.some((c) => c.name === "root")) return;
  console.log("Migrating journal_entries: adding root column and rebuilding the index...");
  db.prepare("ALTER TABLE journal_entries ADD COLUMN root TEXT NOT NULL DEFAULT ''").run();
  db.prepare("DELETE FROM vec_journal_entries").run();
  db.prepare("DELETE FROM journal_entries").run();
  console.log("  journal index cleared; it rebuilds per project on next index.");
}
function migrateToolCallsCascade(db) {
  const row = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='tool_calls'`).get();
  if (!row) return;
  if (row.sql.toUpperCase().includes("ON DELETE CASCADE")) return;
  console.log("Migrating tool_calls to ON DELETE CASCADE schema...");
  const orphanCount = db.prepare(
    `SELECT COUNT(*) AS c FROM tool_calls
     WHERE exchange_id NOT IN (SELECT id FROM exchanges)`
  ).get().c;
  if (orphanCount > 0) {
    console.log(`  Removing ${orphanCount} orphaned tool_calls row(s)`);
  }
  withForeignKeysDisabled(
    db,
    () => withTransaction(db, () => {
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
    })
  );
  console.log("  tool_calls migration complete.");
}
function initDatabase(options) {
  const dbPath = options?.path ?? getDbPath();
  const packageRoot = options?.packageRoot ?? _defaultPackageRoot;
  if (!packageRoot) {
    throw new Error(
      "initDatabase requires a packageRoot \u2014 either pass it in options or call setDefaultPackageRoot() first"
    );
  }
  const dbDir = path4.dirname(dbPath);
  if (!fs3.existsSync(dbDir)) {
    fs3.mkdirSync(dbDir, { recursive: true });
  }
  const lease = acquireSharedDatabaseLease(dbPath);
  const db = new DatabaseSync(dbPath, { allowExtension: true });
  _leases.set(db, lease);
  const asset = resolveNativeAsset(packageRoot);
  db.loadExtension(asset.absolutePath);
  db.enableLoadExtension(false);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
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
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS vec_exchanges USING vec0(
      id TEXT PRIMARY KEY,
      embedding FLOAT[${EMBEDDING_DIMENSIONS}]
    )
  `);
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
  migrateSchema(db);
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
function insertExchange(db, exchange, embedding, _toolNames) {
  assertWritesAllowed();
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
    hasEmbedding ? EMBEDDING_VERSION : 0
  );
  db.prepare("DELETE FROM vec_exchanges WHERE id = ?").run(exchange.id);
  if (hasEmbedding) {
    db.prepare("INSERT INTO vec_exchanges (id, embedding) VALUES (?, ?)").run(
      exchange.id,
      new Uint8Array(new Float32Array(embedding).buffer)
    );
  }
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
        toolCall.timestamp
      );
    }
  }
}
function getAllExchanges(db) {
  const stmt = db.prepare(`SELECT id, archive_path as archivePath FROM exchanges`);
  return stmt.all();
}
function getFileLastIndexed(db, archivePath) {
  const stmt = db.prepare(`
    SELECT MAX(last_indexed) as lastIndexed
    FROM exchanges
    WHERE archive_path = ?
  `);
  const row = stmt.get(archivePath);
  return row.lastIndexed;
}
function deleteExchange(db, id) {
  assertWritesAllowed();
  db.prepare(`DELETE FROM vec_exchanges WHERE id = ?`).run(id);
  db.prepare(`DELETE FROM exchanges WHERE id = ?`).run(id);
}
function journalEntryFromRow(row) {
  let sections = [];
  try {
    const parsed = JSON.parse(row.sections);
    if (Array.isArray(parsed)) sections = parsed.filter((s) => typeof s === "string");
  } catch {
  }
  return {
    id: row.id,
    path: row.path,
    root: row.root ?? "",
    scope: row.scope === "project" ? "project" : "user",
    timestamp: row.timestamp,
    text: row.text,
    sections
  };
}
var JOURNAL_SELECT_COLUMNS = `
        j.id,
        j.path,
        j.root,
        j.scope,
        j.timestamp,
        j.text,
        j.sections`;
function upsertJournalEntry(db, entry, sourceMtimeMs, embedding = null) {
  assertWritesAllowed();
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
    hasEmbedding ? EMBEDDING_VERSION : 0
  );
  db.prepare("DELETE FROM vec_journal_entries WHERE id = ?").run(entry.id);
  if (hasEmbedding) {
    db.prepare("INSERT INTO vec_journal_entries (id, embedding) VALUES (?, ?)").run(
      entry.id,
      new Uint8Array(new Float32Array(embedding).buffer)
    );
  }
}
function deleteJournalEntry(db, id) {
  assertWritesAllowed();
  db.prepare("DELETE FROM vec_journal_entries WHERE id = ?").run(id);
  db.prepare("DELETE FROM journal_entries WHERE id = ?").run(id);
}
function getJournalIndexState(db, scope) {
  const rows = scope ? db.prepare(
    "SELECT id, path, root, source_mtime_ms, embedding_version FROM journal_entries WHERE scope = ?"
  ).all(scope) : db.prepare("SELECT id, path, root, source_mtime_ms, embedding_version FROM journal_entries").all();
  const state = /* @__PURE__ */ new Map();
  for (const row of rows) {
    state.set(row.id, {
      id: row.id,
      path: row.path,
      root: row.root ?? "",
      sourceMtimeMs: row.source_mtime_ms,
      embeddingVersion: row.embedding_version
    });
  }
  return state;
}
function countJournalEntries(db, scope) {
  const row = scope ? db.prepare("SELECT COUNT(*) AS c FROM journal_entries WHERE scope = ?").get(scope) : db.prepare("SELECT COUNT(*) AS c FROM journal_entries").get();
  return row.c;
}
function insertNode(db, node) {
  assertWritesAllowed();
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
    node.embeddingVersion
  );
}
function insertEdge(db, edge) {
  assertWritesAllowed();
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
    edge.metadata ? JSON.stringify(edge.metadata) : null
  );
}
function nodeFromRow(row) {
  return {
    id: row.id,
    nodeType: row.node_type,
    project: row.project ?? void 0,
    content: row.content,
    createdAt: row.created_at,
    supersededAt: row.superseded_at ?? void 0,
    embeddingVersion: row.embedding_version
  };
}
function getNode(db, id) {
  const row = db.prepare("SELECT * FROM memory_nodes WHERE id = ?").get(id);
  return row ? nodeFromRow(row) : null;
}
function edgeFromRow(row) {
  let metadata;
  if (row.metadata) {
    try {
      metadata = JSON.parse(row.metadata);
    } catch {
    }
  }
  return {
    id: row.id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    targetType: row.target_type,
    targetId: row.target_id,
    relation: row.relation,
    confidence: row.confidence,
    createdAt: row.created_at,
    createdBy: row.created_by ?? "system",
    metadata
  };
}
function getEdgesFrom(db, sourceType, sourceId) {
  const rows = db.prepare("SELECT * FROM memory_edges WHERE source_type = ? AND source_id = ?").all(sourceType, sourceId);
  return rows.map(edgeFromRow);
}
function getEdgesTo(db, targetType, targetId) {
  const rows = db.prepare("SELECT * FROM memory_edges WHERE target_type = ? AND target_id = ?").all(targetType, targetId);
  return rows.map(edgeFromRow);
}
function traceProvenance(db, type, id, depth, direction) {
  const results = [];
  const visited = /* @__PURE__ */ new Set();
  let frontier = [[type, id, 0]];
  while (frontier.length > 0) {
    const next = [];
    for (const [curType, curId, curDepth] of frontier) {
      if (curDepth >= depth) continue;
      const edges = direction === "causes" ? getEdgesTo(db, curType, curId) : getEdgesFrom(db, curType, curId);
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

export {
  DatabaseBusyError,
  readDatabaseEpoch,
  acquireSharedDatabaseLease,
  acquireDatabaseWriter,
  withDatabaseWriter,
  inspectLegacyDatabaseUsers,
  acquireExclusiveMaintenanceLease,
  assertWritableEpoch,
  withTransaction,
  withForeignKeysDisabled,
  EMBEDDING_VERSION,
  countStale,
  runMigrationBatch,
  resolveNativeAsset,
  RollbackStateError,
  readRollbackState,
  createRollbackState,
  advanceRollbackState,
  clearRollbackState,
  assertWritesAllowed,
  setDefaultPackageRoot,
  getDefaultPackageRoot,
  getDatabaseLease,
  closeDatabase,
  migrateSchema,
  migrateJournalRoot,
  migrateToolCallsCascade,
  initDatabase,
  insertExchange,
  getAllExchanges,
  getFileLastIndexed,
  deleteExchange,
  journalEntryFromRow,
  JOURNAL_SELECT_COLUMNS,
  upsertJournalEntry,
  deleteJournalEntry,
  getJournalIndexState,
  countJournalEntries,
  insertNode,
  insertEdge,
  getNode,
  getEdgesFrom,
  getEdgesTo,
  traceProvenance
};
