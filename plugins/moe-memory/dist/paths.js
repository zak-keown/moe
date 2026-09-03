/** Path resolution for transcript archives, indexes, and journals. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
/** Project-local journal directory name. */
export const JOURNAL_DIR_NAME = ".moe-journal";
/**
 * Ensure a directory exists, creating it if necessary
 */
function ensureDir(dir) {
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
export function getClaudeDir() {
    return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
}
/**
 * Get the Codex configuration directory.
 * Supports CODEX_HOME for alternate profiles.
 * Falls back to ~/.codex when not set.
 */
export function getCodexDir() {
    return process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
}
/**
 * Get all directories where supported harnesses store conversation files.
 * Checks Claude Code legacy (projects/) and current (transcripts/) locations,
 * plus Codex sessions.
 * Returns only directories that exist.
 */
export function getConversationSourceDirs() {
    const testDir = process.env.TEST_PROJECTS_DIR;
    if (testDir)
        return [testDir];
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
export function findJsonlFiles(dir, excludedDirNames) {
    const results = [];
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isFile() && entry.name.endsWith(".jsonl")) {
                results.push(entry.name);
            }
            else if (entry.isDirectory()) {
                if (excludedDirNames?.has(entry.name))
                    continue;
                const subDir = path.join(dir, entry.name);
                for (const f of findJsonlFiles(subDir, excludedDirNames)) {
                    results.push(path.join(entry.name, f));
                }
            }
        }
    }
    catch {
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
 */
export function getMemoryDataDir() {
    let dir;
    if (process.env.MOE_MEMORY_CONFIG_DIR) {
        dir = process.env.MOE_MEMORY_CONFIG_DIR;
    }
    else if (process.env.MOE_DATA_DIR) {
        dir = path.join(process.env.MOE_DATA_DIR, "memory");
    }
    else {
        const xdgConfigHome = process.env.XDG_CONFIG_HOME;
        if (xdgConfigHome) {
            dir = path.join(xdgConfigHome, "moe", "memory");
        }
        else {
            dir = path.join(os.homedir(), ".config", "moe", "memory");
        }
    }
    return ensureDir(dir);
}
/**
 * Get conversation archive directory
 */
export function getArchiveDir() {
    // Allow test override
    if (process.env.TEST_ARCHIVE_DIR) {
        return ensureDir(process.env.TEST_ARCHIVE_DIR);
    }
    return ensureDir(path.join(getMemoryDataDir(), "conversation-archive"));
}
/**
 * Get conversation index directory
 */
export function getIndexDir() {
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
export function getModelCacheDir() {
    if (process.env.MOE_MEMORY_MODEL_CACHE_DIR) {
        return ensureDir(process.env.MOE_MEMORY_MODEL_CACHE_DIR);
    }
    return ensureDir(path.join(getMemoryDataDir(), "models"));
}
/**
 * Get database path. Both record types live in this one file.
 */
export function getDbPath() {
    // Allow test override with direct DB path
    const override = process.env.MOE_MEMORY_DB_PATH || process.env.TEST_DB_PATH;
    if (override)
        return override;
    return path.join(getIndexDir(), "db.sqlite");
}
/**
 * Get exclude config path
 */
export function getExcludeConfigPath() {
    return path.join(getIndexDir(), "exclude.txt");
}
/**
 * Get list of projects to exclude from indexing
 * Configurable via env var or config file
 */
export function getExcludedProjects() {
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
/** Read the journal-path override. */
function journalPathOverride() {
    return process.env.MOE_MEMORY_JOURNAL_PATH;
}
/**
 * Resolve a writable directory for journal storage.
 *
 * The override wins outright, then cwd (unless cwd is a system root), then
 * HOME, USERPROFILE, and the temp directories.
 *
 * @param subdirectory subdirectory name (e.g. `.moe-journal`)
 * @param includeCurrentDirectory whether to consider the current working directory
 */
export function resolveJournalPath(subdirectory = JOURNAL_DIR_NAME, includeCurrentDirectory = true) {
    const override = journalPathOverride();
    if (override)
        return override;
    const possiblePaths = [];
    // Try current working directory only if requested and it's reasonable
    if (includeCurrentDirectory) {
        try {
            const cwd = process.cwd();
            // Don't use root directories or other system directories
            if (cwd !== "/" && cwd !== "C:\\" && cwd !== "/System" && cwd !== "/usr") {
                possiblePaths.push(path.join(cwd, subdirectory));
            }
        }
        catch {
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
export function resolveProjectJournalPath() {
    return resolveJournalPath(JOURNAL_DIR_NAME, true);
}
/**
 * User-global journal directory.
 *
 * It lives at `<data dir>/journal`, alongside the conversation archive and
 * index. `MOE_MEMORY_JOURNAL_PATH` overrides it.
 */
export function resolveUserJournalPath() {
    const override = journalPathOverride();
    if (override)
        return override;
    return path.join(getMemoryDataDir(), "journal");
}
/**
 * The journal roots to read, resolved and de-duplicated.
 */
export function journalRoots() {
    const roots = [path.resolve(resolveProjectJournalPath()), path.resolve(resolveUserJournalPath())];
    return [...new Set(roots)];
}
