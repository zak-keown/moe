import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { countJournalEntries, initDatabase } from "../src/db.js";
import { journalEntryId } from "../src/journal/markdown.js";
import { JournalSearchService } from "../src/journal/search.js";
import { JournalStore } from "../src/journal/store.js";
import { fakeEmbed } from "./test-utils.js";

/**
 * Project isolation for the journal index.
 *
 * The index is ONE database shared by every project on the machine
 * (`~/.config/moe/memory`, see src/paths.ts), while `project_notes` entries
 * belong to whichever repo they were written in. Nothing in the schema recorded
 * which repo that was, so three things went wrong at once and all three are
 * regressions a user would notice as lost or leaked data:
 *
 *   1. `indexJournal` pruned every row it did not walk. It walks only the
 *      current project's roots, so indexing in repo B deleted repo A's rows —
 *      and `mcp-server.ts` runs it on every server start.
 *   2. Retrieval filtered on scope and timestamp but never on the roots the
 *      service was constructed with, so a `scope: "project"` entry written in
 *      repo A came back in repo B.
 *   3. `journalEntryId` hashed `scope:<path relative to root>`, discarding the
 *      root — so the same relative entry path in two repos produced the SAME
 *      primary key and one silently overwrote the other.
 *
 * Only `project_notes` is project-scoped (PROJECT_KEYS in store.ts); the other
 * five categories follow the person between projects and belong to the shared
 * user root, so they are deliberately not isolated.
 */
describe("journal project isolation", () => {
  let projectA: string;
  let projectB: string;
  let userDir: string;
  let dataDir: string;
  let storeA: JournalStore;
  let storeB: JournalStore;
  let db: Database.Database;

  beforeEach(async () => {
    projectA = await fs.mkdtemp(path.join(os.tmpdir(), "journal-iso-a-"));
    projectB = await fs.mkdtemp(path.join(os.tmpdir(), "journal-iso-b-"));
    userDir = await fs.mkdtemp(path.join(os.tmpdir(), "journal-iso-user-"));
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "journal-iso-data-"));

    process.env.MOE_MEMORY_CONFIG_DIR = dataDir;
    process.env.TEST_DB_PATH = path.join(dataDir, "test.db");

    // Two projects, one shared user root, one shared database — the real
    // topology. Both stores are constructed the way mcp-server.ts constructs
    // its own, differing only in projectPath.
    storeA = new JournalStore({ projectPath: projectA, userPath: userDir, embed: fakeEmbed() });
    storeB = new JournalStore({ projectPath: projectB, userPath: userDir, embed: fakeEmbed() });
    db = initDatabase();
  });

  afterEach(async () => {
    db.close();
    delete process.env.MOE_MEMORY_CONFIG_DIR;
    delete process.env.TEST_DB_PATH;
    await fs.rm(projectA, { recursive: true, force: true });
    await fs.rm(projectB, { recursive: true, force: true });
    await fs.rm(userDir, { recursive: true, force: true });
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  it("does not destroy another project's entries when indexing", async () => {
    await storeA.writeThoughts({ project_notes: "repo A ships on Tuesdays" }, db);
    await storeA.indexJournal(db);
    const afterA = countJournalEntries(db, "project");
    expect(afterA).toBe(1);

    await storeB.writeThoughts({ project_notes: "repo B uses a different queue" }, db);
    const result = await storeB.indexJournal(db);

    // B's index must not prune A. Both project entries survive.
    expect(countJournalEntries(db, "project")).toBe(2);
    expect(result.pruned).toBe(0);

    // And indexing A again must not prune B either — the failure is symmetric.
    const back = await storeA.indexJournal(db);
    expect(back.pruned).toBe(0);
    expect(countJournalEntries(db, "project")).toBe(2);
  });

  it("does not return another project's project-scoped entries", async () => {
    await storeA.writeThoughts({ project_notes: "the alpha deployment key rotates weekly" }, db);
    await storeA.indexJournal(db);

    const searchB = new JournalSearchService(
      db,
      storeB.roots().map((r) => r.path),
      { embedQuery: fakeEmbed() },
    );

    const hits = await searchB.search("alpha deployment key", { minScore: 0, limit: 10 });
    const leaked = hits.filter((h) => h.entry.path.startsWith(path.resolve(projectA)));
    expect(leaked).toEqual([]);

    // listRecent is the other retrieval entry point and leaks the same way.
    const recent = searchB.listRecent({ limit: 10 });
    expect(recent.filter((h) => h.entry.path.startsWith(path.resolve(projectA)))).toEqual([]);
  });

  it("still returns the shared user root, which is not project-scoped", async () => {
    await storeA.writeThoughts({ reflections: "I prefer small commits" }, db);
    await storeA.indexJournal(db);

    const searchB = new JournalSearchService(
      db,
      storeB.roots().map((r) => r.path),
      { embedQuery: fakeEmbed() },
    );

    // reflections is a USER_KEYS category: it follows the person, so repo B
    // must still see it. Isolating the project root must not isolate this.
    const hits = await searchB.search("small commits", { minScore: 0, limit: 10 });
    expect(hits.some((h) => h.entry.path.startsWith(path.resolve(userDir)))).toBe(true);
  });

  it("gives the same relative entry path in two projects different ids", () => {
    const relative = path.join("2026-08-31", "10-00-00-000000.md");
    const idA = journalEntryId("project", projectA, path.join(projectA, relative));
    const idB = journalEntryId("project", projectB, path.join(projectB, relative));

    // Equal ids mean one row and a silent overwrite: the primary key must
    // distinguish the roots, not just the scope and the relative path.
    expect(idA).not.toBe(idB);
  });
});
