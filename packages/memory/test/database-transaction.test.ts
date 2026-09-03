import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { withForeignKeysDisabled, withTransaction } from "../src/database-transaction.js";
import type { MemoryDatabase } from "../src/db.js";
import { openTestDatabase } from "./test-utils.js";

describe("withTransaction", () => {
  let dbPath: string;
  let db: MemoryDatabase;

  beforeEach(() => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "moe-txn-test-"));
    dbPath = path.join(dir, "test.db");
    db = openTestDatabase(dbPath);
  });

  afterEach(() => {
    db.close();
  });

  it("commits on success", () => {
    withTransaction(db, () => {
      db.exec(
        "INSERT INTO exchanges(id, project, timestamp, user_message, assistant_message, archive_path, line_start, line_end) VALUES ('tx-ok', 'p', '2024-01-01', 'u', 'a', '/a', 0, 1)",
      );
    });
    const row = db.prepare("SELECT id FROM exchanges WHERE id = 'tx-ok'").get() as
      | { id: string }
      | undefined;
    expect(row?.id).toBe("tx-ok");
  });

  it("rolls back on throw", () => {
    expect(() =>
      withTransaction(db, () => {
        db.exec(
          "INSERT INTO exchanges(id, project, timestamp, user_message, assistant_message, archive_path, line_start, line_end) VALUES ('tx-fail', 'p', '2024-01-01', 'u', 'a', '/a', 0, 1)",
        );
        throw new Error("boom");
      }),
    ).toThrow("boom");
    const row = db.prepare("SELECT count(*) AS n FROM exchanges WHERE id = 'tx-fail'").get() as {
      n: number;
    };
    expect(row.n).toBe(0);
  });

  it("returns the body's return value", () => {
    const result = withTransaction(db, () => 42);
    expect(result).toBe(42);
  });
});

describe("withForeignKeysDisabled", () => {
  let dbPath: string;
  let db: MemoryDatabase;

  beforeEach(() => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "moe-fk-test-"));
    dbPath = path.join(dir, "test.db");
    db = openTestDatabase(dbPath);
  });

  afterEach(() => {
    db.close();
  });

  it("disables FK inside the body and restores afterward", () => {
    const before = db.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number };
    expect(before.foreign_keys).toBe(1);

    withForeignKeysDisabled(db, () => {
      const inside = db.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number };
      expect(inside.foreign_keys).toBe(0);
    });

    const after = db.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number };
    expect(after.foreign_keys).toBe(1);
  });

  it("restores FK even when body throws", () => {
    expect(() =>
      withForeignKeysDisabled(db, () => {
        throw new Error("oops");
      }),
    ).toThrow("oops");
    const after = db.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number };
    expect(after.foreign_keys).toBe(1);
  });
});

describe("composed withForeignKeysDisabled + withTransaction", () => {
  let dbPath: string;
  let db: MemoryDatabase;

  beforeEach(() => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "moe-composed-test-"));
    dbPath = path.join(dir, "test.db");
    db = openTestDatabase(dbPath);
  });

  afterEach(() => {
    db.close();
  });

  it("rolls back and restores foreign keys after a migration throws", () => {
    expect(() =>
      withForeignKeysDisabled(db, () =>
        withTransaction(db, () => {
          db.exec(
            "INSERT INTO exchanges(id, project, timestamp, user_message, assistant_message, archive_path, line_start, line_end) VALUES ('incomplete', 'p', '2024-01-01', 'u', 'a', '/a', 0, 1)",
          );
          throw new Error("stop");
        }),
      ),
    ).toThrow("stop");
    expect(db.prepare("PRAGMA foreign_keys").get()).toEqual({ foreign_keys: 1 });
    expect(db.prepare("SELECT count(*) AS n FROM exchanges WHERE id='incomplete'").get()).toEqual({
      n: 0,
    });
  });
});

describe("WAL contention", () => {
  let dbPath: string;
  let db1: MemoryDatabase;
  let db2: MemoryDatabase;

  beforeEach(() => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "moe-wal-test-"));
    dbPath = path.join(dir, "test.db");
    db1 = openTestDatabase(dbPath);
    db2 = new DatabaseSync(dbPath);
    db2.exec("PRAGMA journal_mode = WAL");
    db2.exec("PRAGMA busy_timeout = 5000");
  });

  afterEach(() => {
    db1.close();
    db2.close();
  });

  it("two connections can read concurrently under WAL", () => {
    withTransaction(db1, () => {
      db1.exec(
        "INSERT INTO exchanges(id, project, timestamp, user_message, assistant_message, archive_path, line_start, line_end) VALUES ('wal-1', 'p', '2024-01-01', 'u', 'a', '/a', 0, 1)",
      );
    });
    const row1 = db1.prepare("SELECT id FROM exchanges WHERE id = 'wal-1'").get() as
      | { id: string }
      | undefined;
    const row2 = db2.prepare("SELECT id FROM exchanges WHERE id = 'wal-1'").get() as
      | Record<string, unknown>
      | undefined;
    expect(row1?.id).toBe("wal-1");
    expect(row2?.id).toBe("wal-1");
  });
});
