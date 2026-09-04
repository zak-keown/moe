import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { insertExchange } from "../../src/db.js";
import type { ConversationExchange } from "../../src/types.js";
import { repairIndex, verifyIndex } from "../../src/verify.js";
import { openTestDatabase, suppressConsole } from "../test-utils.js";

// Suppress console output for clean test runs
suppressConsole();

/**
 * Split out of test/verify.test.ts. `repairIndex` calls `initEmbeddings()`, so
 * these two tests need the real encoder; the six verification tests next door do
 * not and stay in the CI-safe project.
 *
 * Both calls now pass `{ noSummaries: true }`. Upstream had no such option on
 * repair, so its only code path required live Claude auth — and because the
 * summarizer call and the indexing loop shared one try/catch, a summarizer
 * failure meant the exchanges were never indexed and the assertion below could
 * not pass. See src/verify.ts.
 */

describe("repairIndex", () => {
  const testDir = path.join(os.tmpdir(), `conversation-repair-test-${Date.now()}`);
  const projectsDir = path.join(testDir, ".claude", "projects");
  const archiveDir = path.join(testDir, ".config", "moe", "memory", "conversation-archive");
  const dbPath = path.join(testDir, ".config", "moe", "memory", "conversation-index", "db.sqlite");

  beforeEach(() => {
    // Create test directories
    fs.mkdirSync(path.join(testDir, ".config", "moe", "memory", "conversation-index"), {
      recursive: true,
    });
    fs.mkdirSync(projectsDir, { recursive: true });
    fs.mkdirSync(archiveDir, { recursive: true });

    // Override environment paths for testing
    process.env.TEST_PROJECTS_DIR = projectsDir;
    process.env.TEST_ARCHIVE_DIR = archiveDir;
    process.env.TEST_DB_PATH = dbPath;
  });

  afterEach(() => {
    // Clean up test directory
    fs.rmSync(testDir, { recursive: true, force: true });
    delete process.env.TEST_PROJECTS_DIR;
    delete process.env.TEST_ARCHIVE_DIR;
    delete process.env.TEST_DB_PATH;
  });

  it("deletes orphaned database entries during repair", async () => {
    // Initialize database with orphaned entry
    const db = openTestDatabase(dbPath);

    const exchange: ConversationExchange = {
      id: "orphan-repair-1",
      project: "deleted-project",
      timestamp: "2024-01-01T00:00:00Z",
      userMessage: "This conversation was deleted",
      assistantMessage: "But still in database",
      archivePath: path.join(archiveDir, "deleted-project", "deleted.jsonl"),
      lineStart: 1,
      lineEnd: 2,
    };

    const embedding = new Array(384).fill(0.1);
    insertExchange(db, exchange, embedding);
    db.close();

    // Verify it's there
    const dbBefore = openTestDatabase(dbPath);
    const beforeCount = dbBefore
      .prepare(`SELECT COUNT(*) as count FROM exchanges WHERE id = ?`)
      .get("orphan-repair-1") as { count: number };
    expect(beforeCount.count).toBe(1);
    dbBefore.close();

    // Run repair
    const issues = await verifyIndex();
    expect(issues.orphaned.length).toBe(1);
    await repairIndex(issues, { noSummaries: true });

    // Verify it's gone
    const dbAfter = openTestDatabase(dbPath);
    const afterCount = dbAfter
      .prepare(`SELECT COUNT(*) as count FROM exchanges WHERE id = ?`)
      .get("orphan-repair-1") as { count: number };
    expect(afterCount.count).toBe(0);
    dbAfter.close();
  });

  it("re-indexes outdated files during repair", { timeout: 30000 }, async () => {
    // Create conversation file with summary
    const projectArchive = path.join(archiveDir, "test-project");
    fs.mkdirSync(projectArchive, { recursive: true });

    const conversationPath = path.join(projectArchive, "outdated-repair.jsonl");
    const summaryPath = conversationPath.replace(".jsonl", "-summary.txt");

    // Create initial conversation
    const messages = [
      JSON.stringify({
        type: "user",
        message: { role: "user", content: "Hello" },
        timestamp: "2024-01-01T00:00:00Z",
      }),
      JSON.stringify({
        type: "assistant",
        message: { role: "assistant", content: "Hi there!" },
        timestamp: "2024-01-01T00:00:01Z",
      }),
    ];
    fs.writeFileSync(conversationPath, messages.join("\n"));
    fs.writeFileSync(summaryPath, "Old summary");

    // Index it
    const db = openTestDatabase(dbPath);
    const exchange: ConversationExchange = {
      id: "outdated-repair-1",
      project: "test-project",
      timestamp: "2024-01-01T00:00:00Z",
      userMessage: "Hello",
      assistantMessage: "Hi there!",
      archivePath: conversationPath,
      lineStart: 1,
      lineEnd: 2,
    };

    const embedding = new Array(384).fill(0.1);
    insertExchange(db, exchange, embedding);

    // Get the last_indexed timestamp
    const beforeRow = db
      .prepare(`SELECT last_indexed FROM exchanges WHERE id = ?`)
      .get("outdated-repair-1") as any;
    const beforeIndexed = beforeRow.last_indexed;
    db.close();

    // Wait a bit, then modify the file
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Update the conversation file (add new exchange)
    const updatedMessages = [
      ...messages,
      JSON.stringify({
        type: "user",
        message: { role: "user", content: "New message" },
        timestamp: "2024-01-01T00:00:02Z",
      }),
      JSON.stringify({
        type: "assistant",
        message: { role: "assistant", content: "New response" },
        timestamp: "2024-01-01T00:00:03Z",
      }),
    ];
    fs.writeFileSync(conversationPath, updatedMessages.join("\n"));

    // Verify detects outdated
    const issues = await verifyIndex();
    expect(issues.outdated.length).toBe(1);

    // Wait a bit to ensure different timestamp
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Run repair
    await repairIndex(issues, { noSummaries: true });

    // Verify it was re-indexed with new timestamp
    const dbAfter = openTestDatabase(dbPath);
    const afterRow = dbAfter
      .prepare(`SELECT MAX(last_indexed) as last_indexed FROM exchanges WHERE archive_path = ?`)
      .get(conversationPath) as any;
    expect(afterRow.last_indexed).toBeGreaterThan(beforeIndexed);

    // Verify no longer outdated
    const verifyAfter = await verifyIndex();
    expect(verifyAfter.outdated.length).toBe(0);

    dbAfter.close();
  });
});
