/**
 * Path resolution for both record types.
 *
 * Reconciled from two upstream `paths.ts` files with zero name overlap:
 *
 *   episodic-memory  10 functions locating READ-ONLY transcript sources
 *                    (Claude Code / Codex) plus this package's own writable
 *                    archive, index and db locations.
 *   private-journal  3 functions resolving a WRITABLE journal directory from
 *                    a cwd → HOME → USERPROFILE → temp fallback chain.
 *
 * Both are kept. What changed is that the four upstream environment
 * namespaces (`EPISODIC_MEMORY_CONFIG_DIR`, `EPISODIC_MEMORY_DB_PATH`,
 * `PERSONAL_SUPERPOWERS_DIR`, `PRIVATE_JOURNAL_PATH`) collapse into one
 * `MOE_MEMORY_*` namespace plus the shared `MOE_DATA_DIR`, and the user-global
 * journal moves under the same data root as the conversation index — that is
 * what "one store" means here.
 *
 * `PRIVATE_JOURNAL_PATH` is still honoured, with a deprecation warning: an
 * unset override does not error, it silently changes where entries land, so
 * dropping the old name outright would move a containerised deployment's
 * journal without saying anything.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Project-local journal directory name. Was `.private-journal` upstream. */
export const JOURNAL_DIR_NAME = ".moe-journal";

/**
 * Ensure a directory exists, creating it if necessary
 */
function ensureDir(dir: string): string {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Get the Claude Code configuration directory.
 * Supports CLAUDE_CONFIG_DIR for multiple profiles.
 * Falls back to ~/.claude when not set.
 */
export function getClaudeDir(): string {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
}

/**
 * Get the Codex configuration directory.
 * Supports CODEX_HOME for alternate profiles.
 * Falls back to ~/.codex when not set.
 */
export function getCodexDir(): string {
  return process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
}

/**
 * Get all directories where supported harnesses store conversation files.
 * Checks Claude Code legacy (projects/) and current (transcripts/) locations,
 * plus Codex sessions.
 * Returns only directories that exist.
 */
export function getConversationSourceDirs(): string[] {
  const testDir = process.env.TEST_PROJECTS_DIR;
  if (testDir) return [testDir];

  const claudeDir = getClaudeDir();
  const codexDir = getCodexDir();
  return [
    path.join(claudeDir, "projects"),
    path.join(claudeDir, "transcripts"),
    path.join(codexDir, "sessions"),
  ].filter((d) => fs.existsSync(d));
}

/**
 * Recursively find all .jsonl files under a directory.
 * Returns paths relative to the given directory.
 *
 * `excludedDirNames` skips any subdirectory whose name matches an entry in
 * the set, at any depth. Top-level project skipping at the caller is the
 * usual case; this parameter handles nested directories like `subagents/`
 * inside session UUIDs (#80).
 */
export function findJsonlFiles(dir: string, excludedDirNames?: ReadonlySet<string>): string[] {
  const results: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        results.push(entry.name);
      } else if (entry.isDirectory()) {
        if (excludedDirNames?.has(entry.name)) continue;
        const subDir = path.join(dir, entry.name);
        for (const f of findJsonlFiles(subDir, excludedDirNames)) {
          results.push(path.join(entry.name, f));
        }
      }
    }
  } catch {
    // Directory might not be readable
  }
  return results;
}

/**
 * Get this package's data directory: archive, index, model cache, logs, locks
 * and the user-global journal all live under it.
 *
 * Precedence:
 * 1. MOE_MEMORY_CONFIG_DIR — this package's dir directly (also the test seam)
 * 2. MOE_DATA_DIR/memory   — the shared cross-package Moe data root
 * 3. XDG_CONFIG_HOME/moe/memory
 * 4. ~/.config/moe/memory  (default)
 *
 * Upstream this was `~/.config/superpowers` (`getSuperpowersDir`). The rename
 * is a deliberate, announced reset: there is no migration, so an existing
 * upstream index is simply not found. See `findLegacyDataDir` and the README.
 */
