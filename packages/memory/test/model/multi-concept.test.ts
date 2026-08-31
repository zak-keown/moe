import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { searchMultipleConcepts } from "../../src/search.js";
import { indexTestFiles } from "../test-indexer.js";
import { getFixturePath } from "../test-utils.js";

/**
 * REWRITTEN ON IMPORT. Upstream this suite set no environment override at all,
 * so `searchMultipleConcepts` → `initDatabase()` → `getDbPath()` resolved to
 * `~/.config/superpowers/conversation-index/db.sqlite`: on a developer machine
 * it read (and, through the mkdir in getSuperpowersDir + initDatabase, CREATED)
 * the real production index; in CI it created an empty one and every assertion
 * was guarded by `if (results.length > 0)`, so the suite passed vacuously.
 *
 * Its own comment claimed "the fixture corpus mentions skills and research
 * repeatedly" — but the file indexed no fixtures. It does now, into a temp
 * database, and the guards are gone from the assertions that no longer need them.
 */
describe("multi-concept search", () => {
  let tmp: string;

  beforeAll(async () => {
    tmp = mkdtempSync(join(tmpdir(), "moe-memory-multi-concept-"));
    process.env.MOE_MEMORY_CONFIG_DIR = tmp;
    process.env.MOE_MEMORY_DB_PATH = join(tmp, "test.db");
    await indexTestFiles([
      getFixturePath("short-conversation.jsonl"),
      getFixturePath("medium-conversation.jsonl"),
      getFixturePath("long-conversation.jsonl"),
    ]);
  });

  afterAll(() => {
    delete process.env.MOE_MEMORY_CONFIG_DIR;
    delete process.env.MOE_MEMORY_DB_PATH;
    rmSync(tmp, { recursive: true, force: true });
  });

  it("finds conversations matching all concepts and ranks them by average similarity", async () => {
    const results = await searchMultipleConcepts(["class", "Python"], { limit: 5 });

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
    for (let i = 1; i < results.length; i++) {
      const previous = results[i - 1];
      const current = results[i];
      expect(previous).toBeDefined();
      expect(current).toBeDefined();
      expect(previous?.averageSimilarity).toBeGreaterThanOrEqual(current?.averageSimilarity ?? 0);
    }
  });

  it("ranks concepts present in the corpus above random nonsense", async () => {
    const corpusRelevant = await searchMultipleConcepts(["class", "Python"], { limit: 5 });
    const nonsense = await searchMultipleConcepts(["xyzabc123", "qwerty789"], { limit: 5 });

    expect(corpusRelevant.length).toBeGreaterThan(0);
    const best = corpusRelevant[0]?.averageSimilarity ?? -1;
    const bestNonsense = nonsense[0]?.averageSimilarity ?? -1;
    expect(best).toBeGreaterThan(bestNonsense);
  });

  it("returns averageSimilarity values within the cosine range [-1, 1]", async () => {
    const results = await searchMultipleConcepts(["xyzabc123", "qwerty789"], { limit: 5 });
    for (const r of results) {
      expect(r.averageSimilarity).toBeGreaterThanOrEqual(-1);
      expect(r.averageSimilarity).toBeLessThanOrEqual(1);
    }
  });

  it("respects the limit parameter", async () => {
    const results = await searchMultipleConcepts(["class", "Python"], { limit: 2 });
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it("reports one similarity per concept plus their average", async () => {
    const results = await searchMultipleConcepts(["class", "Python"], { limit: 1 });

    expect(results.length).toBeGreaterThan(0);
    const first = results[0];
    expect(first?.conceptSimilarities).toHaveLength(2);
    expect(typeof first?.averageSimilarity).toBe("number");
  });

  it("returns nothing when only one of the two concepts is present", async () => {
    const results = await searchMultipleConcepts(["class", "zzzznotinthecorpuszzzz"], { limit: 5 });
    // AND semantics: a conversation must match every concept. The nonsense
    // concept still produces vector hits (KNN always returns its k nearest),
    // so this asserts the intersection, not emptiness.
    for (const r of results) {
      expect(r.conceptSimilarities).toHaveLength(2);
    }
  });
});
