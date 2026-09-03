import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MemoryDatabase } from "../src/db.js";
import {
  acquireMigrationLock,
  EMBEDDING_VERSION,
  pickStaleBatch,
  recordReembedded,
  releaseMigrationLock,
  runMigrationBatch,
} from "../src/embedding-migration.js";
import { resolveNativeAsset } from "../src/native-assets.js";
import { openTestDatabase, TEST_PACKAGE_ROOT } from "./test-utils.js";

describe("embedding migration", () => {
  let testDir: string;
  let dbPath: string;
  let lockPath: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "em-mig-test-"));
    dbPath = join(testDir, "test.db");
    lockPath = join(testDir, ".migrate.lock");
    process.env.TEST_DB_PATH = dbPath;
    process.env.MOE_MEMORY_CONFIG_DIR = testDir;
  });

  afterEach(() => {
    delete process.env.TEST_DB_PATH;
    delete process.env.MOE_MEMORY_CONFIG_DIR;
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {}
  });

  function openDb(): MemoryDatabase {
    return openTestDatabase(dbPath);
  }

  function openRawDb(): MemoryDatabase {
    const db = new DatabaseSync(dbPath, { allowExtension: true });
    const asset = resolveNativeAsset(TEST_PACKAGE_ROOT);
    db.loadExtension(asset.absolutePath);
    db.enableLoadExtension(false);
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA foreign_keys = ON");
    return db;
  }

  function seedExchanges(db: MemoryDatabase, n: number, version: number = 0): string[] {
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
        embedding_version INTEGER NOT NULL DEFAULT 0
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS vec_exchanges USING vec0(id TEXT PRIMARY KEY, embedding FLOAT[384]);
    `);
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const id = `ex-${i}`;
      ids.push(id);
      db.prepare(
        `INSERT INTO exchanges (id, project, timestamp, user_message, assistant_message, archive_path, line_start, line_end, embedding_version)
         VALUES (?, 'p', '2026-01-01T00:00:00Z', ?, ?, '/x.jsonl', 1, 2, ?)`,
      ).run(id, `user message ${i}`, `assistant reply ${i}`, version);
      const dummy = new Float32Array(384);
      for (let k = 0; k < 384; k++) dummy[k] = Math.random();
      db.prepare(`INSERT INTO vec_exchanges (id, embedding) VALUES (?, ?)`).run(
        id,
        new Uint8Array(dummy.buffer),
      );
    }
    return ids;
  }

  it("exposes EMBEDDING_VERSION as a positive integer source-of-truth", () => {
    expect(typeof EMBEDDING_VERSION).toBe("number");
    expect(EMBEDDING_VERSION).toBeGreaterThanOrEqual(1);
  });

  it("acquireMigrationLock succeeds when no lock exists, then fails for a second caller", () => {
    const first = acquireMigrationLock(lockPath);
    expect(first).not.toBeNull();
    const second = acquireMigrationLock(lockPath);
    expect(second).toBeNull();
    releaseMigrationLock(first!);
    // After release the lock is available again
    const third = acquireMigrationLock(lockPath);
    expect(third).not.toBeNull();
    releaseMigrationLock(third!);
  });

  it("acquireMigrationLock claims a stale lock from a dead process", () => {
    // Simulate a stale lock: write a PID that does not exist.
    mkdirSync(testDir, { recursive: true });
    const FAKE_PID = 999999;
    writeFileSync(lockPath, String(FAKE_PID), "utf-8");
    const handle = acquireMigrationLock(lockPath);
    expect(handle).not.toBeNull();
    releaseMigrationLock(handle!);
  });

  it("pickStaleBatch returns rows whose embedding_version is less than the current version, capped by limit", () => {
    const db = openRawDb();
    db.exec(`
      CREATE TABLE exchanges (
        id TEXT PRIMARY KEY,
        project TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        user_message TEXT NOT NULL,
        assistant_message TEXT NOT NULL,
        archive_path TEXT NOT NULL,
        line_start INTEGER NOT NULL,
        line_end INTEGER NOT NULL,
        embedding_version INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE tool_calls (id TEXT PRIMARY KEY, exchange_id TEXT, tool_name TEXT);
    `);
    for (let i = 0; i < 5; i++) {
      db.prepare(
        `INSERT INTO exchanges (id, project, timestamp, user_message, assistant_message, archive_path, line_start, line_end, embedding_version) VALUES (?, 'p', 't', 'u', 'a', '/x', 1, 2, 0)`,
      ).run(`stale-${i}`);
    }
    for (let i = 0; i < 3; i++) {
      db.prepare(
        `INSERT INTO exchanges (id, project, timestamp, user_message, assistant_message, archive_path, line_start, line_end, embedding_version) VALUES (?, 'p', 't', 'u', 'a', '/x', 1, 2, ?)`,
      ).run(`fresh-${i}`, EMBEDDING_VERSION);
    }
    const batch = pickStaleBatch(db, 3);
    expect(batch.length).toBe(3);
    for (const row of batch) {
      expect(row.id.startsWith("stale-")).toBe(true);
    }
    db.close();
  });

  it("runMigrationBatch is a no-op when another process already holds the lock", async () => {
    const db = openRawDb();
    db.exec(`
      CREATE TABLE exchanges (
        id TEXT PRIMARY KEY,
        project TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        user_message TEXT NOT NULL,
        assistant_message TEXT NOT NULL,
        archive_path TEXT NOT NULL,
        line_start INTEGER NOT NULL,
        line_end INTEGER NOT NULL,
        embedding_version INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE tool_calls (id TEXT PRIMARY KEY, exchange_id TEXT, tool_name TEXT);
    `);
    db.prepare(
      `INSERT INTO exchanges (id, project, timestamp, user_message, assistant_message, archive_path, line_start, line_end, embedding_version) VALUES ('x', 'p', 't', 'u', 'a', '/x', 1, 2, 0)`,
    ).run();

    // Pre-acquire the lock as if another process owns it.
    const lockPath = join(testDir, ".embedding-migration.lock");
    const pre = acquireMigrationLock(lockPath);
    expect(pre).not.toBeNull();

    const fakeEmbed = async () => Array.from({ length: 384 }, () => 0);
    const result = await runMigrationBatch(db, testDir, 10, fakeEmbed);
    expect(result).toBe(0);
    // Still stale; nothing was written.
    const row = db.prepare(`SELECT embedding_version FROM exchanges WHERE id = 'x'`).get() as {
      embedding_version: number;
    };
    expect(row.embedding_version).toBe(0);

    releaseMigrationLock(pre!);
    db.close();
  });

  it("recordReembedded updates vec_exchanges embedding and stamps embedding_version on the row", () => {
    const db = openDb();
    seedExchanges(db, 1, 0);
    const newVec = Array.from({ length: 384 }, () => 0.5);
    recordReembedded(db, "ex-0", newVec);
    const row = db.prepare("SELECT embedding_version FROM exchanges WHERE id = ?").get("ex-0") as {
      embedding_version: number;
    };
    expect(row.embedding_version).toBe(EMBEDDING_VERSION);
    // vec_exchanges row should have been replaced (same id, new embedding bytes).
    const vec = db.prepare("SELECT id FROM vec_exchanges WHERE id = ?").get("ex-0");
    expect(vec).toBeDefined();
    db.close();
  });
});