export function getMemoryDataDir(): string {
  let dir: string;

  if (process.env.MOE_MEMORY_CONFIG_DIR) {
    dir = process.env.MOE_MEMORY_CONFIG_DIR;
  } else if (process.env.MOE_DATA_DIR) {
    dir = path.join(process.env.MOE_DATA_DIR, "memory");
  } else {
    const xdgConfigHome = process.env.XDG_CONFIG_HOME;
    if (xdgConfigHome) {
      dir = path.join(xdgConfigHome, "moe", "memory");
    } else {
      dir = path.join(os.homedir(), ".config", "moe", "memory");
    }
  }

  return ensureDir(dir);
}

/**
 * Return the upstream `~/.config/superpowers` data directory if it still exists
 * and this install has not been used yet, or null.
 *
 * The rename orphans an existing upstream index with no error message — the
 * tool would just report an empty index and re-sync from scratch, which means
 * re-downloading the model, re-embedding everything, and re-running paid
 * summarisation. Callers surface this so the reset is announced rather than
 * silent. Deliberately read-only: moving a multi-gigabyte archive behind the
 * user's back is worse than telling them where it is.
 */
export function findLegacyDataDir(): string | null {
  if (process.env.MOE_MEMORY_CONFIG_DIR || process.env.MOE_DATA_DIR) return null;
  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  const legacy = path.join(base, "superpowers");
  try {
    if (!fs.existsSync(path.join(legacy, "conversation-index"))) return null;
  } catch {
    return null;
  }
  return legacy;
}

/**
 * Get conversation archive directory
 */
export function getArchiveDir(): string {
  // Allow test override
  if (process.env.TEST_ARCHIVE_DIR) {
    return ensureDir(process.env.TEST_ARCHIVE_DIR);
  }

  return ensureDir(path.join(getMemoryDataDir(), "conversation-archive"));
}

/**
 * Get conversation index directory
 */
export function getIndexDir(): string {
  return ensureDir(path.join(getMemoryDataDir(), "conversation-index"));
}

/**
 * Where transformers.js caches the ONNX model.
 *
 * Upstream never set `env.cacheDir`, so the first `initEmbeddings()` fetched
 * the model into whatever transformers.js defaults to — which under pnpm is a
 * path inside the content-addressed store, shared across the workspace and
 * possibly read-only in a container. Pinning it here keeps the download in one
 * writable place that moves with `MOE_MEMORY_CONFIG_DIR`, which is what makes
 * the encoder-dependent test project reproducible.
 */
export function getModelCacheDir(): string {
  if (process.env.MOE_MEMORY_MODEL_CACHE_DIR) {
    return ensureDir(process.env.MOE_MEMORY_MODEL_CACHE_DIR);
  }
  return ensureDir(path.join(getMemoryDataDir(), "models"));
}

/**
 * Get database path. Both record types live in this one file.
 */
export function getDbPath(): string {
  // Allow test override with direct DB path
  const override = process.env.MOE_MEMORY_DB_PATH || process.env.TEST_DB_PATH;
  if (override) return override;

  return path.join(getIndexDir(), "db.sqlite");
}

/**
 * Get exclude config path
 */
export function getExcludeConfigPath(): string {
  return path.join(getIndexDir(), "exclude.txt");
}

/**
 * Get list of projects to exclude from indexing
 * Configurable via env var or config file
 */
export function getExcludedProjects(): string[] {
  // Check env variable first
  if (process.env.CONVERSATION_SEARCH_EXCLUDE_PROJECTS) {
    return process.env.CONVERSATION_SEARCH_EXCLUDE_PROJECTS.split(",").map((p) => p.trim());
  }

  // Check for config file
  const configPath = getExcludeConfigPath();
  if (fs.existsSync(configPath)) {
    const content = fs.readFileSync(configPath, "utf-8");
    return content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));
  }

  // Default: no exclusions
  return [];
}

// ---------------------------------------------------------------------------
// Journal paths
// ---------------------------------------------------------------------------

let warnedAboutLegacyJournalEnv = false;

/**
 * Read the journal-path override, honouring the upstream name with a warning.
 * `MOE_MEMORY_JOURNAL_PATH` wins if both are set.
 */
