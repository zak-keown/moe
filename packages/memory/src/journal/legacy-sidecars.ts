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
 *
 * FIXED: it searched only the CURRENT roots. The command exists because the
 * paths moved on import — `<project>/.private-journal` → `<project>/.moe-journal`
 * and `~/.private-journal` → `<data dir>/journal` — so on any install that had
 * not already hand-copied its journal across, it walked exactly the two
 * directories the sidecars provably are not in, found nothing, and printed
 * "Legacy .embedding sidecars found: 0". Indistinguishable from success. It now
 * also surveys the upstream directories (`findLegacyJournalRoots`) and reports
 * them in `legacy`, so the caller can tell the user their data is over there.
 *
 * It reports rather than migrates, deliberately, matching `findLegacyDataDir`.
 * Journal entries are private reflections; quietly relocating them is worse
 * than quietly relocating a conversation archive, and that was already judged
 * too much to do behind someone's back.
 */

import fs from "node:fs/promises";
import path from "node:path";
import type Database from "better-sqlite3";
import { getJournalIndexState } from "../db.js";
import { findLegacyJournalRoots } from "../paths.js";
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
  /**
   * Upstream journal directories that exist but are NOT being walked, with what
   * is sitting in them.
   *
   * Empty is the normal case. Non-empty means this command cannot do its job
   * yet: the paths moved on import (`.private-journal` → `.moe-journal`,
   * `~/.private-journal` → `<data dir>/journal`), so the sidecars are still
   * over there and nothing here can see them. Reported rather than migrated —
   * see `findLegacyJournalRoots`.
   */
  legacy: Array<{ root: string; entries: number; sidecars: number }>;
}

/** Count `.md` entries and `.embedding` sidecars under a journal root. */
async function surveyRoot(root: string): Promise<{ entries: number; sidecars: number }> {
  let entries = 0;
  let sidecars = 0;
  let dayDirs: string[];
  try {
    dayDirs = await fs.readdir(root);
  } catch {
    return { entries, sidecars };
  }
  for (const dayDir of dayDirs) {
    if (!DAY_DIR_PATTERN.test(dayDir)) continue;
    let files: string[];
    try {
      files = await fs.readdir(path.join(root, dayDir));
    } catch {
      continue;
    }
    for (const file of files) {
      if (file.endsWith(".md")) entries++;
      else if (file.endsWith(".embedding")) sidecars++;
    }
  }
  return { entries, sidecars };
}

export async function importLegacyJournalSidecars(
  db: Database.Database,
  store: JournalStore,
  options: { remove?: boolean } = {},
): Promise<LegacyImportResult> {
  const result: LegacyImportResult = {
    found: 0,
    indexed: 0,
    removed: 0,
    orphaned: [],
    legacy: [],
  };

  // Look where the data actually is before reporting zero.
  for (const legacyRoot of findLegacyJournalRoots()) {
    const survey = await surveyRoot(legacyRoot);
    if (survey.entries === 0 && survey.sidecars === 0) continue;
    result.legacy.push({ root: legacyRoot, ...survey });
  }

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
