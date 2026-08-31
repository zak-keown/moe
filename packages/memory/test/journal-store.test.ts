import { existsSync, utimesSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { countJournalEntries, initDatabase } from "../src/db.js";
import { JournalStore } from "../src/journal/store.js";
import { fakeEmbed } from "./test-utils.js";

/**
 * Ported from private-journal-mcp's tests/journal.test.ts, and extended.
 *
 * The write path is unchanged in substance, so the format assertions carry over
 * verbatim — the markdown layout is a contract with files already on disk.
 * What changed is where the index lives: upstream every write produced a
 * `<entry>.embedding` JSON sidecar and the "2 files" assertions checked for it.
 * There is one SQLite store now, so those assertions became "one .md on disk,
 * one row in the index, and no sidecar".
 *
 * Runs offline: JournalStore takes an injected encoder. Upstream's equivalent
 * suite could only run because a jest setup file globally mocked the transformers
 * package with a pipeline that returned the SAME five-element vector for every
 * input — which also made both of its "semantic" assertions pass vacuously with
 * every cosine at exactly 1.0.
 */
function formattedDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

describe("JournalStore", () => {
  let projectDir: string;
  let userDir: string;
  let dataDir: string;
  let store: JournalStore;
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
  });

  afterEach(async () => {
    db.close();
    delete process.env.MOE_MEMORY_CONFIG_DIR;
    delete process.env.TEST_DB_PATH;
    await fs.rm(projectDir, { recursive: true, force: true });
    await fs.rm(userDir, { recursive: true, force: true });
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  async function entriesIn(base: string): Promise<string[]> {
    const dayDir = path.join(base, formattedDate(new Date()));
    return fs.readdir(dayDir);
  }

  it("writes project notes to the project directory, indexed as scope=project", async () => {
    await store.writeThoughts({ project_notes: "The architecture is solid" }, db);

    const files = await entriesIn(projectDir);
    expect(files.filter((f) => f.endsWith(".md"))).toHaveLength(1);
    // No `.embedding` sidecar: the index is a table now.
    expect(files.filter((f) => f.endsWith(".embedding"))).toHaveLength(0);

    const mdFile = files.find((f) => f.endsWith(".md")) as string;
    const content = await fs.readFile(
      path.join(projectDir, formattedDate(new Date()), mdFile),
      "utf8",
    );
    expect(content).toContain("## Project Notes");
    expect(content).toContain("The architecture is solid");
    expect(content).not.toContain("## Reflections");

    expect(countJournalEntries(db, "project")).toBe(1);
    expect(countJournalEntries(db, "user")).toBe(0);
  });

  it("produces filenames with microsecond precision", async () => {
    await store.writeThoughts({ reflections: "Filename format check" }, db);

    const files = await entriesIn(userDir);
    const mdFile = files.find((f) => f.endsWith(".md"));
    expect(mdFile).toBeDefined();
    expect(mdFile).toMatch(/^\d{2}-\d{2}-\d{2}-\d{6}\.md$/);
  });

  it("emits well-formed YAML frontmatter", async () => {
    await store.writeThoughts({ reflections: "Frontmatter shape check" }, db);

    const files = await entriesIn(userDir);
    const mdFile = files.find((f) => f.endsWith(".md")) as string;
    const content = await fs.readFile(
      path.join(userDir, formattedDate(new Date()), mdFile),
      "utf8",
    );

    const lines = content.split("\n");
    expect(lines[0]).toBe("---");
    expect(lines[1]).toMatch(/^title: ".*"$/);
    expect(lines[2]).toMatch(/^date: \d{4}-\d{2}-\d{2}T/);
    expect(lines[3]).toMatch(/^timestamp: \d+$/);
    expect(lines[4]).toBe("---");
  });

  it("produces distinct filenames for rapid successive writes", async () => {
    await store.writeThoughts({ reflections: "First rapid entry" }, db);
    await store.writeThoughts({ reflections: "Second rapid entry" }, db);

    const mdFiles = (await entriesIn(userDir)).filter((f) => f.endsWith(".md"));
    expect(mdFiles).toHaveLength(2);
    expect(mdFiles[0]).not.toEqual(mdFiles[1]);
  });

  it("writes user thoughts to the user directory", async () => {
    await store.writeThoughts(
      {
        reflections: "I feel great about this feature",
        technical_insights: "TypeScript interfaces are powerful",
      },
      db,
    );

    const files = await entriesIn(userDir);
    expect(files.filter((f) => f.endsWith(".md"))).toHaveLength(1);

    const mdFile = files.find((f) => f.endsWith(".md")) as string;
    const content = await fs.readFile(
      path.join(userDir, formattedDate(new Date()), mdFile),
      "utf8",
    );
    expect(content).toContain("## Reflections");
    expect(content).toContain("I feel great about this feature");
    expect(content).toContain("## Technical Insights");
    expect(content).toContain("TypeScript interfaces are powerful");
    expect(content).not.toContain("## Project Notes");
  });

  it("writes observations to the user directory", async () => {
    await store.writeThoughts(
      { observations: "I noticed the test runner caches pycache weirdly" },
      db,
    );

    const files = await entriesIn(userDir);
    const mdFile = files.find((f) => f.endsWith(".md")) as string;
    const content = await fs.readFile(
      path.join(userDir, formattedDate(new Date()), mdFile),
      "utf8",
    );
    expect(content).toContain("## Observations");
    expect(content).toContain("I noticed the test runner caches pycache weirdly");
    expect(content).not.toContain("## Project Notes");
  });

  it("splits thoughts between the project and user directories", async () => {
    await store.writeThoughts(
      {
        reflections: "I feel great",
        project_notes: "The architecture is solid",
        user_context: "My collaborator prefers simple solutions",
        technical_insights: "TypeScript is powerful",
        world_knowledge: "Git workflows matter",
      },
      db,
    );

    const projectMd = (await entriesIn(projectDir)).find((f) => f.endsWith(".md")) as string;
    const projectContent = await fs.readFile(
      path.join(projectDir, formattedDate(new Date()), projectMd),
      "utf8",
    );
    expect(projectContent).toContain("## Project Notes");
    expect(projectContent).not.toContain("## Reflections");

    const userMd = (await entriesIn(userDir)).find((f) => f.endsWith(".md")) as string;
    const userContent = await fs.readFile(
      path.join(userDir, formattedDate(new Date()), userMd),
      "utf8",
    );
    expect(userContent).toContain("## Reflections");
    expect(userContent).toContain("## User Context");
    expect(userContent).toContain("## Technical Insights");
    expect(userContent).toContain("## World Knowledge");
    expect(userContent).not.toContain("## Project Notes");

    expect(countJournalEntries(db, "project")).toBe(1);
    expect(countJournalEntries(db, "user")).toBe(1);
  });

  it("creates no project directory when only user sections are supplied", async () => {
    await store.writeThoughts(
      { world_knowledge: "Learned something interesting about databases" },
      db,
    );

    expect((await entriesIn(userDir)).filter((f) => f.endsWith(".md"))).toHaveLength(1);
    expect(existsSync(path.join(projectDir, formattedDate(new Date())))).toBe(false);
  });

  it("creates no user directory when only project sections are supplied", async () => {
    await store.writeThoughts({ project_notes: "This specific codebase pattern works well" }, db);

    expect((await entriesIn(projectDir)).filter((f) => f.endsWith(".md"))).toHaveLength(1);
    expect(existsSync(path.join(userDir, formattedDate(new Date())))).toBe(false);
  });

  it("honours an explicit user journal path", async () => {
    const customUserDir = await fs.mkdtemp(path.join(os.tmpdir(), "custom-user-"));
    const custom = new JournalStore({
      projectPath: projectDir,
      userPath: customUserDir,
      embed: fakeEmbed(),
    });

    try {
      await custom.writeThoughts({ reflections: "Testing custom path" }, db);

      const files = await entriesIn(customUserDir);
      const mdFile = files.find((f) => f.endsWith(".md")) as string;
      const content = await fs.readFile(
        path.join(customUserDir, formattedDate(new Date()), mdFile),
        "utf8",
      );
      expect(content).toContain("Testing custom path");
    } finally {
      await fs.rm(customUserDir, { recursive: true, force: true });
    }
  });

  describe("indexJournal", () => {
    async function writeRawEntry(base: string, day: string, name: string, body: string) {
      const dir = path.join(base, day);
      await fs.mkdir(dir, { recursive: true });
      const file = path.join(dir, name);
      await fs.writeFile(
        file,
        `---\ntitle: "x"\ndate: ${new Date().toISOString()}\ntimestamp: ${Date.now()}\n---\n\n${body}\n`,
        "utf8",
      );
      return file;
    }

    it("indexes a markdown file that was never indexed at write time", async () => {
      await writeRawEntry(userDir, "2025-05-27", "20-16-46-544103.md", "## Reflections\n\nboop");

      const result = await store.indexJournal(db);
      expect(result.total).toBe(1);
      expect(result.indexed).toBe(1);
      expect(countJournalEntries(db)).toBe(1);
    });

    it("is a no-op on a second run — nothing is re-embedded needlessly", async () => {
      await writeRawEntry(userDir, "2025-05-27", "20-16-46-544103.md", "## Reflections\n\nboop");
      await store.indexJournal(db);

      const second = await store.indexJournal(db);
      expect(second.total).toBe(1);
      expect(second.indexed).toBe(0);
    });

    it("re-indexes an entry whose file changed — upstream keyed only on sidecar absence", async () => {
      const file = await writeRawEntry(
        userDir,
        "2025-05-27",
        "20-16-46-544103.md",
        "## Reflections\n\noriginal",
      );
      await store.indexJournal(db);

      await fs.writeFile(
        file,
        `---\ntitle: "x"\ndate: ${new Date().toISOString()}\ntimestamp: ${Date.now()}\n---\n\n## Reflections\n\nedited\n`,
        "utf8",
      );
      const future = new Date(Date.now() + 5000);
      utimesSync(file, future, future);

      const result = await store.indexJournal(db);
      expect(result.indexed).toBe(1);
      const row = db.prepare("SELECT text FROM journal_entries").get() as { text: string };
      expect(row.text).toContain("edited");
    });

    it("prunes rows whose markdown file is gone", async () => {
      const file = await writeRawEntry(
        userDir,
        "2025-05-27",
        "20-16-46-544103.md",
        "## Reflections\n\nboop",
      );
      await store.indexJournal(db);
      expect(countJournalEntries(db)).toBe(1);

      await fs.rm(file);
      const result = await store.indexJournal(db);
      expect(result.pruned).toBe(1);
      expect(countJournalEntries(db)).toBe(0);
    });

    it("refreshes the stored path from the walk rather than trusting what was written", async () => {
      // Upstream baked an ABSOLUTE path into each sidecar and returned THAT from
      // search, so renaming the journal directory produced hits that
      // read_journal_entry then refused with a security-flavoured error.
      await writeRawEntry(userDir, "2025-05-27", "20-16-46-544103.md", "## Reflections\n\nboop");
      await store.indexJournal(db);

      const row = db.prepare("SELECT path FROM journal_entries").get() as { path: string };
      expect(row.path).toBe(path.join(userDir, "2025-05-27", "20-16-46-544103.md"));
    });

    it("ignores directories that are not YYYY-MM-DD", async () => {
      await fs.mkdir(path.join(userDir, "notes"), { recursive: true });
      await fs.writeFile(path.join(userDir, "notes", "stray.md"), "## Reflections\n\nx", "utf8");

      const result = await store.indexJournal(db);
      expect(result.total).toBe(0);
      expect(countJournalEntries(db)).toBe(0);
    });

    it("recovers an entry whose embedding failed at write time", async () => {
      // Upstream this was a permanent loss: the sidecar index was the only
      // enumeration path, so an entry written with a failed encode could never
      // be found again by search, list_recent_entries or read_recent_entries.
      let fail = true;
      const flaky = new JournalStore({
        projectPath: projectDir,
        userPath: userDir,
        embed: async (text: string) => {
          if (fail) throw new Error("encoder unavailable");
          return fakeEmbed()(text);
        },
      });

      await flaky.writeThoughts({ reflections: "written while the encoder was down" }, db);
      expect((await entriesIn(userDir)).filter((f) => f.endsWith(".md"))).toHaveLength(1);
      expect(countJournalEntries(db)).toBe(0);

      fail = false;
      const result = await flaky.indexJournal(db);
      expect(result.indexed).toBe(1);
      expect(countJournalEntries(db)).toBe(1);
    });
  });

  describe("collapsed roots", () => {
    it("labels entries by their sections when one directory serves both journals", async () => {
      // MOE_MEMORY_JOURNAL_PATH points project and user at the same directory —
      // the documented containerised configuration. Upstream walked it twice and
      // double-counted every entry.
      const collapsed = new JournalStore({
        projectPath: projectDir,
        userPath: projectDir,
        embed: fakeEmbed(),
      });
      expect(collapsed.roots()).toHaveLength(1);

      await collapsed.writeThoughts(
        { project_notes: "belongs to the codebase", reflections: "belongs to me" },
        db,
      );

      expect(countJournalEntries(db, "project")).toBe(1);
      expect(countJournalEntries(db, "user")).toBe(1);
      expect(countJournalEntries(db)).toBe(2);
    });
  });
});
