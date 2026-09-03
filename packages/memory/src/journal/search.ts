/**
 * Journal retrieval.
 *
 * Reconciled from private-journal-mcp's `SearchService`. The storage half lost:
 * its `search()` loaded every `.embedding` sidecar under both roots into memory
 * on every query and cosine-scored them in JS — O(n) I/O and O(n) memory per
 * call, with no cache. That is replaced by the same sqlite-vec KNN the
 * conversation half uses, over `vec_journal_entries`.
 *
 * Two things were carried FORWARD unchanged in substance, because they are the
 * best-engineered code in that source and the conversation half has no
 * equivalent:
 *
 *   - `readEntry`'s two-stage containment guard: resolve, require `.md`, require
 *     containment in the journal roots, realpath, then require containment in
 *     the REALPATH'd roots. The second stage blocks a symlink escape, and the
 *     two stages exist precisely because macOS `/tmp` and `/var` are symlinks —
 *     do not "simplify" it to one check.
 *   - `generateExcerpt`, in ./markdown.ts.
 *
 * `SearchResult` and `SearchOptions` were exported by BOTH upstream `search.ts`
 * files with different shapes. The conversation names keep their meaning; these
 * are `JournalSearchResult` and `JournalSearchOptions`, so the barrel can export
 * all four.
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { MemoryDatabase } from "../db.js";
import { JOURNAL_SELECT_COLUMNS, journalEntryFromRow } from "../db.js";
import { type EmbedFn, generateQueryEmbedding } from "../embeddings.js";
import { l2DistanceToCosineSimilarity } from "../search.js";
import type { JournalScope, JournalSearchResult } from "../types.js";
import { generateExcerpt, sectionsMatch } from "./markdown.js";

/** `both` means "do not filter by scope", matching upstream's `type` parameter. */
export type JournalScopeFilter = JournalScope | "both";

export interface JournalSearchOptions {
  limit?: number | undefined;
  minScore?: number | undefined;
  sections?: string[] | undefined;
  dateRange?:
    | {
        start?: Date | undefined;
        end?: Date | undefined;
      }
    | undefined;
  /** Which journal to search. Named `type` on the MCP wire; kept as `scope` here. */
  scope?: JournalScopeFilter | undefined;
}

export interface JournalRecentOptions {
  limit?: number | undefined;
  scope?: JournalScopeFilter | undefined;
  dateRange?:
    | {
        start?: Date | undefined;
        end?: Date | undefined;
      }
    | undefined;
}

export interface JournalEntryContent {
  path: string;
  content: string;
  sections: string[];
  timestamp: number;
  scope: JournalScope;
}

interface Filters {
  sql: string;
  params: Array<string | number>;
}

function buildFilters(
  options: {
    scope?: JournalScopeFilter | undefined;
    dateRange?: { start?: Date | undefined; end?: Date | undefined } | undefined;
  },
  roots: readonly string[],
): Filters {
  const parts: string[] = [];
  const params: Array<string | number> = [];
  // Confine retrieval to the roots this service was constructed with.
  //
  // The service has always been handed them and never used them for filtering,
  // so a `scope: "project"` entry written in one repo was returned in every
  // other repo on the machine — they all share one database. The roots are the
  // current project's journal directory plus the shared user directory, so user
  // entries, which deliberately follow the person between projects, still match.
  if (roots.length > 0) {
    parts.push(`j.root IN (${roots.map(() => "?").join(", ")})`);
    params.push(...roots);
  }
  if (options.scope && options.scope !== "both") {
    parts.push("j.scope = ?");
    params.push(options.scope);
  }
  if (options.dateRange?.start) {
    parts.push("j.timestamp >= ?");
    params.push(options.dateRange.start.getTime());
  }
  if (options.dateRange?.end) {
    parts.push("j.timestamp <= ?");
    params.push(options.dateRange.end.getTime());
  }
  return { sql: parts.length ? `AND ${parts.join(" AND ")}` : "", params };
}

export interface JournalSearchServiceOptions {
  /**
   * Injected query encoder. Defaults to `generateQueryEmbedding`, which prepends
   * the BGE retrieval prefix — bge is asymmetric, and private-journal-mcp
   * embedded its queries with the same call it used for documents, which costs
   * recall silently. The seam exists so the CI-safe test project can exercise
   * retrieval without a model download; production should never pass it.
   */
  embedQuery?: EmbedFn | undefined;
}

export class JournalSearchService {
  private readonly roots: string[];
  private readonly embedQuery: EmbedFn;

  /**
   * @param db    an open database from `initDatabase()`
   * @param roots the journal roots, already de-duplicated (see `JournalStore.roots`)
   */
  constructor(
    private readonly db: MemoryDatabase,
    roots: string[],
    options: JournalSearchServiceOptions = {},
  ) {
    this.roots = roots.map((root) => path.resolve(root));
    this.embedQuery = options.embedQuery ?? generateQueryEmbedding;
  }

