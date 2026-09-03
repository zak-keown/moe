import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDatabase, insertExchange, upsertJournalEntry } from "../src/db.js";
import {
  assessVectorReadiness,
  isVectorQueryAuthorized,
  vectorReadinessMessage,
} from "../src/vector-readiness.js";
import { openTestDatabase } from "./test-utils.js";

describe("vector-readiness", () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "readiness-test-"));
    dbPath = path.join(tmpDir, "test.db");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("reports ready when database is empty", () => {
    const db = openTestDatabase(dbPath);
    const readiness = assessVectorReadiness(db);
    expect(readiness).toEqual({
      state: "ready",
      total: 0,
      remaining: 0,
      fromVersion: 2,
      toVersion: 3,
    });
    expect(isVectorQueryAuthorized(db)).toBe(true);
    closeDatabase(db);
  });

  it("reports upgrading when exchanges have version < 3", () => {
    const db = openTestDatabase(dbPath);
    insertExchange(db, {
      id: "ex-1",
      project: "test",
      timestamp: new Date().toISOString(),
      userMessage: "hello",
      assistantMessage: "world",
      archivePath: "/fake/path.jsonl",
      lineStart: 1,
      lineEnd: 5,
    }, null);

    const readiness = assessVectorReadiness(db);
    expect(readiness.state).toBe("upgrading");
    expect(readiness.remaining).toBe(1);
    expect(readiness.total).toBe(1);
    expect(isVectorQueryAuthorized(db)).toBe(false);
    closeDatabase(db);
  });

  it("reports upgrading when journals have version < 3", () => {
    const db = openTestDatabase(dbPath);
    upsertJournalEntry(db, {
      id: "je-1",
      path: "/fake/journal.md",
      root: "/fake",
      scope: "project",
      timestamp: Date.now(),
      text: "some notes",
      sections: ["notes"],
    }, Date.now());

    const readiness = assessVectorReadiness(db);
    expect(readiness.state).toBe("upgrading");
    expect(readiness.remaining).toBe(1);
    closeDatabase(db);
  });

  it("keeps vector search closed until both families are current", () => {
    const db = openTestDatabase(dbPath);
    insertExchange(db, {
      id: "ex-1",
      project: "test",
      timestamp: new Date().toISOString(),
      userMessage: "hello",
      assistantMessage: "world",
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
      text: "some notes",
      sections: ["notes"],
    }, Date.now());

    const readiness = assessVectorReadiness(db);
    expect(readiness.state).toBe("upgrading");
    expect(readiness.remaining).toBe(2);
    expect(readiness.total).toBe(2);

    // Upgrade one
    db.prepare("UPDATE exchanges SET embedding_version = 3 WHERE id = 'ex-1'").run();
    const partial = assessVectorReadiness(db);
    expect(partial.state).toBe("upgrading");
    expect(partial.remaining).toBe(1);

    // Upgrade other
    db.prepare("UPDATE journal_entries SET embedding_version = 3 WHERE id = 'je-1'").run();
    const done = assessVectorReadiness(db);
    expect(done).toEqual({
      state: "ready",
      total: 2,
      remaining: 0,
      fromVersion: 2,
      toVersion: 3,
    });
    closeDatabase(db);
  });

  it("blocks on future-version records", () => {
    const db = openTestDatabase(dbPath);
    insertExchange(db, {
      id: "ex-future",
      project: "test",
      timestamp: new Date().toISOString(),
      userMessage: "from the future",
      assistantMessage: "indeed",
      archivePath: "/fake/path.jsonl",
      lineStart: 1,
      lineEnd: 5,
    }, null);
    db.prepare("UPDATE exchanges SET embedding_version = 99 WHERE id = 'ex-future'").run();

    const readiness = assessVectorReadiness(db);
    expect(readiness.state).toBe("blocked");
    expect(readiness.reason).toContain("newer runtime");
    closeDatabase(db);
  });

  it("generates human-readable messages", () => {
    expect(vectorReadinessMessage({ state: "ready", total: 10, remaining: 0, fromVersion: 2, toVersion: 3 }))
      .toContain("ready");
    expect(vectorReadinessMessage({ state: "upgrading", total: 10, remaining: 5, fromVersion: 2, toVersion: 3 }))
      .toContain("5/10");
    expect(vectorReadinessMessage({ state: "blocked", reason: "test", total: 1, remaining: 1, fromVersion: 2, toVersion: 3 }))
      .toContain("test");
  });
});
