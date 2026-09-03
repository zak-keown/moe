import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDatabase, insertExchange, upsertJournalEntry } from "../src/db.js";
import { createEmbeddingCoordinator } from "../src/embedding-coordinator.js";
import { assessVectorReadiness } from "../src/vector-readiness.js";
import { fakeEmbed, openTestDatabase } from "./test-utils.js";

describe("migration-race", () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "migration-race-"));
    dbPath = path.join(tmpDir, "test.db");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("keeps vector search closed until exchanges and journals are current", async () => {
    const db = openTestDatabase(dbPath);
    insertExchange(db, {
      id: "ex-1",
      project: "test",
      timestamp: new Date().toISOString(),
      userMessage: "atomic swap semantics",
      assistantMessage: "explained here",
      archivePath: "/fake/path.jsonl",
      lineStart: 1,
      lineEnd: 5,
    }, null);
    upsertJournalEntry(db, {
      id: "je-1",
      path: "/fake/journal.md",
      root: "/fake",
      scope: "project",
      timestamp: Date.now(),
      text: "notes on atomic swaps",
      sections: ["notes"],
    }, Date.now());

    const embed = fakeEmbed();
    const coordinator = createEmbeddingCoordinator({
      db,
      dbPath,
      embedFn: async (text: string) => new Float32Array(await embed(text)),
      snapshotTaken: true,
      capsuleVerified: true,
    });

    const initial = await coordinator.ensureReady();
    expect(initial).toMatchObject({ state: "upgrading", remaining: 2 });

    await coordinator.runBatch(2);

    const final = await coordinator.ensureReady();
    expect(final).toEqual({
      state: "ready",
      total: 2,
      remaining: 0,
      fromVersion: 2,
      toVersion: 3,
    });

    closeDatabase(db);
  });

  it("handles partial resume — reprocesses only remaining items", async () => {
    const db = openTestDatabase(dbPath);
    insertExchange(db, {
      id: "ex-1",
      project: "test",
      timestamp: new Date().toISOString(),
      userMessage: "first",
      assistantMessage: "message",
      archivePath: "/fake/a.jsonl",
      lineStart: 1,
      lineEnd: 5,
    }, null);
    insertExchange(db, {
      id: "ex-2",
      project: "test",
      timestamp: new Date().toISOString(),
      userMessage: "second",
      assistantMessage: "message",
      archivePath: "/fake/b.jsonl",
      lineStart: 1,
      lineEnd: 5,
    }, null);

    const embed = fakeEmbed();
    const coordinator = createEmbeddingCoordinator({
      db,
      dbPath,
      embedFn: async (text: string) => new Float32Array(await embed(text)),
      snapshotTaken: true,
      capsuleVerified: true,
    });

    // Process first batch of 1
    await coordinator.runBatch(1);
    const mid = await coordinator.ensureReady();
    expect(mid).toMatchObject({ state: "upgrading", remaining: 1 });

    // Process second batch
    await coordinator.runBatch(1);
    const done = await coordinator.ensureReady();
    expect(done).toMatchObject({ state: "ready", remaining: 0 });

    closeDatabase(db);
  });

  it("blocks when capsule is not verified", async () => {
    const db = openTestDatabase(dbPath);
    insertExchange(db, {
      id: "ex-1",
      project: "test",
      timestamp: new Date().toISOString(),
      userMessage: "test",
      assistantMessage: "test",
      archivePath: "/fake/a.jsonl",
      lineStart: 1,
      lineEnd: 5,
    }, null);

    const embed = fakeEmbed();
    const coordinator = createEmbeddingCoordinator({
      db,
      dbPath,
      embedFn: async (text: string) => new Float32Array(await embed(text)),
      snapshotTaken: false,
      capsuleVerified: false,
    });

    const status = await coordinator.ensureReady();
    expect(status.state).toBe("blocked");
    expect((status as any).reason).toContain("capsule");

    closeDatabase(db);
  });

  it("reports blocked for future-version database", async () => {
    const db = openTestDatabase(dbPath);
    insertExchange(db, {
      id: "ex-future",
      project: "test",
      timestamp: new Date().toISOString(),
      userMessage: "from future",
      assistantMessage: "runtime",
      archivePath: "/fake/a.jsonl",
      lineStart: 1,
      lineEnd: 5,
    }, null);
    db.prepare("UPDATE exchanges SET embedding_version = 99 WHERE id = 'ex-future'").run();

    const readiness = assessVectorReadiness(db);
    expect(readiness.state).toBe("blocked");
    expect(readiness.reason).toContain("newer runtime");

    closeDatabase(db);
  });

  it("handles empty database gracefully", async () => {
    const db = openTestDatabase(dbPath);
    const embed = fakeEmbed();
    const coordinator = createEmbeddingCoordinator({
      db,
      dbPath,
      embedFn: async (text: string) => new Float32Array(await embed(text)),
      snapshotTaken: true,
      capsuleVerified: true,
    });

    const result = await coordinator.ensureReady();
    expect(result).toMatchObject({ state: "ready", total: 0, remaining: 0 });

    closeDatabase(db);
  });

  it("processes journal-only stale corpus", async () => {
    const db = openTestDatabase(dbPath);
    upsertJournalEntry(db, {
      id: "je-1",
      path: "/fake/a.md",
      root: "/fake",
      scope: "user",
      timestamp: Date.now(),
      text: "journal only",
      sections: [],
    }, Date.now());

    const embed = fakeEmbed();
    const coordinator = createEmbeddingCoordinator({
      db,
      dbPath,
      embedFn: async (text: string) => new Float32Array(await embed(text)),
      snapshotTaken: true,
      capsuleVerified: true,
    });

    const initial = await coordinator.ensureReady();
    expect(initial).toMatchObject({ state: "upgrading", remaining: 1 });

    await coordinator.runBatch(10);
    const done = await coordinator.ensureReady();
    expect(done).toMatchObject({ state: "ready", remaining: 0 });

    closeDatabase(db);
  });
});
