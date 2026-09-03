import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { countStale, EMBEDDING_VERSION, runMigrationBatch } from "../../src/embedding-migration.js";
import { generateExchangeEmbedding, initEmbeddings } from "../../src/embeddings.js";
import { openTestDatabase } from "../test-utils.js";

/**
 * Split out of test/embedding-migration.test.ts: this is the one test in that
 * suite that needs the real encoder, and the other six run offline. Exiling the
 * whole file would have cost the lock, batching and version-stamping coverage
 * from `pnpm test`.
 */
describe("embedding migration — real encoder", () => {
  let testDir: string;
  let dbPath: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "moe-memory-mig-encoder-"));
    dbPath = join(testDir, "test.db");
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

  it("re-embeds stale rows with the real encoder, advances embedding_version, and is resumable across batches", async () => {
    const db = openTestDatabase(dbPath);
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
      CREATE VIRTUAL TABLE vec_exchanges USING vec0(id TEXT PRIMARY KEY, embedding FLOAT[384]);
    `);
    const N = 5;
    for (let i = 0; i < N; i++) {
      db.prepare(
        `INSERT INTO exchanges (id, project, timestamp, user_message, assistant_message, archive_path, line_start, line_end, embedding_version) VALUES (?, 'p', 't', ?, ?, '/x', 1, 2, 0)`,
      ).run(`r-${i}`, `question ${i} about feature`, `answer ${i} explaining the feature`);
      const dummy = new Float32Array(384);
      db.prepare("INSERT INTO vec_exchanges (id, embedding) VALUES (?, ?)").run(
        `r-${i}`,
        new Uint8Array(dummy.buffer),
      );
    }

    expect(countStale(db)).toBe(N);

    await initEmbeddings();
    // Process in two batches to verify resumability.
    const first = await runMigrationBatch(db, testDir, 3, generateExchangeEmbedding);
    expect(first).toBe(3);
    expect(countStale(db)).toBe(N - 3);

    const second = await runMigrationBatch(db, testDir, 10, generateExchangeEmbedding);
    expect(second).toBe(N - 3);
    expect(countStale(db)).toBe(0);

    const versions = db.prepare("SELECT embedding_version FROM exchanges").all() as Array<{
      embedding_version: number;
    }>;
    expect(versions.every((v) => v.embedding_version === EMBEDDING_VERSION)).toBe(true);

    db.close();
  });
});
