import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EXCLUSION_MARKER, LEGACY_EXCLUSION_MARKER, syncConversations } from "../../src/sync.js";

/**
 * Split out of test/sync.test.ts: every other test there passes
 * `skipIndex: true`, so this is the only one that reaches the encoder.
 *
 * Both DO-NOT-INDEX markers are covered. The upstream one is honoured
 * permanently — see src/sync.ts. Renaming it without keeping the old form would
 * silently start indexing conversations users had already opted out of, with no
 * error anywhere.
 */
describe("sync — indexing", () => {
  let testDir: string;
  let sourceDir: string;
  let destDir: string;
  let dbPath: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "moe-memory-sync-index-test-"));
    sourceDir = join(testDir, "source");
    destDir = join(testDir, "dest");
    dbPath = join(testDir, "test.db");
    mkdirSync(sourceDir, { recursive: true });
    process.env.TEST_DB_PATH = dbPath;
  });

  afterEach(() => {
    delete process.env.TEST_DB_PATH;
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {}
  });

  function seedDb(): void {
    const db = new Database(dbPath);
    sqliteVec.load(db);
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
        last_indexed INTEGER
      )
    `);
    db.exec(`
      CREATE VIRTUAL TABLE vec_exchanges USING vec0(
        id TEXT PRIMARY KEY,
        embedding FLOAT[384]
      )
    `);
    db.close();
  }

  function conversation(uuidBase: string, content: string): string {
    return (
      JSON.stringify({
        type: "user",
        uuid: `${uuidBase}-1`,
        parentUuid: null,
        timestamp: "2025-10-01T12:00:00Z",
        isSidechain: false,
        message: { role: "user", content },
      }) +
      "\n" +
      JSON.stringify({
        type: "assistant",
        uuid: `${uuidBase}-2`,
        parentUuid: `${uuidBase}-1`,
        timestamp: "2025-10-01T12:00:01Z",
        isSidechain: false,
        message: { role: "assistant", content: "A reply worth indexing" },
      })
    );
  }

  it("skips indexing conversations carrying the Moe Memory DO NOT INDEX marker", async () => {
    mkdirSync(join(sourceDir, "project-a"), { recursive: true });
    writeFileSync(
      join(sourceDir, "project-a", "marked.jsonl"),
      conversation("marked", `${EXCLUSION_MARKER}\nSummarize this conversation...`),
      "utf-8",
    );
    writeFileSync(
      join(sourceDir, "project-a", "normal.jsonl"),
      conversation("normal", "Normal question"),
      "utf-8",
    );
    seedDb();

    const result = await syncConversations(sourceDir, destDir);

    expect(result.copied).toBe(2);
    expect(result.indexed).toBe(1);

    const dbCheck = new Database(dbPath, { readonly: true });
    const count = dbCheck.prepare("SELECT COUNT(*) as count FROM exchanges").get() as {
      count: number;
    };
    dbCheck.close();
    expect(count.count).toBe(1);
  });

  it("still honours the upstream episodic-memory marker, so existing opt-outs keep working", async () => {
    mkdirSync(join(sourceDir, "project-b"), { recursive: true });
    writeFileSync(
      join(sourceDir, "project-b", "legacy.jsonl"),
      conversation("legacy", `${LEGACY_EXCLUSION_MARKER}\nSummarize this conversation...`),
      "utf-8",
    );
    seedDb();

    const result = await syncConversations(sourceDir, destDir);

    expect(result.copied).toBe(1);
    expect(result.indexed).toBe(0);

    const dbCheck = new Database(dbPath, { readonly: true });
    const count = dbCheck.prepare("SELECT COUNT(*) as count FROM exchanges").get() as {
      count: number;
    };
    dbCheck.close();
    expect(count.count).toBe(0);
  });
});
