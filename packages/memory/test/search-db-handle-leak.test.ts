import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MemoryDatabase } from "../src/db.js";
import { suppressConsole } from "./test-utils.js";

/**
 * CR-058: `searchConversations` did `const db = initDatabase();`, then ran
 * vector search — which calls `await initEmbeddings()`, a fallible network
 * fetch/model load with its own documented timeout in embeddings.ts — and DB
 * queries, before an UNCONDITIONAL `db.close()` near the end of the
 * function. There was no try/finally: when `initEmbeddings()` (or any query)
 * throws, the function returns past `db.close()` and the database handle is
 * never released.
 *
 * The fix wraps the body in try/finally so `db.close()` always runs. This
 * test verifies the handle is closed even when `initEmbeddings()` throws.
 *
 * Plan 1 replaced @huggingface/transformers with direct ORT-WASM and the
 * vector-readiness gate (`isVectorQueryAuthorized`). We mock both the
 * readiness gate (to force the vector path) and initEmbeddings (to throw).
 */
const initEmbeddingsMock = vi.hoisted(() => vi.fn());
vi.mock("../src/embeddings.js", () => ({
  initEmbeddings: initEmbeddingsMock,
  generateQueryEmbedding: vi.fn(),
  EMBEDDING_DIMENSIONS: 384,
  resetEmbeddings: vi.fn(),
  BGE_QUERY_PREFIX: "",
}));

vi.mock("../src/vector-readiness.js", () => ({
  isVectorQueryAuthorized: () => true,
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

const { searchConversations } = await import("../src/search.js");

function isDbClosed(db: MemoryDatabase): boolean {
  try {
    db.exec("SELECT 1");
    return false;
  } catch {
    return true;
  }
}

describe("CR-058: searchConversations does not leak the SQLite handle on error", () => {
  let testDir: string;
  let restoreConsole: () => void;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "moe-memory-search-leak-"));
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
    await expect(searchConversations("anything", { mode: "vector" })).rejects.toThrow(
      "simulated model load failure",
    );

    expect(capturedDbs).toHaveLength(1);
    expect(isDbClosed(capturedDbs[0]!)).toBe(true);
  });
});
