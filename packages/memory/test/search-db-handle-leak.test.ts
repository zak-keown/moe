import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { suppressConsole } from "./test-utils.js";

/**
 * CR-058: `searchConversations` did `const db = initDatabase();`, then ran
 * vector search — which calls `await initEmbeddings()`, a fallible network
 * fetch/model load with its own documented timeout in embeddings.ts — and DB
 * queries, before an UNCONDITIONAL `db.close()` near the end of the
 * function. There was no try/finally: when `initEmbeddings()` (or any query)
 * throws, the function returns past `db.close()` and the better-sqlite3
 * handle is never released.
 *
 * This matters most because `searchConversations` backs the
 * `search_conversations` MCP tool inside the long-lived MCP server process —
 * every failed search leaks one more open native SQLite handle for the life
 * of that process.
 *
 * The transformers pipeline is mocked to reject, which makes
 * `initEmbeddings()` throw exactly where the finding describes (model-load
 * failure) — a real, fallible dependency, not a stand-in exception. `db.js`
 * is mocked to pass through to the real implementation while capturing the
 * `Database` instance `searchConversations` opens internally, so the test
 * can assert on that instance's `.open` flag directly rather than inferring
 * a leak indirectly.
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

const { searchConversations } = await import("../src/search.js");
const { resetEmbeddings } = await import("../src/embeddings.js");

describe("CR-058: searchConversations does not leak the SQLite handle on error", () => {
  let testDir: string;
  let restoreConsole: () => void;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "moe-memory-search-leak-"));
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
    await expect(searchConversations("anything", { mode: "vector" })).rejects.toThrow(
      "simulated model load failure",
    );

    expect(capturedDbs).toHaveLength(1);
    expect(capturedDbs[0]?.open).toBe(false);
  });
});
