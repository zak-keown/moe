/**
 * The journal write path and its index.
 *
 * Reconciled from private-journal-mcp's `JournalManager`. The markdown-writing
 * half is carried over essentially unchanged — it is a data contract with files
 * already on disk. The persistence half changed completely: entries are indexed
 * into the shared SQLite store instead of a `.embedding` JSON sidecar per file.
 *
 * That swap fixes a real defect. Upstream, `generateEmbeddingForEntry` caught and
 * logged every embedding error so "embedding failure shouldn't prevent journal
 * writing" — but the sidecar index was the ONLY enumeration path in the package,
 * so a failed encode wrote an entry that no read path could ever see again, with
 * no doctor or verify command to notice. Here the markdown files are the source
 * of truth: `indexJournal()` walks them, and anything missing from the index or
 * behind the current EMBEDDING_VERSION is picked up on the next run.
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { MemoryDatabase } from "../db.js";
import {
  countJournalEntries,
  deleteJournalEntry,
  getJournalIndexState,
  upsertJournalEntry,
} from "../db.js";
import { EMBEDDING_VERSION } from "../embedding-migration.js";
import { type EmbedFn, generateEntryEmbedding } from "../embeddings.js";
import { resolveProjectJournalPath, resolveUserJournalPath } from "../paths.js";
import type { JournalEntry, JournalScope, JournalThoughts } from "../types.js";
import {
  DAY_DIR_PATTERN,
  extractSearchableText,
  formatDayDirectory,
  formatEntry,
  formatEntryBasename,
  journalEntryId,
  timestampFromEntryPath,
  timestampFromFrontmatter,
} from "./markdown.js";

export interface JournalStoreOptions {
  projectPath?: string | undefined;
  userPath?: string | undefined;
  /**
   * Injected encoder. Defaults to the real bge pipeline; the offline test
   * project passes a deterministic stub so the write path and the index can be
   * exercised without a 35 MB model download.
   */
  embed?: EmbedFn | undefined;
}

export interface JournalIndexResult {
  indexed: number;
  pruned: number;
  failed: number;
  total: number;
}

interface JournalRoot {
  scope: JournalScope;
  path: string;
}

/**
 * `project_notes` is the only category that belongs to the codebase. The other
 * five belong to the person, and follow them between projects.
 */
const PROJECT_KEYS: ReadonlyArray<keyof JournalThoughts> = ["project_notes"];
const USER_KEYS: ReadonlyArray<keyof JournalThoughts> = [
  "reflections",
  "observations",
  "user_context",
  "technical_insights",
  "world_knowledge",
];

