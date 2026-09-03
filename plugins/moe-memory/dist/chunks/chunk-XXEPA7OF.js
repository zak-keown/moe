// @generated — do not edit; see scripts/build-runtime.mjs
import { createRequire as __createRequire } from 'module';
const require = __createRequire(import.meta.url);
import {
  JOURNAL_SECTION_HEADINGS
} from "./chunk-22YHH63V.js";
import {
  generateEntryEmbedding
} from "./chunk-QGTMUDP7.js";
import {
  EMBEDDING_VERSION,
  countJournalEntries,
  deleteJournalEntry,
  getJournalIndexState,
  upsertJournalEntry
} from "./chunk-LUAEQ7DI.js";
import {
  resolveProjectJournalPath,
  resolveUserJournalPath
} from "./chunk-YFLZKW2J.js";

// src/journal/store.ts
import fs from "node:fs/promises";
import path2 from "node:path";

// src/journal/markdown.ts
import crypto from "node:crypto";
import path from "node:path";
var DAY_DIR_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
function formatDayDirectory(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function formatEntryBasename(date) {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  const microseconds = String(
    date.getMilliseconds() * 1e3 + Math.floor(Math.random() * 1e3)
  ).padStart(6, "0");
  return `${hours}-${minutes}-${seconds}-${microseconds}`;
}
function formatEntry(thoughts, timestamp) {
  const timeDisplay = timestamp.toLocaleTimeString("en-US", {
    hour12: true,
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit"
  });
  const dateDisplay = timestamp.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
  const sections = [];
  for (const [key, heading] of JOURNAL_SECTION_HEADINGS) {
    const value = thoughts[key];
    if (value) sections.push(`## ${heading}

${value}`);
  }
  return `---
title: "${timeDisplay} - ${dateDisplay}"
date: ${timestamp.toISOString()}
timestamp: ${timestamp.getTime()}
---

${sections.join("\n\n")}
`;
}
function extractSearchableText(markdownContent) {
  const withoutFrontmatter = markdownContent.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
  const sections = [];
  const sectionMatches = withoutFrontmatter.match(/^## (.+)$/gm);
  if (sectionMatches) {
    sections.push(...sectionMatches.map((match) => match.replace(/^## /, "").trim()));
  }
  const cleanText = withoutFrontmatter.replace(/^## .+$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
  return { text: cleanText, sections };
}
function normalizeSectionName(value) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}
function sectionsMatch(entrySections, requested) {
  if (requested.length === 0) return true;
  const normalizedEntry = entrySections.map(normalizeSectionName);
  return requested.some((requestedSection) => {
    const needle = normalizeSectionName(requestedSection);
    if (!needle) return false;
    return normalizedEntry.some((entrySection) => entrySection.includes(needle));
  });
}
function timestampFromFrontmatter(markdownContent) {
  const match = markdownContent.match(/^---\r?\n[\s\S]*?^timestamp:\s*(\d+)\s*$/m);
  const raw = match?.[1];
  if (!raw) return null;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}
function timestampFromEntryPath(filePath) {
  const filename = path.basename(filePath, ".md");
  const timeMatch = filename.match(/^(\d{2})-(\d{2})-(\d{2})-\d{6}$/);
  if (!timeMatch) return null;
  const dirName = path.basename(path.dirname(filePath));
  const dateMatch = dirName.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dateMatch) return null;
  const [, hours, minutes, seconds] = timeMatch;
  const [, year, month, day] = dateMatch;
  if (!hours || !minutes || !seconds || !year || !month || !day) return null;
  return new Date(
    Number.parseInt(year, 10),
    Number.parseInt(month, 10) - 1,
    Number.parseInt(day, 10),
    Number.parseInt(hours, 10),
    Number.parseInt(minutes, 10),
    Number.parseInt(seconds, 10)
  );
}
function journalEntryId(scope, root, entryPath) {
  const relative = path.relative(root, entryPath).split(path.sep).join("/");
  const key = scope === "project" ? `${scope}:${path.resolve(root)}:${relative}` : `${scope}:${relative}`;
  return crypto.createHash("md5").update(key).digest("hex");
}
function generateExcerpt(text, query, maxLength = 200) {
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

// src/journal/store.ts
var PROJECT_KEYS = ["project_notes"];
var USER_KEYS = [
  "reflections",
  "observations",
  "user_context",
  "technical_insights",
  "world_knowledge"
];
function pick(thoughts, keys) {
  const out = {};
  for (const key of keys) {
    const value = thoughts[key];
    if (value !== void 0) out[key] = value;
  }
  return out;
}
function hasContent(thoughts) {
  return Object.values(thoughts).some((value) => value !== void 0 && value !== "");
}
var JournalStore = class {
  projectPath;
  userPath;
  embed;
  constructor(options = {}) {
    this.projectPath = path2.resolve(options.projectPath ?? resolveProjectJournalPath());
    this.userPath = path2.resolve(options.userPath ?? resolveUserJournalPath());
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
  roots() {
    if (this.projectPath === this.userPath) {
      return [{ scope: "user", path: this.userPath }];
    }
    return [
      { scope: "project", path: this.projectPath },
      { scope: "user", path: this.userPath }
    ];
  }
  get collapsed() {
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
  scopeFor(root, sections) {
    if (!this.collapsed) return root.scope;
    const isProject = sections.some(
      (section) => section.toLowerCase().replace(/[^a-z0-9]/g, "") === "projectnotes"
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
  async writeThoughts(thoughts, db) {
    const timestamp = /* @__PURE__ */ new Date();
    const written = [];
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
        await this.indexOne(db, entryPath).catch((error) => {
          console.error(
            `moe-memory: journal entry written but not indexed (${entryPath}): ${error instanceof Error ? error.message : String(error)}`
          );
        });
      }
    }
    return written;
  }
  async writeToLocation(thoughts, timestamp, basePath) {
    const dayDirectory = path2.join(basePath, formatDayDirectory(timestamp));
    const filePath = path2.join(dayDirectory, `${formatEntryBasename(timestamp)}.md`);
    await this.ensureDirectoryExists(dayDirectory);
    await fs.writeFile(filePath, formatEntry(thoughts, timestamp), "utf8");
    return filePath;
  }
  async ensureDirectoryExists(dirPath) {
    try {
      await fs.access(dirPath);
    } catch {
      try {
        await fs.mkdir(dirPath, { recursive: true });
      } catch (mkdirError) {
        throw new Error(
          `Failed to create journal directory at ${dirPath}: ${mkdirError instanceof Error ? mkdirError.message : String(mkdirError)}`
        );
      }
    }
  }
  /**
   * Index one markdown file by absolute path. Used straight after a write.
   */
  async indexOne(db, entryPath) {
    const root = this.roots().find(
      (candidate) => entryPath === candidate.path || entryPath.startsWith(candidate.path + path2.sep)
    );
    if (!root) throw new Error(`${entryPath} is not under a journal root`);
    const content = await fs.readFile(entryPath, "utf8");
    const stat = await fs.stat(entryPath);
    await this.indexContent(db, root, entryPath, content, stat.mtimeMs);
  }
  async indexContent(db, root, entryPath, content, mtimeMs) {
    const { text, sections } = extractSearchableText(content);
    if (text.trim().length === 0) return;
    const scope = this.scopeFor(root, sections);
    const timestamp = timestampFromFrontmatter(content) ?? timestampFromEntryPath(entryPath)?.getTime() ?? mtimeMs;
    const entry = {
      id: journalEntryId(scope, root.path, entryPath),
      path: entryPath,
      root: path2.resolve(root.path),
      scope,
      timestamp,
      text,
      sections
    };
    let embedding = null;
    try {
      embedding = await this.embed(text);
    } catch {
    }
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
  async indexJournal(db) {
    const result = { indexed: 0, pruned: 0, failed: 0, total: 0 };
    const state = getJournalIndexState(db);
    const seen = /* @__PURE__ */ new Set();
    for (const root of this.roots()) {
      let dayDirs;
      try {
        dayDirs = await fs.readdir(root.path);
      } catch (error) {
        if (error?.code !== "ENOENT") {
          console.error(`moe-memory: failed to scan journal root ${root.path}: ${String(error)}`);
        }
        continue;
      }
      for (const dayDir of dayDirs) {
        if (!DAY_DIR_PATTERN.test(dayDir)) continue;
        const dayPath = path2.join(root.path, dayDir);
        let files;
        try {
          const stat = await fs.stat(dayPath);
          if (!stat.isDirectory()) continue;
          files = await fs.readdir(dayPath);
        } catch {
          continue;
        }
        for (const file of files) {
          if (!file.endsWith(".md")) continue;
          const entryPath = path2.join(dayPath, file);
          result.total++;
          try {
            const content = await fs.readFile(entryPath, "utf8");
            const stat = await fs.stat(entryPath);
            const { sections } = extractSearchableText(content);
            const scope = this.scopeFor(root, sections);
            const id = journalEntryId(scope, root.path, entryPath);
            seen.add(id);
            const existing = state.get(id);
            const fresh = existing !== void 0 && existing.path === entryPath && existing.sourceMtimeMs === stat.mtimeMs && existing.embeddingVersion === EMBEDDING_VERSION;
            if (fresh) continue;
            await this.indexContent(db, root, entryPath, content, stat.mtimeMs);
            result.indexed++;
          } catch (error) {
            result.failed++;
            console.error(
              `moe-memory: failed to index journal entry ${entryPath}: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }
      }
    }
    const walked = new Set(this.roots().map((root) => path2.resolve(root.path)));
    for (const [id, row] of state) {
      if (seen.has(id)) continue;
      if (!row.root || !walked.has(row.root)) continue;
      deleteJournalEntry(db, id);
      result.pruned++;
    }
    return result;
  }
  /** Count indexed entries, optionally for one scope. */
  count(db, scope) {
    return countJournalEntries(db, scope);
  }
};

export {
  sectionsMatch,
  generateExcerpt,
  JournalStore
};
