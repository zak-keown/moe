/** Path resolution for transcript archives, indexes, and journals. */
/** Project-local journal directory name. */
export declare const JOURNAL_DIR_NAME = ".moe-journal";
/**
 * Get the Claude Code configuration directory.
 * Supports CLAUDE_CONFIG_DIR for multiple profiles.
 * Falls back to ~/.claude when not set.
 */
export declare function getClaudeDir(): string;
/**
 * Get the Codex configuration directory.
 * Supports CODEX_HOME for alternate profiles.
 * Falls back to ~/.codex when not set.
 */
export declare function getCodexDir(): string;
/**
 * Get all directories where supported harnesses store conversation files.
 * Checks Claude Code legacy (projects/) and current (transcripts/) locations,
 * plus Codex sessions.
 * Returns only directories that exist.
 */
export declare function getConversationSourceDirs(): string[];
/**
 * Recursively find all .jsonl files under a directory.
 * Returns paths relative to the given directory.
 *
 * `excludedDirNames` skips any subdirectory whose name matches an entry in
 * the set, at any depth. Top-level project skipping at the caller is the
 * usual case; this parameter handles nested directories like `subagents/`
 * inside session UUIDs (#80).
 */
export declare function findJsonlFiles(dir: string, excludedDirNames?: ReadonlySet<string>): string[];
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
export declare function getMemoryDataDir(): string;
/**
 * Get conversation archive directory
 */
export declare function getArchiveDir(): string;
/**
 * Get conversation index directory
 */
export declare function getIndexDir(): string;
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
export declare function getModelCacheDir(): string;
/**
 * Get database path. Both record types live in this one file.
 */
export declare function getDbPath(): string;
/**
 * Get exclude config path
 */
export declare function getExcludeConfigPath(): string;
/**
 * Get list of projects to exclude from indexing
 * Configurable via env var or config file
 */
export declare function getExcludedProjects(): string[];
/**
 * Resolve a writable directory for journal storage.
 *
 * The override wins outright, then cwd (unless cwd is a system root), then
 * HOME, USERPROFILE, and the temp directories.
 *
 * @param subdirectory subdirectory name (e.g. `.moe-journal`)
 * @param includeCurrentDirectory whether to consider the current working directory
 */
export declare function resolveJournalPath(subdirectory?: string, includeCurrentDirectory?: boolean): string;
/**
 * Project-local journal directory: `<project>/.moe-journal`.
 * Per-project journals are a feature, not an accident — they are the half of
 * the journal that belongs to the codebase you are in.
 */
export declare function resolveProjectJournalPath(): string;
/**
 * User-global journal directory.
 *
 * It lives at `<data dir>/journal`, alongside the conversation archive and
 * index. `MOE_MEMORY_JOURNAL_PATH` overrides it.
 */
export declare function resolveUserJournalPath(): string;
/**
 * The journal roots to read, resolved and de-duplicated.
 */
export declare function journalRoots(): string[];
