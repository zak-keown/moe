import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  acquireDatabaseWriter,
  acquireExclusiveMaintenanceLease,
  acquireSharedDatabaseLease,
  assertWritableEpoch,
  DatabaseBusyError,
  inspectLegacyDatabaseUsers,
  readDatabaseEpoch,
  withDatabaseWriter,
} from "../src/database-lease.js";
import { closeDatabase } from "../src/db.js";
import { openTestDatabase } from "./test-utils.js";

describe("database leases", () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "moe-lease-test-"));
    dbPath = path.join(tmpDir, "test.db");
    // Create a bare database file so it exists (no lease wired)
    const db = new DatabaseSync(dbPath);
    db.exec("PRAGMA journal_mode = WAL");
    db.close();
  });

  afterEach(async () => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("shared lease", () => {
    it("acquires and releases a shared lease", () => {
      const lease = acquireSharedDatabaseLease(dbPath);
      expect(lease.mode).toBe("shared");
      expect(lease.epoch).toBeTypeOf("number");
      lease.release();
    });

    it("multiple shared leases can coexist", () => {
      const lease1 = acquireSharedDatabaseLease(dbPath);
      const lease2 = acquireSharedDatabaseLease(dbPath);
      expect(lease1.mode).toBe("shared");
      expect(lease2.mode).toBe("shared");
      lease1.release();
      lease2.release();
    });

    it("release is idempotent", () => {
      const lease = acquireSharedDatabaseLease(dbPath);
      lease.release();
      expect(() => lease.release()).not.toThrow();
    });
  });

  describe("writer", () => {
    it("acquires and releases a writer under a shared lease", () => {
      const shared = acquireSharedDatabaseLease(dbPath);
      const writer = acquireDatabaseWriter(dbPath, shared);
      expect(writer.epoch).toBeTypeOf("number");
      writer.release();
      shared.release();
    });

    it("second writer is refused while first is held", () => {
      const shared1 = acquireSharedDatabaseLease(dbPath);
      const shared2 = acquireSharedDatabaseLease(dbPath);
      const writer = acquireDatabaseWriter(dbPath, shared1);
      expect(() => acquireDatabaseWriter(dbPath, shared2)).toThrow(DatabaseBusyError);
      writer.release();
      shared1.release();
      shared2.release();
    });

    it("writer can be acquired after previous is released", () => {
      const shared = acquireSharedDatabaseLease(dbPath);
      const writer1 = acquireDatabaseWriter(dbPath, shared);
      writer1.release();
      const writer2 = acquireDatabaseWriter(dbPath, shared);
      expect(writer2.epoch).toBeTypeOf("number");
      writer2.release();
      shared.release();
    });
  });

  describe("exclusive maintenance lease", () => {
    it("acquires exclusive lease when no shared leases exist", () => {
      const exclusive = acquireExclusiveMaintenanceLease(dbPath);
      expect(exclusive.mode).toBe("exclusive");
      expect(exclusive.epoch).toBeGreaterThan(0);
      exclusive.release();
    });

    it("refuses maintenance while a shared lease is active", () => {
      const shared = acquireSharedDatabaseLease(dbPath);
      expect(() => acquireExclusiveMaintenanceLease(dbPath)).toThrow(DatabaseBusyError);
      shared.release();
    });

    it("succeeds after shared lease is released", () => {
      const shared = acquireSharedDatabaseLease(dbPath);
      shared.release();
      const exclusive = acquireExclusiveMaintenanceLease(dbPath);
      expect(exclusive.mode).toBe("exclusive");
      exclusive.release();
    });

    it("bumps the epoch", () => {
      const epochBefore = readDatabaseEpoch(dbPath);
      const exclusive = acquireExclusiveMaintenanceLease(dbPath);
      expect(exclusive.epoch).toBe(epochBefore + 1);
      exclusive.release();
      expect(readDatabaseEpoch(dbPath)).toBe(epochBefore + 1);
    });

    it("refuses maintenance while a v3 shared lease or v2 handle is active", async () => {
      const shared = acquireSharedDatabaseLease(dbPath);
      expect(() => acquireExclusiveMaintenanceLease(dbPath)).toThrow(DatabaseBusyError);
      shared.release();

      const legacy = await spawnLegacyV2Holder(dbPath);
      try {
        expect(inspectLegacyDatabaseUsers(dbPath)).not.toEqual([]);
        expect(() => acquireExclusiveMaintenanceLease(dbPath)).toThrow(/legacy/i);
      } finally {
        await legacy.stop();
      }
      const exclusive = acquireExclusiveMaintenanceLease(dbPath);
      expect(exclusive).toBeDefined();
      exclusive.release();
    });
  });

  describe("epoch", () => {
    it("starts at 0 for a new database", () => {
      expect(readDatabaseEpoch(dbPath)).toBe(0);
    });

    it("assertWritableEpoch passes when epoch matches", () => {
      const epoch = readDatabaseEpoch(dbPath);
      expect(() => assertWritableEpoch(dbPath, epoch)).not.toThrow();
    });

    it("assertWritableEpoch throws when epoch mismatches", () => {
      expect(() => assertWritableEpoch(dbPath, 999)).toThrow(DatabaseBusyError);
    });
  });

  describe("withDatabaseWriter", () => {
    it("runs body and returns its value", () => {
      const db = openTestDatabase(dbPath);
      const epoch = readDatabaseEpoch(dbPath);
      const result = withDatabaseWriter(db, epoch, () => 42);
      expect(result).toBe(42);
      closeDatabase(db);
    });
  });
});

interface LegacyHolder {
  stop(): Promise<void>;
}

function spawnLegacyV2Holder(dbPath: string): Promise<LegacyHolder> {
  return new Promise((resolve, reject) => {
    const fixturePath = path.join(import.meta.dirname, "fixtures", "legacy-v2-holder.mjs");
    const child = execFile("node", [fixturePath, dbPath], { timeout: 10000 });

    let stdout = "";
    child.stdout?.setEncoding("utf-8");
    child.stdout?.on("data", (data: string) => {
      stdout += data;
      if (stdout.includes("READY")) {
        resolve({
          stop() {
            return new Promise<void>((res) => {
              child.on("exit", () => res());
              child.stdin?.write("STOP\n");
              setTimeout(() => {
                child.kill();
                res();
              }, 2000);
            });
          },
        });
      }
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (!stdout.includes("READY")) {
        reject(new Error(`legacy-v2-holder exited with code ${code} before READY`));
      }
    });
  });
}
