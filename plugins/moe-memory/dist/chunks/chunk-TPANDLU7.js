// @generated — do not edit; see scripts/build-runtime.mjs
import { createRequire as __createRequire } from 'module';
const require = __createRequire(import.meta.url);
import {
  generateExcerpt,
  sectionsMatch
} from "./chunk-XQQVRDY6.js";
import {
  isVectorQueryAuthorized,
  l2DistanceToCosineSimilarity
} from "./chunk-ESBWE2AP.js";
import {
  generateQueryEmbedding
} from "./chunk-TD4KRVGL.js";
import {
  JOURNAL_SELECT_COLUMNS,
  journalEntryFromRow
} from "./chunk-X4QDSJ7Q.js";

// src/journal/search.ts
import fs from "node:fs/promises";
import path from "node:path";
function buildFilters(options, roots) {
  const parts = [];
  const params = [];
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
var JournalSearchService = class {
  /**
   * @param db    an open database from `initDatabase()`
   * @param roots the journal roots, already de-duplicated (see `JournalStore.roots`)
   */
  constructor(db, roots, options = {}) {
    this.db = db;
    this.roots = roots.map((root) => path.resolve(root));
    this.embedQuery = options.embedQuery ?? generateQueryEmbedding;
  }
  roots;
  embedQuery;
  async search(query, options = {}) {
    const limit = options.limit ?? 10;
    const minScore = options.minScore ?? 0.1;
    const sections = options.sections ?? [];
    if (!isVectorQueryAuthorized(this.db)) {
      return [];
    }
    const queryEmbedding = await this.embedQuery(query);
    const { sql: filterClause, params: filterParams } = buildFilters(options, this.roots);
    const overfetch = filterClause || sections.length > 0 ? 5 : 1;
    const rows = this.db.prepare(`
      SELECT
        ${JOURNAL_SELECT_COLUMNS},
        vec.distance
      FROM vec_journal_entries AS vec
      JOIN journal_entries AS j ON vec.id = j.id
      WHERE vec.embedding MATCH ?
        AND k = ?
        AND j.embedding_version = 3
        ${filterClause}
      ORDER BY vec.distance ASC
    `).all(
      new Uint8Array(new Float32Array(queryEmbedding).buffer),
      limit * overfetch,
      ...filterParams
    );
    const results = [];
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
  listRecent(options = {}) {
    const limit = options.limit ?? 10;
    const { sql: filterClause, params: filterParams } = buildFilters(options, this.roots);
    const rows = this.db.prepare(`
      SELECT ${JOURNAL_SELECT_COLUMNS}
      FROM journal_entries AS j
      WHERE 1 = 1
        ${filterClause}
      ORDER BY j.timestamp DESC
      LIMIT ?
    `).all(...filterParams, limit);
    return rows.map((row) => {
      const entry = journalEntryFromRow(row);
      return { entry, score: 1, excerpt: generateExcerpt(entry.text, "", 150) };
    });
  }
  async readRecentEntries(options = {}) {
    const recent = this.listRecent({ limit: options.limit ?? 5, scope: options.scope });
    const results = [];
    for (const hit of recent) {
      const content = await this.readEntry(hit.entry.path);
      if (content !== null) {
        results.push({
          path: hit.entry.path,
          content,
          sections: hit.entry.sections,
          timestamp: hit.entry.timestamp,
          scope: hit.entry.scope
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
  async readEntry(filePath) {
    const resolvedPath = path.resolve(filePath);
    if (path.extname(resolvedPath).toLowerCase() !== ".md") {
      throw new Error(`${resolvedPath} is not a readable journal entry`);
    }
    if (!isUnderRoot(resolvedPath, this.roots)) {
      throw new Error(`${resolvedPath} is not a readable journal entry`);
    }
    let realPath;
    try {
      realPath = await fs.realpath(resolvedPath);
    } catch (error) {
      if (error?.code === "ENOENT") {
        return null;
      }
      throw error;
    }
    if (!isUnderRoot(realPath, await this.realRoots())) {
      throw new Error(`${resolvedPath} is not a readable journal entry`);
    }
    try {
      return await fs.readFile(realPath, "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }
  async realRoots() {
    const roots = [];
    for (const root of this.roots) {
      try {
        roots.push(await fs.realpath(root));
      } catch {
      }
    }
    return roots;
  }
};
function isUnderRoot(candidate, roots) {
  return roots.some((root) => candidate === root || candidate.startsWith(root + path.sep));
}

export {
  JournalSearchService
};
