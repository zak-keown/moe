import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  acquireExclusiveMaintenanceLease,
  acquireSharedDatabaseLease,
  DatabaseBusyError,
} from "../src/database-lease.js";
import { acquireFileLock, type FileLockHandle, releaseFileLock } from "../src/file-lock.js";
import { abortRollback } from "../src/rollback/abort.js";
import { assertWritesAllowed, RollbackFencedError } from "../src/rollback/fence.js";
import {
  advanceRollbackState,
  createRollbackState,
  readRollbackState,
} from "../src/rollback/state.js";

const VALID_SHA = "a".repeat(64);

function makeInit() {
  return {
    phase: "staging" as const,
    databaseId: "process-test-db",
    snapshotSha256: VALID_SHA,
    capsuleSha256: "b".repeat(64),
    stagedDatabase: "staged-process.db",
    retainedV3Database: "retained-v3-process.db",
  };
}

describe("concurrent process refusal via leases", () => {
  let dataDir: string;
  let dbPath: string;

  beforeEach(async () => {
    dataDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "moe-process-"));
    dbPath = path.join(dataDir, "db.sqlite");
    fs.writeFileSync(dbPath, "");
  });

  afterEach(async () => {
    await fs.promises.rm(dataDir, { recursive: true, force: true });
  });

  it("exclusive lease blocks a second exclusive lease", () => {
    const lease1 = acquireExclusiveMaintenanceLease(dbPath);
    try {
      expect(() => acquireExclusiveMaintenanceLease(dbPath)).toThrow(DatabaseBusyError);
    } finally {
      lease1.release();
    }
  });

  it("shared lease blocks exclusive lease when process is alive", () => {
    const shared = acquireSharedDatabaseLease(dbPath);
    try {
      expect(() => acquireExclusiveMaintenanceLease(dbPath)).toThrow(DatabaseBusyError);
    } finally {
      shared.release();
    }
  });

  it("exclusive lease is released cleanly and re-acquirable", () => {
    const lease1 = acquireExclusiveMaintenanceLease(dbPath);
    lease1.release();

    const lease2 = acquireExclusiveMaintenanceLease(dbPath);
    expect(lease2.mode).toBe("exclusive");
    expect(lease2.epoch).toBeGreaterThan(lease1.epoch);
    lease2.release();
  });

  it("epoch advances on each exclusive lease acquisition", () => {
    const lease1 = acquireExclusiveMaintenanceLease(dbPath);
    const epoch1 = lease1.epoch;
    lease1.release();

    const lease2 = acquireExclusiveMaintenanceLease(dbPath);
    const epoch2 = lease2.epoch;
    lease2.release();

    expect(epoch2).toBe(epoch1 + 1);
  });

  it("release is idempotent — double release does not throw", () => {
    const lease = acquireExclusiveMaintenanceLease(dbPath);
    lease.release();
    expect(() => lease.release()).not.toThrow();
  });
});

describe("fence + lease interaction", () => {
  let dataDir: string;
  let dbPath: string;

  beforeEach(async () => {
    dataDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "moe-fence-lease-"));
    dbPath = path.join(dataDir, "db.sqlite");
    fs.writeFileSync(dbPath, "");
  });

  afterEach(async () => {
    await fs.promises.rm(dataDir, { recursive: true, force: true });
  });

  it("fence blocks writes while lease is held", () => {
    createRollbackState(dataDir, makeInit());
    advanceRollbackState(dataDir, "staging", "fenced");

    const shared = acquireSharedDatabaseLease(dbPath);
    try {
      expect(() => assertWritesAllowed(dataDir)).toThrow(RollbackFencedError);
    } finally {
      shared.release();
    }
  });

  it("fence survives lease release-and-reacquire cycle", () => {
    createRollbackState(dataDir, makeInit());
    advanceRollbackState(dataDir, "staging", "fenced");

    const shared1 = acquireSharedDatabaseLease(dbPath);
    shared1.release();

    const shared2 = acquireSharedDatabaseLease(dbPath);
    try {
      expect(() => assertWritesAllowed(dataDir)).toThrow(RollbackFencedError);
    } finally {
      shared2.release();
    }
  });

  it("abort during held lease removes the fence", () => {
    createRollbackState(dataDir, makeInit());
    advanceRollbackState(dataDir, "staging", "fenced");

    const shared = acquireSharedDatabaseLease(dbPath);
    try {
      expect(() => assertWritesAllowed(dataDir)).toThrow(RollbackFencedError);
      abortRollback({ dataDir });
      expect(() => assertWritesAllowed(dataDir)).not.toThrow();
    } finally {
      shared.release();
    }
  });

  it("concurrent fence checks all observe the same state", () => {
    createRollbackState(dataDir, makeInit());
    advanceRollbackState(dataDir, "staging", "fenced");

    const results = Array.from({ length: 20 }, () => {
      try {
        assertWritesAllowed(dataDir);
        return "allowed";
      } catch (e) {
        return e instanceof RollbackFencedError ? "fenced" : "other-error";
      }
    });

    expect(results.every((r) => r === "fenced")).toBe(true);
  });
});
