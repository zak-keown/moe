import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initDatabase } from "../src/db.js";
import { JournalSearchService } from "../src/journal/search.js";
import { JournalStore } from "../src/journal/store.js";
import { fakeEmbed } from "./test-utils.js";

/**
 * Ported from private-journal-mcp's tests/embeddings.test.ts.
 *
 * The five path-safety tests in its `readEntry` block are the best-engineered
 * material in that source and the conversation half has no equivalent guard for
 * file reads, so they come across as-is: extension check, containment check,
 * unnormalised `..`, non-markdown, and symlink escape. The two-stage containment
 * check (resolve, then realpath) exists precisely because macOS `/tmp` and `/var`
 * are symlinks and must not be collapsed into one check.
 *
 * The retrieval tests changed shape: search is a sqlite-vec KNN over
 * `vec_journal_entries` now, not an in-memory scan of `.embedding` sidecars. The
 * suite runs offline against an injected encoder — which also means the ranking
 * assertions are real, unlike upstream's, where a global jest mock returned the
 * same vector for every input so every cosine was exactly 1.0.
 */
describe("journal retrieval", () => {
  let projectDir: string;
  let userDir: string;
  let dataDir: string;
  let store: JournalStore;
  let search: JournalSearchService;
  let db: Database.Database;

  beforeEach(async () => {
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), "journal-project-test-"));
    userDir = await fs.mkdtemp(path.join(os.tmpdir(), "journal-user-test-"));
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "journal-data-test-"));
    process.env.MOE_MEMORY_CONFIG_DIR = dataDir;
    process.env.TEST_DB_PATH = path.join(dataDir, "test.db");

    store = new JournalStore({
      projectPath: projectDir,
      userPath: userDir,
      embed: fakeEmbed(),
    });
    db = initDatabase();
    // The query encoder is injected too, so the whole retrieval path runs
    // offline. In production it defaults to generateQueryEmbedding, which
    // prepends the BGE retrieval prefix.
    search = new JournalSearchService(
      db,
      store.roots().map((r) => r.path),
      { embedQuery: fakeEmbed() },
    );
  });

  afterEach(async () => {
    db.close();
    delete process.env.MOE_MEMORY_CONFIG_DIR;
    delete process.env.TEST_DB_PATH;
    await fs.rm(projectDir, { recursive: true, force: true });
    await fs.rm(userDir, { recursive: true, force: true });
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  async function seed(): Promise<void> {
    await store.writeThoughts({ reflections: "I feel frustrated debugging TypeScript errors" }, db);
    await store.writeThoughts(
      { technical_insights: "JavaScript async patterns can be tricky to understand" },
      db,
    );
    await store.writeThoughts({ project_notes: "The React component architecture works well" }, db);
  }

  it("finds an entry by its own text", async () => {
    await seed();

    const results = await search.search("I feel frustrated debugging TypeScript errors", {
      minScore: 0,
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.entry.text).toContain("frustrated");
    expect(results[0]?.score).toBeGreaterThan(0.5);
  });

  it("ranks an exact match above an unrelated entry", async () => {
    await seed();

    const results = await search.search("React component architecture", { minScore: -1 });
    expect(results.length).toBeGreaterThan(1);
    const best = results[0];
    expect(best?.entry.text).toContain("React");
    for (let i = 1; i < results.length; i++) {
      expect(best?.score).toBeGreaterThanOrEqual(results[i]?.score ?? 1);
    }
  });

  it("filters by scope", async () => {
    await seed();

    const projectResults = await search.search("React", { scope: "project", minScore: -1 });
    expect(projectResults.length).toBeGreaterThan(0);
    for (const r of projectResults) expect(r.entry.scope).toBe("project");

    const userResults = await search.search("TypeScript", { scope: "user", minScore: -1 });
    expect(userResults.length).toBeGreaterThan(0);
    for (const r of userResults) expect(r.entry.scope).toBe("user");
  });

  it("filters by every documented section name", async () => {
    // FIXED. Upstream compared the caller's snake_case value against the
    // RENDERED heading text, so of the six documented values only `reflections`
    // and `observations` matched anything — and the broken form was the worked
    // example inside the live tool description, so the model was actively
    // instructed to pass filters that silently returned zero results.
    await store.writeThoughts(
      {
        reflections: "r-content",
        observations: "o-content",
        user_context: "uc-content",
        technical_insights: "ti-content",
        world_knowledge: "wk-content",
      },
      db,
    );
    await store.writeThoughts({ project_notes: "pn-content" }, db);

    for (const section of [
      "reflections",
      "observations",
      "user_context",
      "technical_insights",
      "world_knowledge",
      "project_notes",
    ]) {
      const results = await search.search("content", { sections: [section], minScore: -1 });
      expect(results.length, `sections: ['${section}'] matched nothing`).toBeGreaterThan(0);
    }
  });

  it("still matches the legacy Feelings heading on pre-2.0.0 entries", async () => {
    // The one compatibility promise upstream made to data already on disk.
    const dir = path.join(userDir, "2025-04-01");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, "10-00-00-000000.md"),
      `---\ntitle: "x"\ndate: ${new Date().toISOString()}\ntimestamp: ${Date.now()}\n---\n\n## Feelings\n\nan old entry\n`,
      "utf8",
    );
    await store.indexJournal(db);

    const results = await search.search("old entry", { sections: ["feelings"], minScore: -1 });
    expect(results.length).toBe(1);
  });

  it("returns nothing for a section nobody wrote", async () => {
    await seed();
    const results = await search.search("anything", { sections: ["not_a_section"], minScore: -1 });
    expect(results).toEqual([]);
  });

  describe("listRecent", () => {
    it("returns entries newest first and respects the limit", async () => {
      await store.writeThoughts({ project_notes: "First entry about architecture" }, db);
      await new Promise((r) => setTimeout(r, 5));
      await store.writeThoughts({ project_notes: "Second entry about testing" }, db);
      await new Promise((r) => setTimeout(r, 5));
      await store.writeThoughts({ project_notes: "Third entry about deployment" }, db);

      const results = search.listRecent({ limit: 2 });
      expect(results).toHaveLength(2);
      expect(results[0]?.entry.text).toContain("Third entry about deployment");
      expect(results[1]?.entry.text).toContain("Second entry about testing");
      expect(results[0]?.score).toBe(1);
    });

    it("returns an empty array when nothing has been written", () => {
      expect(search.listRecent()).toEqual([]);
    });
  });

  describe("readRecentEntries", () => {
    it("returns the full content of the N most recent entries", async () => {
      await store.writeThoughts({ project_notes: "First entry about architecture" }, db);
      await new Promise((r) => setTimeout(r, 5));
      await store.writeThoughts({ project_notes: "Second entry about testing" }, db);

      const results = await search.readRecentEntries({ limit: 2 });
      expect(results).toHaveLength(2);
      expect(results[0]?.content).toContain("Second entry about testing");
      expect(results[1]?.content).toContain("First entry about architecture");
      expect(results[0]?.path).toBeDefined();
      expect(results[0]?.timestamp).toBeGreaterThan(0);
    });

    it("defaults to 5 entries", async () => {
      for (let i = 1; i <= 7; i++) {
        await store.writeThoughts({ project_notes: `Entry number ${i}` }, db);
        if (i < 7) await new Promise((r) => setTimeout(r, 5));
      }

      const results = await search.readRecentEntries();
      expect(results).toHaveLength(5);
      expect(results[0]?.content).toContain("Entry number 7");
      expect(results[4]?.content).toContain("Entry number 3");
    });

    it("returns fewer entries when fewer exist", async () => {
      await store.writeThoughts({ project_notes: "Only entry" }, db);
      const results = await search.readRecentEntries({ limit: 5 });
      expect(results).toHaveLength(1);
      expect(results[0]?.content).toContain("Only entry");
    });

    it("returns an empty array when no entries exist", async () => {
      expect(await search.readRecentEntries()).toHaveLength(0);
    });
  });

  describe("readEntry", () => {
    it("reads a journal entry", async () => {
      const entryPath = path.join(projectDir, "2025-05-31", "12-00-00-000000.md");
      await fs.mkdir(path.dirname(entryPath), { recursive: true });
      await fs.writeFile(entryPath, "# real journal entry", "utf8");

      expect(await search.readEntry(entryPath)).toBe("# real journal entry");
    });

    it("returns null when the entry does not exist", async () => {
      const missing = path.join(projectDir, "2025-05-31", "does-not-exist.md");
      expect(await search.readEntry(missing)).toBeNull();
    });

    it("rejects a path outside the journal directories", async () => {
      const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), "journal-other-test-"));
      const otherFile = path.join(outsideDir, "other.md");
      await fs.writeFile(otherFile, "other file contents", "utf8");

      try {
        await expect(search.readEntry(otherFile)).rejects.toThrow(/not a readable journal entry/);
      } finally {
        await fs.rm(outsideDir, { recursive: true, force: true });
      }
    });

    it("rejects a path that resolves outside the journal directories", async () => {
      const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), "journal-other-test-"));
      const otherFile = path.join(outsideDir, "other.md");
      await fs.writeFile(otherFile, "other file contents", "utf8");
      // Built with Array.join (not path.join) so the literal '..' reaches
      // readEntry unnormalized.
      const unnormalizedPath = [projectDir, "..", path.basename(outsideDir), "other.md"].join(
        path.sep,
      );

      try {
        await expect(search.readEntry(unnormalizedPath)).rejects.toThrow(
          /not a readable journal entry/,
        );
      } finally {
        await fs.rm(outsideDir, { recursive: true, force: true });
      }
    });

    it("rejects a non-Markdown path", async () => {
      const otherFile = path.join(projectDir, "notes.txt");
      await fs.writeFile(otherFile, "plain text", "utf8");

      await expect(search.readEntry(otherFile)).rejects.toThrow(/not a readable journal entry/);
    });

    it("rejects a symlink that resolves outside the journal directories", async () => {
      const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), "journal-link-test-"));
      const otherFile = path.join(outsideDir, "other.md");
      await fs.writeFile(otherFile, "other file contents", "utf8");

      const dayDir = path.join(projectDir, "2025-05-31");
      await fs.mkdir(dayDir, { recursive: true });
      const linkPath = path.join(dayDir, "link.md");
      await fs.symlink(otherFile, linkPath);

      try {
        await expect(search.readEntry(linkPath)).rejects.toThrow(/not a readable journal entry/);
      } finally {
        await fs.rm(outsideDir, { recursive: true, force: true });
      }
    });
  });

  describe("collapsed roots", () => {
    it("does not return every entry twice when one directory serves both journals", async () => {
      // Upstream, `type: 'both'` loaded the same directory once as `project` and
      // once as `user`, so `limit: 10` yielded 5 unique entries with
      // contradictory labels.
      const collapsed = new JournalStore({
        projectPath: projectDir,
        userPath: projectDir,
        embed: fakeEmbed(),
      });
      const collapsedSearch = new JournalSearchService(
        db,
        collapsed.roots().map((r) => r.path),
        { embedQuery: fakeEmbed() },
      );

      await collapsed.writeThoughts({ reflections: "exactly one entry" }, db);

      const recent = collapsedSearch.listRecent({ limit: 10 });
      expect(recent).toHaveLength(1);

      const found = await collapsedSearch.search("exactly one entry", { minScore: -1 });
      expect(found).toHaveLength(1);
    });
  });
});
