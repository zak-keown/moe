import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MemoryDatabase } from "../src/db.js";
import { suppressConsole } from "./test-utils.js";

/**
 * CR-058: `verifyIndex` opened `const db = initDatabase()` at the top and
 * only closed it unconditionally near the bottom, with no try/finally. The
 * finding's own words: "the db opened at the top is only guaranteed to close
 * if none of the un-guarded fs.readdirSync/fs.statSync calls in the project
 * walk throw." A dangling symlink under the archive root is a real (not
 * mocked) way to make `fs.statSync(projectPath)` throw ENOENT mid-walk —
 * exactly the failure mode the finding describes.
 *
 * db.js is mocked to pass through to the real implementation while
 * capturing the `Database` instance `verifyIndex` opens internally, so the
 * test can assert on whether the handle was closed rather than inferring a
 * leak indirectly.
 */
const capturedDbs = vi.hoisted(() => [] as MemoryDatabase[]);
vi.mock("../src/db.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/db.js")>();
  return {
    ...actual,
    initDatabase: (...args: Parameters<typeof actual.initDatabase>) => {
      const db = actual.initDatabase(...args);
      capturedDbs.push(db);
      return db;
    },
  };
});

const { verifyIndex } = await import("../src/verify.js");

function isDbClosed(db: MemoryDatabase): boolean {
  try {
    db.exec("SELECT 1");
    return false;
  } catch {
    return true;
  }
}

describe("CR-058: verifyIndex does not leak the SQLite handle on error", () => {
  let testDir: string;
  let archiveDir: string;
  let restoreConsole: () => void;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "moe-memory-verify-leak-"));
    archiveDir = join(testDir, "archive");
    process.env.TEST_ARCHIVE_DIR = archiveDir;
    process.env.TEST_DB_PATH = join(testDir, "test.db");
    mkdirSync(archiveDir, { recursive: true });

    // A dangling symlink as a top-level "project" entry: fs.readdirSync
    // returns its name, then fs.statSync(projectPath) throws ENOENT because
    // the link target does not exist — a real, unmocked failure mid-walk.
    symlinkSync(join(testDir, "does-not-exist"), join(archiveDir, "broken-project"));

    capturedDbs.length = 0;
    restoreConsole = suppressConsole();
  });

  afterEach(() => {
    restoreConsole();
    delete process.env.TEST_ARCHIVE_DIR;
    delete process.env.TEST_DB_PATH;
    for (const db of capturedDbs) {
      if (!isDbClosed(db)) db.close();
    }
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {}
  });

  it("closes the database handle even when the project walk throws", async () => {
    await expect(verifyIndex()).rejects.toThrow();

    expect(capturedDbs).toHaveLength(1);
    expect(isDbClosed(capturedDbs[0]!)).toBe(true);
  });
});
