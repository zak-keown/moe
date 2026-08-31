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

import crypto from "node:crypto";
import path from "node:path";
import { JOURNAL_SECTION_HEADINGS, type JournalScope, type JournalThoughts } from "../types.js";

/** `YYYY-MM-DD` day-directory name. */
export const DAY_DIR_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function formatDayDirectory(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatEntryBasename(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  const microseconds = String(
    date.getMilliseconds() * 1000 + Math.floor(Math.random() * 1000),
  ).padStart(6, "0");
  return `${hours}-${minutes}-${seconds}-${microseconds}`;
}

/**
 * Render an entry. Section order is fixed by JOURNAL_SECTION_HEADINGS and empty
 * categories are omitted.
 */
export function formatEntry(thoughts: JournalThoughts, timestamp: Date): string {
  const timeDisplay = timestamp.toLocaleTimeString("en-US", {
    hour12: true,
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
  const dateDisplay = timestamp.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const sections: string[] = [];
  for (const [key, heading] of JOURNAL_SECTION_HEADINGS) {
    const value = thoughts[key];
    if (value) sections.push(`## ${heading}\n\n${value}`);
  }

  return `---
title: "${timeDisplay} - ${dateDisplay}"
date: ${timestamp.toISOString()}
timestamp: ${timestamp.getTime()}
---

${sections.join("\n\n")}
`;
}

/**
 * Strip frontmatter and section headers, and harvest the headings.
 *
 * The returned `text` is what gets embedded; `sections` is what the
 * `search_journal` section filter matches against.
 */
export function extractSearchableText(markdownContent: string): {
  text: string;
  sections: string[];
} {
  // Remove YAML frontmatter
  const withoutFrontmatter = markdownContent.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");

  const sections: string[] = [];
  const sectionMatches = withoutFrontmatter.match(/^## (.+)$/gm);
  if (sectionMatches) {
    sections.push(...sectionMatches.map((match) => match.replace(/^## /, "").trim()));
  }

  const cleanText = withoutFrontmatter
    .replace(/^## .+$/gm, "") // Remove section headers
    .replace(/\n{3,}/g, "\n\n") // Normalize whitespace
    .trim();

  return { text: cleanText, sections };
}

/**
 * Compare a caller-supplied section name against the rendered headings stored
 * on the entry.
 *
 * FIXED FROM UPSTREAM. private-journal-mcp compared the caller's value directly
 * against the rendered heading text, so of the six documented values only
 * `reflections` and `observations` ever matched — `project_notes`,
 * `user_context`, `technical_insights` and `world_knowledge` all matched
 * nothing. The broken form was the worked example inside the live tool
 * description, i.e. the model was actively instructed to pass filters that
 * silently returned zero results.
 *
 * Both sides are normalised to lowercase alphanumerics, and the upstream
 * substring leniency is preserved (`reflection` still matches `Reflections`).
 * `feelings` still matches the legacy `## Feelings` heading on pre-2.0.0
 * entries — the one compatibility promise upstream made to data already on disk.
 */
function normalizeSectionName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function sectionsMatch(entrySections: string[], requested: string[]): boolean {
  if (requested.length === 0) return true;
  const normalizedEntry = entrySections.map(normalizeSectionName);
  return requested.some((requestedSection) => {
    const needle = normalizeSectionName(requestedSection);
    if (!needle) return false;
    return normalizedEntry.some((entrySection) => entrySection.includes(needle));
  });
}

/**
 * Read the epoch-millisecond `timestamp:` out of an entry's frontmatter.
 *
 * Preferred over `timestampFromEntryPath` because the filename only carries
 * second resolution — `HH-MM-SS-µµµµµµ` looks precise but the µ field is
 * `ms * 1000 + random`, so it cannot be read back as a time. Two entries written
 * in the same second are indistinguishable by path and would sort arbitrarily in
 * a chronological listing.
 */
export function timestampFromFrontmatter(markdownContent: string): number | null {
  const match = markdownContent.match(/^---\r?\n[\s\S]*?^timestamp:\s*(\d+)\s*$/m);
  const raw = match?.[1];
  if (!raw) return null;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Recover the entry's timestamp from its path when the frontmatter is not to
 * hand. Returns null if either the filename or the day directory does not match.
 */
export function timestampFromEntryPath(filePath: string): Date | null {
  const filename = path.basename(filePath, ".md");
  const timeMatch = filename.match(/^(\d{2})-(\d{2})-(\d{2})-\d{6}$/);
  if (!timeMatch) return null;

  const dirName = path.basename(path.dirname(filePath));
  const dateMatch = dirName.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dateMatch) return null;

  // Indices are checked by the regexes above; the non-null assertions the
  // upstream version relied on are replaced with explicit reads so
  // noUncheckedIndexedAccess is satisfied without a cast.
  const [, hours, minutes, seconds] = timeMatch;
  const [, year, month, day] = dateMatch;
  if (!hours || !minutes || !seconds || !year || !month || !day) return null;

  return new Date(
    Number.parseInt(year, 10),
    Number.parseInt(month, 10) - 1,
    Number.parseInt(day, 10),
    Number.parseInt(hours, 10),
    Number.parseInt(minutes, 10),
    Number.parseInt(seconds, 10),
  );
}

/**
 * Stable id for an entry: `md5(scope + ':' + path relative to its root)`.
 *
 * Deliberately not the absolute path. Upstream stored the absolute path as the
 * record's identity inside the sidecar, so renaming the journal directory made
 * every existing record unreadable — search listed them and read refused them.
 * A root-relative id survives the root moving; the absolute `path` column is
 * refreshed from the walk on every index run.
 */
export function journalEntryId(scope: JournalScope, root: string, entryPath: string): string {
  const relative = path.relative(root, entryPath).split(path.sep).join("/");
  return crypto.createHash("md5").update(`${scope}:${relative}`).digest("hex");
}

/**
 * Pick the excerpt to show for a hit: a sliding window scored by how many query
 * words it contains. Carried over from private-journal-mcp unchanged.
 */
export function generateExcerpt(text: string, query: string, maxLength = 200): string {
  if (!query || query.trim() === "") {
    return text.slice(0, maxLength) + (text.length > maxLength ? "..." : "");
  }

  const queryWords = query.toLowerCase().split(/\s+/);
  const textLower = text.toLowerCase();

  let bestPosition = 0;
  let bestScore = 0;

  for (let i = 0; i <= text.length - maxLength; i += 20) {
    const window = textLower.slice(i, i + maxLength);
    const score = queryWords.reduce((sum, word) => sum + (window.includes(word) ? 1 : 0), 0);

    if (score > bestScore) {
      bestScore = score;
      bestPosition = i;
    }
  }

  let excerpt = text.slice(bestPosition, bestPosition + maxLength);
  if (bestPosition > 0) excerpt = `...${excerpt}`;
  if (bestPosition + maxLength < text.length) excerpt += "...";

  return excerpt;
}