function journalPathOverride(): string | undefined {
  if (process.env.MOE_MEMORY_JOURNAL_PATH) return process.env.MOE_MEMORY_JOURNAL_PATH;
  const legacy = process.env.PRIVATE_JOURNAL_PATH;
  if (legacy) {
    if (!warnedAboutLegacyJournalEnv) {
      warnedAboutLegacyJournalEnv = true;
      console.error(
        "moe-memory: PRIVATE_JOURNAL_PATH is the upstream name and is deprecated; use MOE_MEMORY_JOURNAL_PATH.",
      );
    }
    return legacy;
  }
  return undefined;
}

/** Test seam: forget that the deprecation warning was already printed. */
export function resetJournalEnvWarning(): void {
  warnedAboutLegacyJournalEnv = false;
}

/**
 * Resolve a writable directory for journal storage.
 *
 * Carried over from private-journal-mcp unchanged in substance: the override
 * wins outright, then cwd (unless cwd is a system root), then HOME, then
 * USERPROFILE, then the temp directories. `/tmp` is hardcoded rather than
 * `os.tmpdir()` deliberately — see docs/history/private-journal-mcp/.
 *
 * @param subdirectory subdirectory name (e.g. `.moe-journal`)
 * @param includeCurrentDirectory whether to consider the current working directory
 */
export function resolveJournalPath(
  subdirectory: string = JOURNAL_DIR_NAME,
  includeCurrentDirectory = true,
): string {
  const override = journalPathOverride();
  if (override) return override;

  const possiblePaths: string[] = [];

  // Try current working directory only if requested and it's reasonable
  if (includeCurrentDirectory) {
    try {
      const cwd = process.cwd();
      // Don't use root directories or other system directories
      if (cwd !== "/" && cwd !== "C:\\" && cwd !== "/System" && cwd !== "/usr") {
        possiblePaths.push(path.join(cwd, subdirectory));
      }
    } catch {
      // Ignore errors getting cwd
    }
  }

  // Try home directories (cross-platform)
  if (process.env.HOME) {
    possiblePaths.push(path.join(process.env.HOME, subdirectory));
  }
  if (process.env.USERPROFILE) {
    possiblePaths.push(path.join(process.env.USERPROFILE, subdirectory));
  }

  // Try temp directories as last resort
  possiblePaths.push(path.join("/tmp", subdirectory));
  if (process.env.TEMP) {
    possiblePaths.push(path.join(process.env.TEMP, subdirectory));
  }
  if (process.env.TMP) {
    possiblePaths.push(path.join(process.env.TMP, subdirectory));
  }

  return possiblePaths[0] ?? path.join("/tmp", subdirectory);
}

/**
 * Project-local journal directory: `<project>/.moe-journal`.
 * Per-project journals are a feature, not an accident — they are the half of
 * the journal that belongs to the codebase you are in.
 */
export function resolveProjectJournalPath(): string {
  return resolveJournalPath(JOURNAL_DIR_NAME, true);
}

/**
 * User-global journal directory.
 *
 * CHANGED FROM UPSTREAM: was `~/.private-journal`, resolved through the same
 * cwd/HOME/temp chain as the project journal. It is now `<data dir>/journal`,
 * alongside the conversation archive and index, so one data root holds both
 * record types. `MOE_MEMORY_JOURNAL_PATH` still overrides it.
 */
export function resolveUserJournalPath(): string {
  const override = journalPathOverride();
  if (override) return override;
  return path.join(getMemoryDataDir(), "journal");
}

/**
 * The journal roots to read, resolved and de-duplicated.
 *
 * De-duplication is the fix for an upstream defect: when the path override is
 * set, the project and user roots are the SAME directory, and upstream loaded
 * it twice — once labelled `project`, once labelled `user` — so every entry
 * appeared twice with contradictory labels and `limit: 10` yielded 5 unique
 * entries. That is the documented containerised configuration.
 */
export function journalRoots(): string[] {
  const roots = [path.resolve(resolveProjectJournalPath()), path.resolve(resolveUserJournalPath())];
  return [...new Set(roots)];
}
