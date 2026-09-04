import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  collectSnapshotSources,
  createDatabaseSnapshot,
  type SnapshotSourceRecord,
  validateSnapshotSources,
  verifySnapshot,
} from "../src/database-snapshot.js";
import { closeDatabase, getDatabaseLease, insertExchange } from "../src/db.js";
import { openTestDatabase } from "./test-utils.js";

describe("database-snapshot", () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "snapshot-test-"));
    dbPath = path.join(tmpDir, "test.db");
  });

  afterEach(async () => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("validateSnapshotSources", () => {
    it("accepts valid unique sources", () => {
      const sources: SnapshotSourceRecord[] = [
        {
          family: "transcript",
          identity: "a",
          canonicalPath: "/data/a.jsonl",
          sha256: "a".repeat(64),
        },
        { family: "journal", identity: "b", canonicalPath: "/data/b.md", sha256: "b".repeat(64) },
      ];
      expect(() => validateSnapshotSources(sources)).not.toThrow();
    });

    it("rejects duplicate identities", () => {
      const sources: SnapshotSourceRecord[] = [
        {
          family: "transcript",
          identity: "a",
          canonicalPath: "/data/a.jsonl",
          sha256: "a".repeat(64),
        },
        {
          family: "transcript",
          identity: "a",
          canonicalPath: "/data/b.jsonl",
          sha256: "b".repeat(64),
        },
      ];
      expect(() => validateSnapshotSources(sources)).toThrow(/Duplicate/);
    });

    it("rejects path escapes", () => {
      const sources: SnapshotSourceRecord[] = [
        {
          family: "transcript",
          identity: "a",
          canonicalPath: "/data/../etc/passwd",
          sha256: "a".repeat(64),
        },
      ];
      expect(() => validateSnapshotSources(sources)).toThrow(/escape/);
    });

    it("rejects invalid SHA-256", () => {
      const sources: SnapshotSourceRecord[] = [
        { family: "transcript", identity: "a", canonicalPath: "/data/a.jsonl", sha256: "short" },
      ];
      expect(() => validateSnapshotSources(sources)).toThrow(/SHA-256/);
    });
  });

  describe("collectSnapshotSources", () => {
    it("collects exchanges and journals sorted by identity", () => {
      const db = openTestDatabase(dbPath);
      insertExchange(
        db,
        {
          id: "z-exchange",
          project: "test",
          timestamp: new Date().toISOString(),
          userMessage: "hello",
          assistantMessage: "hi",
          archivePath: path.join(tmpDir, "archive.jsonl"),
          lineStart: 1,
          lineEnd: 10,
        },
        null,
      );
      fs.writeFileSync(path.join(tmpDir, "archive.jsonl"), "test content");

      const sources = collectSnapshotSources(db);
      expect(sources.length).toBe(1);
      expect(sources[0]?.family).toBe("transcript");
      expect(sources[0]?.identity).toBe("z-exchange");
      expect(sources[0]?.sha256).toHaveLength(64);
      closeDatabase(db);
    });
  });

  describe("createDatabaseSnapshot", () => {
    it("creates snapshot and sidecar with valid integrity", () => {
      const db = openTestDatabase(dbPath);
      insertExchange(
        db,
        {
          id: "test-ex",
          project: "test",
          timestamp: new Date().toISOString(),
          userMessage: "hello",
          assistantMessage: "world",
          archivePath: path.join(tmpDir, "a.jsonl"),
          lineStart: 1,
          lineEnd: 5,
        },
        null,
      );
      fs.writeFileSync(path.join(tmpDir, "a.jsonl"), "data");

      const lease = getDatabaseLease(db);
      const result = createDatabaseSnapshot(db, dbPath, {
        fromVersion: 2,
        toVersion: 3,
        ...(lease !== undefined ? { callerLease: lease } : {}),
      });

      expect(fs.existsSync(result.snapshotPath)).toBe(true);
      expect(fs.existsSync(result.sidecarPath)).toBe(true);
      expect(result.sidecar.schema).toBe(1);
      expect(result.sidecar.fromVersion).toBe(2);
      expect(result.sidecar.toVersion).toBe(3);
      expect(result.sidecar.dbSha256).toHaveLength(64);
      expect(result.sidecar.dbBytes).toBeGreaterThan(0);
      expect(result.sidecar.sources.length).toBe(1);

      result.lease.release();
      closeDatabase(db);
    });
  });

  describe("verifySnapshot", () => {
    it("verifies a valid snapshot", () => {
      const db = openTestDatabase(dbPath);
      const lease = getDatabaseLease(db);
      const result = createDatabaseSnapshot(db, dbPath, {
        fromVersion: 2,
        toVersion: 3,
        ...(lease !== undefined ? { callerLease: lease } : {}),
      });
      result.lease.release();

      const sidecar = verifySnapshot(result.sidecarPath);
      expect(sidecar.schema).toBe(1);
      expect(sidecar.dbSha256).toHaveLength(64);
      closeDatabase(db);
    });

    it("rejects tampered snapshot database", () => {
      const db = openTestDatabase(dbPath);
      const lease = getDatabaseLease(db);
      const result = createDatabaseSnapshot(db, dbPath, {
        fromVersion: 2,
        toVersion: 3,
        ...(lease !== undefined ? { callerLease: lease } : {}),
      });
      result.lease.release();

      fs.writeFileSync(result.snapshotPath, "corrupted");
      expect(() => verifySnapshot(result.sidecarPath)).toThrow(/mismatch/);
      closeDatabase(db);
    });
  });
});
