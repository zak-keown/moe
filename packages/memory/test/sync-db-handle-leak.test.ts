import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MemoryDatabase } from "../src/db.js";
import { suppressConsole } from "./test-utils.js";

/**
 * CR-058: `syncConversations` opened `const db = initDatabase()` right
 * before `await initEmbeddings()` — a fallible network fetch/model load —
 * and only closed it unconditionally at the bottom of the indexing block,
 * with no try/finally. The identical gap as `searchConversations`
 * (search-db-handle-leak.test.ts): a model-load failure throws past
 * `db.close()` and the handle is never released.
 *
 * Plan 1 replaced @huggingface/transformers with direct ORT-WASM and added
 * graceful fallback when the model is unavailable. We mock initEmbeddings to
 * throw to verify the DB handle is still closed via try/finally.
 *
 * Note: the current sync code catches initEmbeddings failures gracefully
 * (storing text without vectors), so the sync itself resolves — but the DB
 * handle must still be closed either way.
 */
const initEmbeddingsMock = vi.hoisted(() => vi.fn());
vi.mock("../src/embeddings.js", () => ({
  initEmbeddings: initEmbeddingsMock,
  generateExchangeEmbedding: vi.fn(),
  EMBEDDING_DIMENSIONS: 384,
  resetEmbeddings: vi.fn(),
  BGE_QUERY_PREFIX: "",
}));

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

const { syncConversations } = await import("../src/sync.js");

function isDbClosed(db: MemoryDatabase): boolean {
  try {
    db.exec("SELECT 1");
    return false;
  } catch {
    return true;
  }
}

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
    initEmbeddingsMock.mockReset();
    initEmbeddingsMock.mockRejectedValue(new Error("simulated model load failure"));
    restoreConsole = suppressConsole();
  });

  afterEach(() => {
    restoreConsole();
    delete process.env.TEST_DB_PATH;
    for (const db of capturedDbs) {
      if (!isDbClosed(db)) db.close();
    }
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {}
  });

  it("closes the database handle even when embedding initialization throws", async () => {
    const result = await syncConversations(sourceDir, destDir, {});

    expect(result).toBeDefined();
    if (capturedDbs.length > 0) {
      for (const db of capturedDbs) {
        expect(isDbClosed(db)).toBe(true);
      }
    }
  });
});