function pick(thoughts: JournalThoughts, keys: ReadonlyArray<keyof JournalThoughts>) {
  const out: JournalThoughts = {};
  for (const key of keys) {
    const value = thoughts[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function hasContent(thoughts: JournalThoughts): boolean {
  return Object.values(thoughts).some((value) => value !== undefined && value !== "");
}

export class JournalStore {
  private readonly projectPath: string;
  private readonly userPath: string;
  private readonly embed: EmbedFn;

  constructor(options: JournalStoreOptions = {}) {
    this.projectPath = path.resolve(options.projectPath ?? resolveProjectJournalPath());
    this.userPath = path.resolve(options.userPath ?? resolveUserJournalPath());
    this.embed = options.embed ?? generateEntryEmbedding;
  }

  /**
   * The roots to walk, de-duplicated.
   *
   * When `MOE_MEMORY_JOURNAL_PATH` is set both resolve to the same directory.
   * Upstream loaded such a directory twice — once labelled `project`, once
   * `user` — so every entry appeared twice with contradictory labels and
   * `limit: 10` yielded 5 unique entries. That is the documented containerised
   * configuration, i.e. the one most likely to be used in infra.
   */
  roots(): JournalRoot[] {
    if (this.projectPath === this.userPath) {
      return [{ scope: "user", path: this.userPath }];
    }
    return [
      { scope: "project", path: this.projectPath },
      { scope: "user", path: this.userPath },
    ];
  }

  private get collapsed(): boolean {
    return this.projectPath === this.userPath;
  }

  /**
   * Which journal an entry belongs to.
   *
   * Normally the directory decides. When the roots are collapsed there is no
   * directory to decide, so the entry's own sections do: `writeThoughts` routes
   * `project_notes` to the project journal and nothing else, so the presence of
   * a `## Project Notes` heading is a faithful discriminator either way.
   */
  private scopeFor(root: JournalRoot, sections: string[]): JournalScope {
    if (!this.collapsed) return root.scope;
    const isProject = sections.some(
      (section) => section.toLowerCase().replace(/[^a-z0-9]/g, "") === "projectnotes",
    );
    return isProject ? "project" : "user";
  }

  /**
   * Write one set of thoughts. `project_notes` lands in the project journal, the
   * other five in the user journal, and each side is skipped when empty — so a
   * `process_thoughts` call carrying only reflections creates no project
   * directory at all.
   *
   * `db` is optional: pass it to index the new entries immediately (what the MCP
   * server does), omit it to write markdown only.
   */
  async writeThoughts(thoughts: JournalThoughts, db?: MemoryDatabase): Promise<string[]> {
    const timestamp = new Date();
    const written: string[] = [];

    const projectThoughts = pick(thoughts, PROJECT_KEYS);
    if (hasContent(projectThoughts)) {
      written.push(await this.writeToLocation(projectThoughts, timestamp, this.projectPath));
    }

    const userThoughts = pick(thoughts, USER_KEYS);
    if (hasContent(userThoughts)) {
      written.push(await this.writeToLocation(userThoughts, timestamp, this.userPath));
    }

    if (db) {
      for (const entryPath of written) {
        await this.indexOne(db, entryPath).catch((error: unknown) => {
          // Not fatal, and no longer invisible: the markdown file is the source
          // of truth and indexJournal() will retry this entry on the next run.
          console.error(
            `moe-memory: journal entry written but not indexed (${entryPath}): ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        });
      }
    }

    return written;
  }

  private async writeToLocation(
    thoughts: JournalThoughts,
    timestamp: Date,
    basePath: string,
  ): Promise<string> {
    const dayDirectory = path.join(basePath, formatDayDirectory(timestamp));
    const filePath = path.join(dayDirectory, `${formatEntryBasename(timestamp)}.md`);

    await this.ensureDirectoryExists(dayDirectory);
    await fs.writeFile(filePath, formatEntry(thoughts, timestamp), "utf8");
    return filePath;
  }

  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.access(dirPath);
    } catch {
      try {
        await fs.mkdir(dirPath, { recursive: true });
      } catch (mkdirError) {
        throw new Error(
          `Failed to create journal directory at ${dirPath}: ${
            mkdirError instanceof Error ? mkdirError.message : String(mkdirError)
          }`,
        );
      }
    }
  }

  /**
   * Index one markdown file by absolute path. Used straight after a write.
   */
  private async indexOne(db: MemoryDatabase, entryPath: string): Promise<void> {
    const root = this.roots().find(
      (candidate) =>
        entryPath === candidate.path || entryPath.startsWith(candidate.path + path.sep),
    );
    if (!root) throw new Error(`${entryPath} is not under a journal root`);

    const content = await fs.readFile(entryPath, "utf8");
    const stat = await fs.stat(entryPath);
    await this.indexContent(db, root, entryPath, content, stat.mtimeMs);
  }

  private async indexContent(
    db: MemoryDatabase,
    root: JournalRoot,
    entryPath: string,
    content: string,
    mtimeMs: number,
  ): Promise<void> {
    const { text, sections } = extractSearchableText(content);
    if (text.trim().length === 0) return; // Nothing to embed

    const scope = this.scopeFor(root, sections);
    // Frontmatter first (epoch ms), then the filename (second resolution), then
    // the file's mtime. See timestampFromFrontmatter for why the order matters.
    const timestamp =
      timestampFromFrontmatter(content) ?? timestampFromEntryPath(entryPath)?.getTime() ?? mtimeMs;

    const entry: JournalEntry = {
      id: journalEntryId(scope, root.path, entryPath),
      path: entryPath,
      root: path.resolve(root.path),
      scope,
      timestamp,
      text,
      sections,
    };

    const embedding = await this.embed(text);
    upsertJournalEntry(db, entry, mtimeMs, embedding);
  }

  /**
   * Walk both journal roots and bring the index up to date.
   *
   * Replaces private-journal-mcp's `generateMissingEmbeddings()`, which keyed
   * purely on the absence of a `.embedding` sidecar. This one re-indexes when
   * the file's mtime moved or its row is behind EMBEDDING_VERSION, and prunes
   * rows whose file is gone — so an edited entry, a bumped encoder and a deleted
   * file are all handled.
   */
  async indexJournal(db: MemoryDatabase): Promise<JournalIndexResult> {
    const result: JournalIndexResult = { indexed: 0, pruned: 0, failed: 0, total: 0 };
    const state = getJournalIndexState(db);
    const seen = new Set<string>();

    for (const root of this.roots()) {
      let dayDirs: string[];
      try {
        dayDirs = await fs.readdir(root.path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
          console.error(`moe-memory: failed to scan journal root ${root.path}: ${String(error)}`);
        }
        continue;
      }

      for (const dayDir of dayDirs) {
        if (!DAY_DIR_PATTERN.test(dayDir)) continue;
        const dayPath = path.join(root.path, dayDir);
        let files: string[];
        try {
          const stat = await fs.stat(dayPath);
          if (!stat.isDirectory()) continue;
          files = await fs.readdir(dayPath);
        } catch {
          continue;
        }

        for (const file of files) {
          if (!file.endsWith(".md")) continue;
          const entryPath = path.join(dayPath, file);
          result.total++;

          try {
            const content = await fs.readFile(entryPath, "utf8");
            const stat = await fs.stat(entryPath);
            const { sections } = extractSearchableText(content);
            const scope = this.scopeFor(root, sections);
            const id = journalEntryId(scope, root.path, entryPath);
            seen.add(id);

            const existing = state.get(id);
            const fresh =
              existing !== undefined &&
              existing.path === entryPath &&
              existing.sourceMtimeMs === stat.mtimeMs &&
              existing.embeddingVersion === EMBEDDING_VERSION;
            if (fresh) continue;

            await this.indexContent(db, root, entryPath, content, stat.mtimeMs);
            result.indexed++;
          } catch (error) {
            result.failed++;
            console.error(
              `moe-memory: failed to index journal entry ${entryPath}: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          }
        }
      }
    }

    // Prune only what this walk was actually responsible for.
    //
    // One database holds every project's entries, and `seen` can only ever
    // contain ids from the roots above. Deleting everything absent from it
    // therefore deleted other repos' project notes — permanently, on every
    // server start. A row is a candidate for pruning only if its root is one of
    // the roots just walked; anything else belongs to a project that is not this
    // one, and its own next index is what will prune it.
    //
    // Rows written before `journal_entries.root` existed carry `''` and are
    // never pruned here. migrateJournalRoot clears them once, so the case is
    // transitional; treating an unknown root as "not mine" is the safe default
    // regardless.
    const walked = new Set(this.roots().map((root) => path.resolve(root.path)));
    for (const [id, row] of state) {
      if (seen.has(id)) continue;
      if (!row.root || !walked.has(row.root)) continue;
      deleteJournalEntry(db, id);
      result.pruned++;
    }

    return result;
  }

  /** Count indexed entries, optionally for one scope. */
  count(db: MemoryDatabase, scope?: JournalScope): number {
    return countJournalEntries(db, scope);
  }
}