  async search(query: string, options: JournalSearchOptions = {}): Promise<JournalSearchResult[]> {
    const limit = options.limit ?? 10;
    const minScore = options.minScore ?? 0.1;
    const sections = options.sections ?? [];

    const queryEmbedding = await this.embedQuery(query);
    const { sql: filterClause, params: filterParams } = buildFilters(options, this.roots);

    // vec0 applies KNN before WHERE, so ask for more candidates than `limit`
    // whenever a filter is active and trim afterwards — the same correction the
    // conversation search makes for its metadata filters.
    const overfetch = filterClause || sections.length > 0 ? 5 : 1;

    const rows = this.db
      .prepare(`
      SELECT
        ${JOURNAL_SELECT_COLUMNS},
        vec.distance
      FROM vec_journal_entries AS vec
      JOIN journal_entries AS j ON vec.id = j.id
      WHERE vec.embedding MATCH ?
        AND k = ?
        ${filterClause}
      ORDER BY vec.distance ASC
    `)
      .all(
        new Uint8Array(new Float32Array(queryEmbedding).buffer),
        limit * overfetch,
        ...filterParams,
      ) as unknown as Array<Parameters<typeof journalEntryFromRow>[0] & { distance: number }>;

    const results: JournalSearchResult[] = [];
    for (const row of rows) {
      const entry = journalEntryFromRow(row);
      if (!sectionsMatch(entry.sections, sections)) continue;
      const score = l2DistanceToCosineSimilarity(row.distance);
      if (score < minScore) continue;
      results.push({ entry, score, excerpt: generateExcerpt(entry.text, query) });
      if (results.length >= limit) break;
    }
    return results;
  }

  listRecent(options: JournalRecentOptions = {}): JournalSearchResult[] {
    const limit = options.limit ?? 10;
    const { sql: filterClause, params: filterParams } = buildFilters(options, this.roots);

    const rows = this.db
      .prepare(`
      SELECT ${JOURNAL_SELECT_COLUMNS}
      FROM journal_entries AS j
      WHERE 1 = 1
        ${filterClause}
      ORDER BY j.timestamp DESC
      LIMIT ?
    `)
      .all(...filterParams, limit) as unknown as Array<Parameters<typeof journalEntryFromRow>[0]>;

    return rows.map((row) => {
      const entry = journalEntryFromRow(row);
      // No similarity score for a chronological listing — upstream reported 1.
      return { entry, score: 1, excerpt: generateExcerpt(entry.text, "", 150) };
    });
  }

  async readRecentEntries(
    options: { limit?: number | undefined; scope?: JournalScopeFilter | undefined } = {},
  ): Promise<JournalEntryContent[]> {
    const recent = this.listRecent({ limit: options.limit ?? 5, scope: options.scope });

    const results: JournalEntryContent[] = [];
    for (const hit of recent) {
      const content = await this.readEntry(hit.entry.path);
      if (content !== null) {
        results.push({
          path: hit.entry.path,
          content,
          sections: hit.entry.sections,
          timestamp: hit.entry.timestamp,
          scope: hit.entry.scope,
        });
      }
    }
    return results;
  }

  /**
   * Read one entry off disk.
   *
   * Carried over from private-journal-mcp with its guard intact. The error text
   * is treated as API by three assertions, so it is preserved verbatim.
   */
  async readEntry(filePath: string): Promise<string | null> {
    const resolvedPath = path.resolve(filePath);

    // Only Markdown entries under the journal directories are readable; reject
    // anything else with a clear error.
    if (path.extname(resolvedPath).toLowerCase() !== ".md") {
      throw new Error(`${resolvedPath} is not a readable journal entry`);
    }
    if (!isUnderRoot(resolvedPath, this.roots)) {
      throw new Error(`${resolvedPath} is not a readable journal entry`);
    }

    let realPath: string;
    try {
      realPath = await fs.realpath(resolvedPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
        return null;
      }
      throw error;
    }

    // Resolve symlinks and confirm the real file is still under a journal
    // directory before reading.
    if (!isUnderRoot(realPath, await this.realRoots())) {
      throw new Error(`${resolvedPath} is not a readable journal entry`);
    }

    try {
      return await fs.readFile(realPath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  private async realRoots(): Promise<string[]> {
    const roots: string[] = [];
    for (const root of this.roots) {
      try {
        roots.push(await fs.realpath(root));
      } catch {
        // A journal root that doesn't exist on disk can't contain anything.
      }
    }
    return roots;
  }
}

function isUnderRoot(candidate: string, roots: string[]): boolean {
  return roots.some((root) => candidate === root || candidate.startsWith(root + path.sep));
}
