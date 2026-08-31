/**
 * One-way importer for private-journal-mcp's `.embedding` sidecars.
 *
 * Upstream wrote, beside every `<entry>.md`, an `<entry>.embedding` JSON file:
 *
 *   { embedding: number[], text: string, sections: string[], timestamp: number, path: string }
 *
 * Two reasons that data cannot simply be loaded into the new index:
 *
 * 1. **The vectors are from a different encoder.** Sidecars were produced by
 *    `Xenova/all-MiniLM-L6-v2`; this package embeds with `Xenova/bge-small-en-v1.5`
 *    at dtype q8 and an asymmetric query prefix. Both are 384-dimensional, so a
 *    vec0 column accepts either without complaint and a mixed corpus ranks
 *    wrongly with no error. So the sidecar's `embedding` array is DISCARDED and
 *    the entry is re-embedded from its markdown.
 * 2. **`path` was baked in absolute.** Upstream's search returned the path stored
 *    inside the JSON rather than the path it had just walked, so renaming the
 *    journal directory produced results that `read_journal_entry` then refused.
 *    So the sidecar's `path` is DISCARDED too, and the walk decides.
 *
 * Which leaves nothing worth importing from the sidecar itself. What this
 * function actually does is find the orphans — `.md` files with a sidecar whose
 * day-directory is not where the new layout expects it — and, mainly, delete the
 * sidecars once the entry is indexed, so the old and new indexes cannot drift.
 *
 * It is opt-in (`moe-memory journal import-legacy`) and never runs on its own:
 * deleting a file the user might still want read by an upstream install is not
 * something to do silently.
 */

import fs from "node:fs/promises";
import path from "node:path";
import type Database from "better-sqlite3";
import { getJournalIndexState } from "../db.js";
import { DAY_DIR_PATTERN, journalEntryId } from "./markdown.js";
import type { JournalStore } from "./store.js";

export interface LegacyImportResult {
  /** Sidecars found on disk. */
  found: number;
  /** Sidecars whose entry is now present in the SQLite index. */
  indexed: number;
  /** Sidecars deleted (only when `remove` is set and the entry is indexed). */
  removed: number;
  /** Sidecars with no surviving `.md` beside them. */
  orphaned: string[];
}

export async function importLegacyJournalSidecars(
  db: Database.Database,
  store: JournalStore,
  options: { remove?: boolean } = {},
): Promise<LegacyImportResult> {
  const result: LegacyImportResult = { found: 0, indexed: 0, removed: 0, orphaned: [] };

  // Re-index first: the markdown files are the source of truth, and every
  // sidecar's entry has to exist in the new index before we consider deleting it.
  await store.indexJournal(db);
  const state = getJournalIndexState(db);

  for (const root of store.roots()) {
    let dayDirs: string[];
    try {
      dayDirs = await fs.readdir(root.path);
    } catch {
      continue;
    }

    for (const dayDir of dayDirs) {
      if (!DAY_DIR_PATTERN.test(dayDir)) continue;
      const dayPath = path.join(root.path, dayDir);
      let files: string[];
      try {
        files = await fs.readdir(dayPath);
      } catch {
        continue;
      }

      for (const file of files) {
        if (!file.endsWith(".embedding")) continue;
        result.found++;
        const sidecarPath = path.join(dayPath, file);
        const entryPath = sidecarPath.replace(/\.embedding$/, ".md");

        try {
          await fs.access(entryPath);
        } catch {
          result.orphaned.push(sidecarPath);
          continue;
        }

        // The scope the walk would assign is not knowable here without reading
        // the entry, so check both possibilities.
        const indexed =
          state.has(journalEntryId("project", root.path, entryPath)) ||
          state.has(journalEntryId("user", root.path, entryPath));
        if (!indexed) continue;
        result.indexed++;

        if (options.remove) {
          try {
            await fs.unlink(sidecarPath);
            result.removed++;
          } catch (error) {
            console.error(
              `moe-memory: could not remove legacy sidecar ${sidecarPath}: ${String(error)}`,
            );
          }
        }
      }
    }
  }

  return result;
}
