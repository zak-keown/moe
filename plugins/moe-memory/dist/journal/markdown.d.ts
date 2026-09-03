/**
 * The journal entry's on-disk format.
 *
 * Carried over from private-journal-mcp unchanged in substance, because it is a
 * data contract with files already written:
 *
 *   <root>/YYYY-MM-DD/HH-MM-SS-µµµµµµ.md
 *
 *   ---
 *   title: "3:04:05 PM - May 27, 2025"
 *   date: 2025-05-27T20:04:05.123Z
 *   timestamp: 1748376245123
 *   ---
 *
 *   ## Reflections
 *   …
 *
 * `µµµµµµ` is pseudo-microseconds — `ms * 1000 + floor(random() * 1000)` — so two
 * writes inside the same millisecond collide about one time in a thousand. Kept
 * as-is: changing the filename shape would orphan every existing entry, and the
 * collision is the upstream behaviour its tests pin.
 *
 * What is NOT carried over is the `.embedding` JSON sidecar. That was the only
 * enumeration path in the whole upstream package — search, list_recent_entries
 * and read_recent_entries all read `*.embedding` and never listed `*.md` — so an
 * entry whose embedding failed was written and then permanently invisible. The
 * markdown files are the source of truth here and SQLite is a rebuildable index.
 */
import { type JournalScope, type JournalThoughts } from "../types.js";
/** `YYYY-MM-DD` day-directory name. */
export declare const DAY_DIR_PATTERN: RegExp;
export declare function formatDayDirectory(date: Date): string;
export declare function formatEntryBasename(date: Date): string;
/**
 * Render an entry. Section order is fixed by JOURNAL_SECTION_HEADINGS and empty
 * categories are omitted.
 */
export declare function formatEntry(thoughts: JournalThoughts, timestamp: Date): string;
/**
 * Strip frontmatter and section headers, and harvest the headings.
 *
 * The returned `text` is what gets embedded; `sections` is what the
 * `search_journal` section filter matches against.
 */
export declare function extractSearchableText(markdownContent: string): {
    text: string;
    sections: string[];
};
export declare function sectionsMatch(entrySections: string[], requested: string[]): boolean;
/**
 * Read the epoch-millisecond `timestamp:` out of an entry's frontmatter.
 *
 * Preferred over `timestampFromEntryPath` because the filename only carries
 * second resolution — `HH-MM-SS-µµµµµµ` looks precise but the µ field is
 * `ms * 1000 + random`, so it cannot be read back as a time. Two entries written
 * in the same second are indistinguishable by path and would sort arbitrarily in
 * a chronological listing.
 */
export declare function timestampFromFrontmatter(markdownContent: string): number | null;
/**
 * Recover the entry's timestamp from its path when the frontmatter is not to
 * hand. Returns null if either the filename or the day directory does not match.
 */
export declare function timestampFromEntryPath(filePath: string): Date | null;
/**
 * Id for an entry, and it is deliberately asymmetric by scope:
 *
 *   user     md5(scope + ':' + path relative to its root)
 *   project  md5(scope + ':' + absolute root + ':' + path relative to its root)
 *
 * Neither form is the absolute entry path. Upstream stored that as the record's
 * identity inside the sidecar, so renaming the journal directory made every
 * existing record unreadable — search listed them and read refused them. A
 * root-relative id survives the root moving, and the absolute `path` column is
 * refreshed from the walk on every index run.
 *
 * `project` scope has to give up some of that. Every project on the machine
 * shares one database and a relative entry path is only a date directory plus a
 * timestamped filename, so two repos that journalled in the same second produced
 * the same id and one silently replaced the other. The root is what distinguishes
 * them. There is exactly one user root, so including it there would buy no
 * discrimination and cost the move-stability property for nothing — hence the
 * asymmetry rather than a blanket change.
 */
export declare function journalEntryId(scope: JournalScope, root: string, entryPath: string): string;
/**
 * Pick the excerpt to show for a hit: a sliding window scored by how many query
 * words it contains. Carried over from private-journal-mcp unchanged.
 */
export declare function generateExcerpt(text: string, query: string, maxLength?: number): string;
