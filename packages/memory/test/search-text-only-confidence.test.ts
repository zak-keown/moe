import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationExchange } from "../src/types.js";
import { suppressConsole } from "./test-utils.js";

/**
 * CR-073: in the default `mode: "both"` search, a hit that ONLY the LIKE
 * query found (vec0's KNN never returned it) was scored with the literal SQL
 * value `0 as distance`. `l2DistanceToCosineSimilarity(0)` is exactly `1`, so
 * every text-only hit rendered as a fabricated "100% match" — indistinguishable
 * from a genuine perfect vector hit, and outranking every real vector hit in
 * the same response in the reader's eyes.
 *
 * Mocks the transformers pipeline (not `../src/embeddings.js`) so the query
 * embedding is deterministic and no real model download is needed — document
 * embeddings are inserted directly via `insertExchange`, same pattern as
 * test/codex-transcripts.test.ts's `new Array(384).fill(0.1)`.
 */
const pipelineMock = vi.hoisted(() => vi.fn());
vi.mock("@huggingface/transformers", () => ({
  pipeline: pipelineMock,
  env: {} as Record<string, unknown>,
}));

const { insertExchange } = await import("../src/db.js");
const { searchConversations } = await import("../src/search.js");
const { resetEmbeddings } = await import("../src/embeddings.js");
import { openTestDatabase } from "./test-utils.js";

function queryVector(): number[] {
  return [1, ...new Array(383).fill(0)];
}

function nearVector(): number[] {
  // Distance 0 from the query vector — a genuine, perfect vector match.
  return [1, ...new Array(383).fill(0)];
}

function farVector(): number[] {
  // Orthogonal to the query vector — never the nearest neighbour.
  return [0, 1, ...new Array(382).fill(0)];
}

describe("CR-073: text-only hits are not scored as vector matches in mode: both", () => {
  let testDir: string;
  let dbPath: string;
  let restoreConsole: () => void;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "moe-memory-search-confidence-"));
    dbPath = join(testDir, "test.db");
    process.env.TEST_DB_PATH = dbPath;

    pipelineMock.mockReset();
    resetEmbeddings();
    pipelineMock.mockImplementation(async () =>
      vi.fn(async () => ({ data: new Float32Array(queryVector()) })),
    );
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

  it("does not report a 100% match for a hit only the LIKE query found", async () => {
    const db = openTestDatabase(dbPath);

    const vectorHit: ConversationExchange = {
      id: "vector-hit",
      project: "test-project",
      timestamp: "2026-01-01T00:00:00.000Z",
      userMessage: "Completely unrelated question about deployment",
      assistantMessage: "Completely unrelated answer about deployment",
      archivePath: join(testDir, "vector-hit.jsonl"),
      lineStart: 1,
      lineEnd: 2,
    };
    insertExchange(db, vectorHit, nearVector());

    const textOnlyHit: ConversationExchange = {
      id: "text-only-hit",
      project: "test-project",
      timestamp: "2026-01-02T00:00:00.000Z",
      userMessage: "zzz-marker-phrase-zzz shows up only here",
      assistantMessage: "a reply with nothing distinctive",
      archivePath: join(testDir, "text-only-hit.jsonl"),
      lineStart: 1,
      lineEnd: 2,
    };
    insertExchange(db, textOnlyHit, farVector());

    db.close();

    // limit: 1 with no metadata filters means vector KNN asks for exactly the
    // top 1 neighbour — the far, text-matching row is never among them, so it
    // can only surface through the LIKE branch that mode: "both" merges in.
    const results = await searchConversations("zzz-marker-phrase-zzz", {
      mode: "both",
      limit: 1,
    });

    const vectorResult = results.find((r) => r.exchange.id === "vector-hit");
    const textOnlyResult = results.find((r) => r.exchange.id === "text-only-hit");

    expect(vectorResult).toBeDefined();
    expect(textOnlyResult).toBeDefined();

    // The genuine vector hit (distance 0 from the query) legitimately scores 100%.
    expect(vectorResult?.similarity).toBeCloseTo(1, 5);

    // The text-only hit was never scored by the encoder at all — it must not
    // carry a similarity number, fabricated or otherwise.
    expect(textOnlyResult?.similarity).toBeUndefined();
  });
});
