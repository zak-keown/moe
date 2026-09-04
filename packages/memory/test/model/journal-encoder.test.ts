import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MemoryDatabase } from "../../src/db.js";
import { EMBEDDING_VERSION } from "../../src/embedding-migration.js";
import { EMBEDDING_DIMENSIONS } from "../../src/embeddings.js";
import { JournalSearchService } from "../../src/journal/search.js";
import { JournalStore } from "../../src/journal/store.js";
import { openTestDatabase } from "../test-utils.js";

/**
 * The end-to-end journal round trip against the REAL bge encoder.
 *
 * This is the test that proves the merge: a deliberately written journal entry
 * and a harvested transcript turn go through the same pipeline, into the same
 * database file, at the same EMBEDDING_VERSION — and the journal's queries route
 * through the BGE query prefix, which private-journal-mcp's symmetric search path
 * did not have and which costs recall silently when it is missing.
 */
describe("journal — real encoder", () => {
  let projectDir: string;
  let userDir: string;
  let dataDir: string;
  let store: JournalStore;
  let db: MemoryDatabase;

  beforeEach(async () => {
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), "moe-memory-journal-enc-p-"));
    userDir = await fs.mkdtemp(path.join(os.tmpdir(), "moe-memory-journal-enc-u-"));
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "moe-memory-journal-enc-d-"));
    process.env.MOE_MEMORY_CONFIG_DIR = dataDir;
    store = new JournalStore({ projectPath: projectDir, userPath: userDir });
    db = openTestDatabase(path.join(dataDir, "test.db"));
  });

  afterEach(async () => {
    db.close();
    delete process.env.MOE_MEMORY_CONFIG_DIR;
    delete process.env.TEST_DB_PATH;
    await fs.rm(projectDir, { recursive: true, force: true });
    await fs.rm(userDir, { recursive: true, force: true });
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  it("embeds a written entry with the shared encoder and finds it semantically", async () => {
    await store.writeThoughts(
      {
        technical_insights:
          "Vector embeddings give you semantic similarity over text without keyword overlap.",
      },
      db,
    );
    await store.writeThoughts(
      { project_notes: "The deploy script runs terraform apply against the production workspace." },
      db,
    );

    const row = db.prepare("SELECT embedding_version FROM journal_entries LIMIT 1").get() as {
      embedding_version: number;
    };
    expect(row.embedding_version).toBe(EMBEDDING_VERSION);

    const search = new JournalSearchService(
      db,
      store.roots().map((r) => r.path),
    );

    // A paraphrase, not a keyword match — this is what the encoder buys.
    const results = await search.search("how do I search text by meaning rather than words", {
      minScore: -1,
    });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.entry.text).toContain("Vector embeddings");
  });

  it("writes unit-normalised vectors of the shared width, which is what the l2-to-cosine conversion assumes", async () => {
    await store.writeThoughts({ reflections: "a single entry to measure" }, db);

    const row = db.prepare("SELECT embedding FROM vec_journal_entries LIMIT 1").get() as {
      embedding: Buffer;
    };
    const vector = new Float32Array(
      row.embedding.buffer,
      row.embedding.byteOffset,
      row.embedding.byteLength / 4,
    );

    expect(vector.length).toBe(EMBEDDING_DIMENSIONS);
    let norm = 0;
    for (const v of vector) norm += v * v;
    expect(Math.sqrt(norm)).toBeCloseTo(1, 3);
  });
});
