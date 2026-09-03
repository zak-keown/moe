import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationExchange } from "../src/types.js";
import { suppressConsole } from "./test-utils.js";

/**
 * CR-074: sqlite-vec's vec0 applies its KNN `k` limit BEFORE the WHERE clause
 * runs. `searchConversations` knows this — it widens `k` to `limit * 3` when
 * `hasMetadataFilters` is true — but `hasMetadataFilters` only checked
 * project/session_id/git_branch, not `after`/`before`, even though
 * `buildSearchFilters` has always emitted timestamp predicates for both. So a
 * date-filtered vector search asked vec0 for exactly `limit` neighbours and
 * then discarded every one that fell outside the window, even when rows
 * inside the window existed.
 *
 * Mocks the transformers pipeline for a deterministic query embedding;
 * document embeddings are inserted directly via insertExchange, matching
 * test/codex-transcripts.test.ts's convention, so no real model is needed.
 */
const createBackendMock = vi.hoisted(() => vi.fn());
vi.mock("../src/embedding-runtime.js", () => ({
  createEmbeddingBackend: createBackendMock,
}));
vi.mock("../src/model-cache.js", () => ({
  ensureModelSet: vi.fn(async () => ({ root: "/fake", revision: "x", variant: "q8", files: new Map() })),
}));
vi.mock("../src/model-manifest.js", () => ({
  loadModelManifest: vi.fn(() => ({ schema: 1, model: "test", revision: "x", variant: "q8", license: "MIT", dimensions: 384, maxTokens: 512, maxInputChars: 2000, queryPrefix: "", files: [] })),
}));

const { insertExchange } = await import("../src/db.js");
const { searchConversations } = await import("../src/search.js");
const { resetEmbeddings } = await import("../src/embeddings.js");
import { openTestDatabase } from "./test-utils.js";

function vectorAtDistance(index: number): number[] {
  // A distinct unit-ish vector per index, all orthogonal to the query
  // direction (index 0) by varying which OTHER axis holds a small value —
  // close indices are nearer the query, high indices are farther.
  const v = new Array(384).fill(0);
  v[0] = 1;
  v[index + 1] = 0.01 * (index + 1);
  return v;
}

describe("CR-074: a date filter on a vector search does not lose in-window matches", () => {
  let testDir: string;
  let dbPath: string;
  let restoreConsole: () => void;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "moe-memory-search-date-"));
    dbPath = join(testDir, "test.db");
    process.env.TEST_DB_PATH = dbPath;

    createBackendMock.mockReset();
    resetEmbeddings();
    const queryVec = new Float32Array([1, ...new Array(383).fill(0)]);
    createBackendMock.mockResolvedValue({
      embed: vi.fn(async () => queryVec),
      embedQuery: vi.fn(async () => queryVec),
      close: vi.fn(async () => {}),
    });
    restoreConsole = suppressConsole();
  });

  afterEach(() => {
    restoreConsole();
    delete process.env.TEST_DB_PATH;
    resetEmbeddings();
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {}
  });

  it("still returns in-window rows when the nearest neighbours all fall outside the date window", async () => {
    const db = openTestDatabase(dbPath);

    // 3 rows nearer the query vector, all dated OUTSIDE the "after" window.
    for (let i = 0; i < 3; i++) {
      const exchange: ConversationExchange = {
        id: `near-${i}`,
        project: "test-project",
        timestamp: "2020-01-01T00:00:00.000Z",
        userMessage: `near message ${i}`,
        assistantMessage: `near reply ${i}`,
        archivePath: join(testDir, `near-${i}.jsonl`),
        lineStart: 1,
        lineEnd: 2,
      };
      insertExchange(db, exchange, vectorAtDistance(i));
    }

    // 2 rows farther from the query vector, dated INSIDE the window.
    for (let i = 0; i < 2; i++) {
      const exchange: ConversationExchange = {
        id: `in-window-${i}`,
        project: "test-project",
        timestamp: "2026-06-01T00:00:00.000Z",
        userMessage: `in-window message ${i}`,
        assistantMessage: `in-window reply ${i}`,
        archivePath: join(testDir, `in-window-${i}.jsonl`),
        lineStart: 1,
        lineEnd: 2,
      };
      insertExchange(db, exchange, vectorAtDistance(100 + i));
    }

    db.close();

    const results = await searchConversations("anything", {
      mode: "vector",
      limit: 2,
      after: "2025-01-01",
    });

    const ids = results.map((r) => r.exchange.id).sort();
    expect(ids).toEqual(["in-window-0", "in-window-1"]);
  });
});
