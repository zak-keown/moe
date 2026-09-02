import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initDatabase, insertExchange } from "../src/db.js";
import { EXCLUSION_MARKER } from "../src/sync.js";
import type { ConversationExchange } from "../src/types.js";
import { verifyIndex } from "../src/verify.js";
import { suppressConsole } from "./test-utils.js";

// Suppress console output for clean test runs
suppressConsole();

describe("verifyIndex", () => {
  const testDir = path.join(os.tmpdir(), `conversation-search-test-${Date.now()}`);
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

  it("should skip excluded projects", async () => {
    // Create two projects in archive
    const projectA = path.join(archiveDir, "project-a");
    const projectB = path.join(archiveDir, "project-b");
    fs.mkdirSync(projectA, { recursive: true });
    fs.mkdirSync(projectB, { recursive: true });

    // Create conversations (missing summaries to trigger detection)
    const messages = [
      JSON.stringify({
        type: "user",
        message: { role: "user", content: "Hello" },
        timestamp: "2024-01-01T00:00:00Z",
      }),
      JSON.stringify({
        type: "assistant",
        message: { role: "assistant", content: "Hi" },
        timestamp: "2024-01-01T00:00:01Z",
      }),
    ];
    fs.writeFileSync(path.join(projectA, "conv1.jsonl"), messages.join("\n"));
    fs.writeFileSync(path.join(projectB, "conv2.jsonl"), messages.join("\n"));

    // Exclude project-a
    process.env.CONVERSATION_SEARCH_EXCLUDE_PROJECTS = "project-a";
    const result = await verifyIndex();
    delete process.env.CONVERSATION_SEARCH_EXCLUDE_PROJECTS;

    // Only project-b should be checked (missing summary)
    expect(result.missing.length).toBe(1);
    expect(result.missing[0]?.path).toContain("project-b");
  });

  it("detects missing summaries", async () => {
    // Create a test conversation file without a summary
    const projectArchive = path.join(archiveDir, "test-project");
    fs.mkdirSync(projectArchive, { recursive: true });

    const conversationPath = path.join(projectArchive, "test-conversation.jsonl");

    // Create proper JSONL format (one JSON object per line)
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

    const result = await verifyIndex();

    expect(result.missing.length).toBe(1);
    expect(result.missing[0]?.path).toBe(conversationPath);
    expect(result.missing[0]?.reason).toBe("No summary file");
  });

  it("flags conversations with an error sentinel as missing so repair re-attempts them (#96)", async () => {
    const { formatErrorSentinel } = await import("../src/summary-sentinel.js");
    const projectArchive = path.join(archiveDir, "test-project");
    fs.mkdirSync(projectArchive, { recursive: true });

    const conversationPath = path.join(projectArchive, "errored-conversation.jsonl");
    const summaryPath = conversationPath.replace(".jsonl", "-summary.txt");
    const messages = [
      JSON.stringify({
        type: "user",
        message: { role: "user", content: "Hi" },
        timestamp: "2024-01-01T00:00:00Z",
      }),
      JSON.stringify({
        type: "assistant",
        message: { role: "assistant", content: "Hello" },
        timestamp: "2024-01-01T00:00:01Z",
      }),
    ];
    fs.writeFileSync(conversationPath, messages.join("\n"));
    fs.writeFileSync(summaryPath, formatErrorSentinel(new Error("Transient outage")), "utf-8");

    const result = await verifyIndex();
    expect(result.missing.length).toBe(1);
    expect(result.missing[0]?.path).toBe(conversationPath);
    expect(result.missing[0]?.reason).toMatch(/error sentinel/i);
  });

  it("does not flag conversations with real summaries as missing", async () => {
    const projectArchive = path.join(archiveDir, "test-project");
    fs.mkdirSync(projectArchive, { recursive: true });

    const conversationPath = path.join(projectArchive, "summarized.jsonl");
    const summaryPath = conversationPath.replace(".jsonl", "-summary.txt");
    const messages = [
      JSON.stringify({
        type: "user",
        message: { role: "user", content: "Hi" },
        timestamp: "2024-01-01T00:00:00Z",
      }),
      JSON.stringify({
        type: "assistant",
        message: { role: "assistant", content: "Hello" },
        timestamp: "2024-01-01T00:00:01Z",
      }),
    ];
    fs.writeFileSync(conversationPath, messages.join("\n"));
    fs.writeFileSync(summaryPath, "A real summary of the conversation.", "utf-8");

    const result = await verifyIndex();
    expect(result.missing.length).toBe(0);
  });

  it("does not flag a DO-NOT-INDEX conversation as missing (CR-075/CR-076)", async () => {
    // This is exactly what sync.ts produces for a marked conversation: it is
    // archived (copied) but deliberately never summarized, because its
    // summarize gate is `shouldQueueForSummary(summaryPath) &&
    // !shouldSkipConversation(destFile)`. No summary file exists — the same
    // shape verifyIndex otherwise reports as "missing".
    const projectArchive = path.join(archiveDir, "test-project");
    fs.mkdirSync(projectArchive, { recursive: true });

    const conversationPath = path.join(projectArchive, "marked-conversation.jsonl");
    const messages = [
      JSON.stringify({
        type: "user",
        message: { role: "user", content: `Please don't index this. ${EXCLUSION_MARKER}` },
        timestamp: "2024-01-01T00:00:00Z",
      }),
      JSON.stringify({
        type: "assistant",
        message: { role: "assistant", content: "Understood." },
        timestamp: "2024-01-01T00:00:01Z",
      }),
    ];
    fs.writeFileSync(conversationPath, messages.join("\n"));
    // Deliberately no summary file.

    const result = await verifyIndex();

    expect(result.missing.some((m) => m.path === conversationPath)).toBe(false);
    // Still tracked as found, so it is never separately reported as orphaned.
    expect(result.orphaned.some((o) => o.path === conversationPath)).toBe(false);
  });

  it("detects orphaned database entries", async () => {
    // Initialize database
    const db = initDatabase();

    // Create an exchange in the database
    const exchange: ConversationExchange = {
      id: "orphan-id-1",
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

    // Verify detects orphaned entry (file doesn't exist)
    const result = await verifyIndex();

    expect(result.orphaned.length).toBe(1);
    expect(result.orphaned[0]?.uuid).toBe("orphan-id-1");
    expect(result.orphaned[0]?.path).toBe(exchange.archivePath);
  });

  it("detects outdated files (file modified after last_indexed)", async () => {
    // Create conversation file with summary
    const projectArchive = path.join(archiveDir, "test-project");
    fs.mkdirSync(projectArchive, { recursive: true });

    const conversationPath = path.join(projectArchive, "updated-conversation.jsonl");
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
    fs.writeFileSync(summaryPath, "Test summary");

    // Index it
    const db = initDatabase();
    const exchange: ConversationExchange = {
      id: "updated-id-1",
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
    const row = db
      .prepare(`SELECT last_indexed FROM exchanges WHERE id = ?`)
      .get("updated-id-1") as any;
    const lastIndexed = row.last_indexed;
    db.close();

    // Wait a bit, then modify the file
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Update the conversation file
    const updatedMessages = [
      ...messages,
      JSON.stringify({
        type: "user",
        message: { role: "user", content: "New message" },
        timestamp: "2024-01-01T00:00:02Z",
      }),
    ];
    fs.writeFileSync(conversationPath, updatedMessages.join("\n"));

    // Verify detects outdated file
    const result = await verifyIndex();

    expect(result.outdated.length).toBe(1);
    expect(result.outdated[0]?.path).toBe(conversationPath);
    expect(result.outdated[0]?.dbTime).toBe(lastIndexed);
    expect(result.outdated[0]?.fileTime).toBeGreaterThan(lastIndexed);
  });

  // Note: Parser is resilient to malformed JSON - it skips bad lines
  // Corruption detection would require file system errors or permission issues
  // which are harder to test. Skipping for now as missing summaries is the
  // primary use case for verification.
});
