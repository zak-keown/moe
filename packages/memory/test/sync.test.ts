import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { syncConversations } from "../src/sync.js";

describe("sync command", () => {
  let testDir: string;
  let sourceDir: string;
  let destDir: string;
  let dbPath: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "moe-memory-sync-test-"));
    sourceDir = join(testDir, "source");
    destDir = join(testDir, "dest");
    dbPath = join(testDir, "test.db");

    // Create source directory
    mkdirSync(sourceDir, { recursive: true });

    // Set DB path for sync to use
    process.env.TEST_DB_PATH = dbPath;
  });

  afterEach(() => {
    delete process.env.TEST_DB_PATH;
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it("should copy new files from source to destination", async () => {
    mkdirSync(join(sourceDir, "project-a"), { recursive: true });
    const testFile = join(sourceDir, "project-a", "test.jsonl");
    writeFileSync(testFile, "test content", "utf-8");

    const result = await syncConversations(sourceDir, destDir, { skipIndex: true });

    expect(result.copied).toBe(1);
    expect(result.skipped).toBe(0);

    // Verify file was copied
    const destFile = join(destDir, "project-a", "test.jsonl");
    expect(statSync(destFile).isFile()).toBe(true);
  });

  it("should skip files that have not been modified", async () => {
    mkdirSync(join(sourceDir, "project-a"), { recursive: true });
    const testFile = join(sourceDir, "project-a", "test.jsonl");
    writeFileSync(testFile, "test content", "utf-8");

    // First sync - should copy
    await syncConversations(sourceDir, destDir, { skipIndex: true });

    // Second sync - should skip (same mtime)
    const result = await syncConversations(sourceDir, destDir, { skipIndex: true });

    expect(result.copied).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it("should copy files that were modified after previous sync", async () => {
    mkdirSync(join(sourceDir, "project-a"), { recursive: true });
    const testFile = join(sourceDir, "project-a", "test.jsonl");
    writeFileSync(testFile, "version 1", "utf-8");

    // First sync
    await syncConversations(sourceDir, destDir, { skipIndex: true });

    // Modify source file (update mtime)
    const now = new Date();
    const future = new Date(now.getTime() + 5000);
    writeFileSync(testFile, "version 2", "utf-8");
    utimesSync(testFile, future, future);

    // Second sync - should copy updated file
    const result = await syncConversations(sourceDir, destDir, { skipIndex: true });

    expect(result.copied).toBe(1);
    expect(result.skipped).toBe(0);
  });

  it("should handle multiple projects", async () => {
    mkdirSync(join(sourceDir, "project-a"), { recursive: true });
    mkdirSync(join(sourceDir, "project-b"), { recursive: true });
    mkdirSync(join(sourceDir, "project-c"), { recursive: true });
    writeFileSync(join(sourceDir, "project-a", "test1.jsonl"), "content 1", "utf-8");
    writeFileSync(join(sourceDir, "project-b", "test2.jsonl"), "content 2", "utf-8");
    writeFileSync(join(sourceDir, "project-c", "test3.jsonl"), "content 3", "utf-8");

    const result = await syncConversations(sourceDir, destDir, { skipIndex: true });

    expect(result.copied).toBe(3);
    expect(result.skipped).toBe(0);
  });

  it("should only sync jsonl files", async () => {
    mkdirSync(join(sourceDir, "project-a"), { recursive: true });
    writeFileSync(join(sourceDir, "project-a", "test.jsonl"), "good", "utf-8");
    writeFileSync(join(sourceDir, "project-a", "test.txt"), "bad", "utf-8");
    writeFileSync(join(sourceDir, "project-a", "test.json"), "bad", "utf-8");

    const result = await syncConversations(sourceDir, destDir, { skipIndex: true });

    expect(result.copied).toBe(1);
  });

  it("should skip excluded projects", async () => {
    mkdirSync(join(sourceDir, "project-a"), { recursive: true });
    mkdirSync(join(sourceDir, "project-b"), { recursive: true });
    writeFileSync(join(sourceDir, "project-a", "test1.jsonl"), "content", "utf-8");
    writeFileSync(join(sourceDir, "project-b", "test2.jsonl"), "content", "utf-8");

    process.env.CONVERSATION_SEARCH_EXCLUDE_PROJECTS = "project-a";
    const result = await syncConversations(sourceDir, destDir, { skipIndex: true });
    delete process.env.CONVERSATION_SEARCH_EXCLUDE_PROJECTS;

    expect(result.copied).toBe(1);
    expect(existsSync(join(destDir, "project-a"))).toBe(false);
    expect(existsSync(join(destDir, "project-b", "test2.jsonl"))).toBe(true);
  });

  it("writes an empty summary sentinel for zero-exchange files so they do not re-queue forever", async () => {
    mkdirSync(join(sourceDir, "project-a"), { recursive: true });

    // Stage more than summaryLimit (default 10) zero-exchange files — file-history-snapshot is a metadata record the parser drops.
    const zeroExchangeFileCount = 12;
    for (let i = 0; i < zeroExchangeFileCount; i++) {
      const id = `1111aaaa-1111-1111-1111-${String(i).padStart(12, "0")}`;
      const content = JSON.stringify({
        type: "file-history-snapshot",
        sessionId: id,
        uuid: `meta-${i}`,
        timestamp: "2025-10-01T12:00:00Z",
      });
      writeFileSync(join(sourceDir, "project-a", `${id}.jsonl`), content, "utf-8");
    }

    // First sync: sentinel up to summaryLimit (default 10).
    const r1 = await syncConversations(sourceDir, destDir, { skipIndex: true });
    expect(r1.copied).toBe(zeroExchangeFileCount);
    expect(r1.summarized).toBe(0);

    const sentinelsAfter1 = readdirSync(join(destDir, "project-a")).filter((f) =>
      f.endsWith("-summary.txt"),
    );
    expect(sentinelsAfter1.length).toBeGreaterThanOrEqual(10);

    // Sentinels must be empty — that's how future syncs know to skip the file.
    for (const s of sentinelsAfter1) {
      expect(statSync(join(destDir, "project-a", s)).size).toBe(0);
    }

    // Second sync drains the rest. Before the fix the same 10 would re-queue forever.
    const r2 = await syncConversations(sourceDir, destDir, { skipIndex: true });
    expect(r2.summarized).toBe(0);

    const sentinelsAfter2 = readdirSync(join(destDir, "project-a")).filter((f) =>
      f.endsWith("-summary.txt"),
    );
    expect(sentinelsAfter2.length).toBe(zeroExchangeFileCount);
  });
});
