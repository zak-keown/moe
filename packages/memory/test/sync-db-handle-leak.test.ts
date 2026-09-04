import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { suppressConsole } from "./test-utils.js";

/**
 * CR-058: `syncConversations` opened `const db = initDatabase()` right
 * before `await initEmbeddings()` — a fallible network fetch/model load —
 * and only closed it unconditionally at the bottom of the indexing block,
 * with no try/finally. The identical gap as `searchConversations`
 * (search-db-handle-leak.test.ts): a model-load failure throws past
 * `db.close()` and the handle is never released.
 *
 * Same mocking approach: the transformers pipeline is mocked to reject so
 * `initEmbeddings()` fails for a real reason, and db.js is mocked to pass
 * through to the real implementation while capturing the `Database`
 * instance so the test can assert `.open` directly.
 */
const pipelineMock = vi.hoisted(() => vi.fn());
vi.mock("@huggingface/transformers", () => ({
  pipeline: pipelineMock,
  env: {} as Record<string, unknown>,
}));

const capturedDbs = vi.hoisted(() => [] as Database.Database[]);
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

const { syncConversations } = await import("../src/sync.js");
const { resetEmbeddings } = await import("../src/embeddings.js");

describe("CR-058: syncConversations does not leak the SQLite handle on error", () => {
  let testDir: string;
  let sourceDir: string;
  let destDir: string;
  let restoreConsole: () => void;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "moe-memory-sync-leak-"));
    sourceDir = join(testDir, "source");
    destDir = join(testDir, "dest");
    mkdirSync(join(sourceDir, "project-a"), { recursive: true });
    writeFileSync(join(sourceDir, "project-a", "test.jsonl"), "irrelevant content", "utf-8");

    process.env.TEST_DB_PATH = join(testDir, "test.db");
    capturedDbs.length = 0;
    pipelineMock.mockReset();
    resetEmbeddings();
    pipelineMock.mockRejectedValue(new Error("simulated model load failure"));
    restoreConsole = suppressConsole();
  });

  afterEach(() => {
    restoreConsole();
    delete process.env.TEST_DB_PATH;
    resetEmbeddings();
    for (const db of capturedDbs) {
      if (db.open) db.close();
    }
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {}
  });

  it("closes the database handle even when embedding initialization throws", async () => {
    await expect(syncConversations(sourceDir, destDir, {})).rejects.toThrow(
      "simulated model load failure",
    );

    expect(capturedDbs).toHaveLength(1);
    expect(capturedDbs[0]?.open).toBe(false);
  });
});
