/**
 * `moe-memory sync` — copy new transcripts into the archive, index them, then
 * run one batch of the embedding migration.
 *
 * Was a standalone script executed by `cli/episodic-memory.js` through
 * `spawn(node, join(__dirname, '../dist/sync-cli.js'))`. It is a function now
 * and `src/cli.ts` calls it in-process: there is one bin, it compiles to
 * `dist/cli.js`, and every `../dist/` prefix in the old shim layer was a
 * resolution that only worked from the right directory.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { initDatabase } from "./db.js";
import { countStale, runMigrationBatch } from "./embedding-migration.js";
import { generateExchangeEmbedding, initEmbeddings } from "./embeddings.js";
import { acquireFileLock, readLockHolder, releaseFileLock } from "./file-lock.js";
import { formatLogLine, getSyncLogPath } from "./logging.js";
import { getArchiveDir, getConversationSourceDirs, getIndexDir } from "./paths.js";
import { shouldSkipReentrantSync } from "./summarizer.js";
import { syncConversations } from "./sync.js";

const HELP = `
Usage: moe-memory sync [--hook | --background]

Sync conversations from Claude Code and Codex transcript directories to archive and index them.

This command:
1. Copies new or updated .jsonl files to conversation archive
2. Generates embeddings for semantic search
3. Updates the search index

Only processes files that are new or have been modified since last sync.
Safe to run multiple times - subsequent runs are fast no-ops.

OPTIONS:
  --hook          Hook-safe mode: always exits 0, spawns background sync, bounded stderr
  --background    Run sync in background (returns immediately)

EXAMPLES:
  # Sync all new conversations
  moe-memory sync

  # Use in a SessionStart hook (recommended)
  moe-memory sync --hook

  # Sync in background without hook safety
  moe-memory sync --background
`;

const MIGRATION_BATCH_SIZE = Number.parseInt(process.env.MOE_MEMORY_MIGRATION_BATCH || "500", 10);

async function runEmbeddingMigrationPhase(): Promise<void> {
  const db = initDatabase();
  try {
    const stale = countStale(db);
    if (stale === 0) return;

    console.error(
      `\nmoe-memory: ${stale} exchange(s) on the old embedding model — migrating up to ${MIGRATION_BATCH_SIZE} this run`,
    );
    await initEmbeddings();
    const indexDir = getIndexDir();
    const done = await runMigrationBatch(
      db,
      indexDir,
      MIGRATION_BATCH_SIZE,
      generateExchangeEmbedding,
    );
    if (done > 0) {
      const after = countStale(db);
      console.error(
        `moe-memory: re-embedded ${done} (${after} still stale; will resume on next sync)`,
      );
    }
  } catch (err) {
    console.error(
      "moe-memory: migration phase error:",
      err instanceof Error ? err.message : String(err),
    );
  } finally {
    db.close();
  }
}

/**
 * Exit code, so the dispatcher can propagate it. `null` means "keep going".
 */
export async function runSync(args: string[]): Promise<number> {
  // Reentrancy guard (#87): if this sync was triggered by a SessionStart hook
  // inside a Claude subprocess that the summarizer just spawned, exit silently.
  // Without this, summarization spawns a Claude subprocess which fires
  // SessionStart which runs sync which spawns more summarization — cascading
  // fanout that pegs CPU and burns API quota.
  if (shouldSkipReentrantSync()) {
    // stderr keeps the message out of any stdout consumers (e.g., MCP)
    // while still being visible in hook logs.
    console.error("moe-memory: skipping sync inside summarizer-spawned subprocess (#87)");
    return 0;
  }

  if (args.includes("--hook")) {
    return runHookMode(args.filter((a) => a !== "--hook"));
  }

  if (args.includes("--help") || args.includes("-h")) {
    console.log(HELP);
    return 0;
  }

  // If background mode, fork the process and return immediately.
  if (args.includes("--background")) {
    const filteredArgs = args.filter((arg) => arg !== "--background");
    const logPath = getSyncLogPath();
    const logFd = fs.openSync(logPath, "a");
    fs.writeSync(logFd, formatLogLine("info", `Starting background sync from pid ${process.pid}`));

    // Re-spawn this same entry point with the `sync` subcommand. argv[1] is the
    // dispatcher (dist/cli.js, or the bin symlink pointing at it); passing the
    // subcommand back explicitly is what makes that safe under one bin.
    const entry = process.argv[1];
    if (!entry) {
      console.error("moe-memory: cannot determine own entry point; running sync in foreground");
    } else {
      const child = spawn(process.execPath, [entry, "sync", ...filteredArgs], {
        detached: true,
        stdio: ["ignore", logFd, logFd],
      });
      child.unref(); // Allow parent to exit
      console.log(`Sync started in background. Log: ${logPath}`);
      return 0;
    }
  }

  const sourceDirs = getConversationSourceDirs();
  const destDir = getArchiveDir();

  if (sourceDirs.length === 0) {
    console.log("⚠️  No conversation source directories found.");
    console.log("  Checked: ~/.claude/projects, ~/.claude/transcripts, and ~/.codex/sessions");
    if (process.env.CLAUDE_CONFIG_DIR) {
      console.log(`  CLAUDE_CONFIG_DIR is set to: ${process.env.CLAUDE_CONFIG_DIR}`);
    }
    return 0;
  }

  // Single-instance lock (#97). Independent SessionStart events from multiple
  // Claude Code sessions each fire `sync --background`; without a lock they race
  // the SQLite write path and pile up Claude subprocesses for summarization. On
  // Windows the latter exhausts the desktop heap and crashes the workers with
  // STATUS_DLL_INIT_FAILED. Acquire after the source-dir check so help/version
  // paths don't touch the filesystem unnecessarily, and release on every exit.
  const syncLockPath = path.join(path.dirname(getSyncLogPath()), "moe-memory-sync.lock");
  const syncLock = acquireFileLock(syncLockPath);
  if (!syncLock) {
    const holder = readLockHolder(syncLockPath);
    const holderLabel = holder !== null ? `pid ${holder}` : "another process";
    console.error(`moe-memory: sync already running (${holderLabel}); skipping`);
    return 0;
  }
  let released = false;
  const releaseSyncLockOnce = (): void => {
    if (released) return;
    released = true;
    releaseFileLock(syncLock);
  };
  process.on("exit", releaseSyncLockOnce);
  process.on("SIGINT", () => {
    releaseSyncLockOnce();
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    releaseSyncLockOnce();
    process.exit(143);
  });
  process.on("SIGHUP", () => {
    releaseSyncLockOnce();
    process.exit(129);
  });

  console.log("Syncing conversations...");
  console.log(`Sources: ${sourceDirs.join(", ")}`);
  console.log(`Destination: ${destDir}\n`);

  const totals = {
    copied: 0,
    skipped: 0,
    indexed: 0,
    summarized: 0,
    errors: [] as Array<{ file: string; error: string }>,
  };

  try {
    for (const sourceDir of sourceDirs) {
      const result = await syncConversations(sourceDir, destDir);
      totals.copied += result.copied;
      totals.skipped += result.skipped;
      totals.indexed += result.indexed;
      totals.summarized += result.summarized;
      totals.errors.push(...result.errors);
    }

    console.log("\n✅ Sync complete!");
    console.log(`  Copied: ${totals.copied}`);
    console.log(`  Skipped: ${totals.skipped}`);
    console.log(`  Indexed: ${totals.indexed}`);
    console.log(`  Summarized: ${totals.summarized}`);

    if (totals.errors.length > 0) {
      console.log(`\n⚠️  Errors: ${totals.errors.length}`);
      for (const err of totals.errors) console.log(`  ${err.file}: ${err.error}`);

      // Help diagnose silent summarization failures (#70)
      const summaryErrors = totals.errors.filter((e) =>
        e.error.startsWith("Summary generation failed"),
      );
      if (summaryErrors.length > 0 && totals.summarized === 0) {
        console.log(`\n💡 All ${summaryErrors.length} summarization attempts failed.`);
        console.log(
          "  Check your API configuration (MOE_MEMORY_API_BASE_URL / ANTHROPIC_API_KEY).",
        );
      }
    }

    // After regular sync, do a batch of embedding migration if any rows are
    // still on the old encoder. Lock-protected; if another process is already
    // migrating, this is a no-op.
    await runEmbeddingMigrationPhase();
    return 0;
  } finally {
    releaseSyncLockOnce();
  }
}

const MAX_HOOK_STDERR_BYTES = 512;

function writeBoundedHookDiagnostic(error: unknown): void {
  const msg = error instanceof Error ? error.message : String(error);
  const bounded =
    msg.length > MAX_HOOK_STDERR_BYTES ? `${msg.slice(0, MAX_HOOK_STDERR_BYTES)}…` : msg;
  process.stderr.write(`moe-memory: hook sync failed: ${bounded}\n`);
}

async function runHookMode(args: string[]): Promise<number> {
  try {
    const logPath = getSyncLogPath();
    const logFd = fs.openSync(logPath, "a");
    fs.writeSync(logFd, formatLogLine("info", `Hook sync starting from pid ${process.pid}`));

    const entry = process.argv[1];
    if (!entry) {
      fs.writeSync(logFd, formatLogLine("error", "Cannot determine own entry point"));
      fs.closeSync(logFd);
      return 0;
    }

    const child = spawn(process.execPath, [entry, "sync", ...args], {
      detached: true,
      stdio: ["ignore", logFd, logFd],
    });
    child.unref();
    fs.closeSync(logFd);
  } catch (error) {
    writeBoundedHookDiagnostic(error);
  }
  return 0;
}
