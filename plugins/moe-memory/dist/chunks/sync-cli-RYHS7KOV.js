// @generated — do not edit; see scripts/build-runtime.mjs
import { createRequire as __createRequire } from 'module';
const require = __createRequire(import.meta.url);
import {
  syncConversations
} from "./chunk-DWPDJ6LO.js";
import {
  formatLogLine,
  getSyncLogPath
} from "./chunk-KB33ZOJX.js";
import {
  generateExchangeEmbedding,
  initEmbeddings
} from "./chunk-TD4KRVGL.js";
import {
  countStale,
  initDatabase,
  runMigrationBatch
} from "./chunk-X4QDSJ7Q.js";
import {
  getArchiveDir,
  getConversationSourceDirs,
  getIndexDir
} from "./chunk-YFLZKW2J.js";
import {
  acquireFileLock,
  readLockHolder,
  releaseFileLock
} from "./chunk-OYWI4M6D.js";
import {
  shouldSkipReentrantSync
} from "./chunk-EYIEB7RJ.js";
import "./chunk-KVDJIHLR.js";
import "./chunk-NH4NDHAK.js";
import "./chunk-ZCVHMAKN.js";
import "./chunk-YAXDOI5O.js";
import "./chunk-XRZM5UX2.js";

// src/sync-cli.ts
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
var HELP = `
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
var MIGRATION_BATCH_SIZE = Number.parseInt(process.env.MOE_MEMORY_MIGRATION_BATCH || "500", 10);
async function runEmbeddingMigrationPhase() {
  const db = initDatabase();
  try {
    const stale = countStale(db);
    if (stale === 0) return;
    console.error(
      `
moe-memory: ${stale} exchange(s) on the old embedding model \u2014 migrating up to ${MIGRATION_BATCH_SIZE} this run`
    );
    await initEmbeddings();
    const indexDir = getIndexDir();
    const done = await runMigrationBatch(
      db,
      indexDir,
      MIGRATION_BATCH_SIZE,
      generateExchangeEmbedding
    );
    if (done > 0) {
      const after = countStale(db);
      console.error(
        `moe-memory: re-embedded ${done} (${after} still stale; will resume on next sync)`
      );
    }
  } catch (err) {
    console.error(
      "moe-memory: migration phase error:",
      err instanceof Error ? err.message : String(err)
    );
  } finally {
    db.close();
  }
}
async function runSync(args) {
  if (shouldSkipReentrantSync()) {
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
  if (args.includes("--background")) {
    const filteredArgs = args.filter((arg) => arg !== "--background");
    const logPath = getSyncLogPath();
    const logFd = fs.openSync(logPath, "a");
    fs.writeSync(logFd, formatLogLine("info", `Starting background sync from pid ${process.pid}`));
    const entry = process.argv[1];
    if (!entry) {
      console.error("moe-memory: cannot determine own entry point; running sync in foreground");
    } else {
      const child = spawn(process.execPath, [entry, "sync", ...filteredArgs], {
        detached: true,
        stdio: ["ignore", logFd, logFd]
      });
      child.unref();
      console.log(`Sync started in background. Log: ${logPath}`);
      return 0;
    }
  }
  const sourceDirs = getConversationSourceDirs();
  const destDir = getArchiveDir();
  if (sourceDirs.length === 0) {
    console.log("\u26A0\uFE0F  No conversation source directories found.");
    console.log("  Checked: ~/.claude/projects, ~/.claude/transcripts, and ~/.codex/sessions");
    if (process.env.CLAUDE_CONFIG_DIR) {
      console.log(`  CLAUDE_CONFIG_DIR is set to: ${process.env.CLAUDE_CONFIG_DIR}`);
    }
    return 0;
  }
  const syncLockPath = path.join(path.dirname(getSyncLogPath()), "moe-memory-sync.lock");
  const syncLock = acquireFileLock(syncLockPath);
  if (!syncLock) {
    const holder = readLockHolder(syncLockPath);
    const holderLabel = holder !== null ? `pid ${holder}` : "another process";
    console.error(`moe-memory: sync already running (${holderLabel}); skipping`);
    return 0;
  }
  let released = false;
  const releaseSyncLockOnce = () => {
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
  console.log(`Destination: ${destDir}
`);
  const totals = {
    copied: 0,
    skipped: 0,
    indexed: 0,
    summarized: 0,
    errors: []
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
    console.log("\n\u2705 Sync complete!");
    console.log(`  Copied: ${totals.copied}`);
    console.log(`  Skipped: ${totals.skipped}`);
    console.log(`  Indexed: ${totals.indexed}`);
    console.log(`  Summarized: ${totals.summarized}`);
    if (totals.errors.length > 0) {
      console.log(`
\u26A0\uFE0F  Errors: ${totals.errors.length}`);
      for (const err of totals.errors) console.log(`  ${err.file}: ${err.error}`);
      const summaryErrors = totals.errors.filter(
        (e) => e.error.startsWith("Summary generation failed")
      );
      if (summaryErrors.length > 0 && totals.summarized === 0) {
        console.log(`
\u{1F4A1} All ${summaryErrors.length} summarization attempts failed.`);
        console.log(
          "  Check your API configuration (MOE_MEMORY_API_BASE_URL / ANTHROPIC_API_KEY)."
        );
      }
    }
    await runEmbeddingMigrationPhase();
    return 0;
  } finally {
    releaseSyncLockOnce();
  }
}
var MAX_HOOK_STDERR_BYTES = 512;
function writeBoundedHookDiagnostic(error) {
  const msg = error instanceof Error ? error.message : String(error);
  const bounded = msg.length > MAX_HOOK_STDERR_BYTES ? `${msg.slice(0, MAX_HOOK_STDERR_BYTES)}\u2026` : msg;
  process.stderr.write(`moe-memory: hook sync failed: ${bounded}
`);
}
async function runHookMode(args) {
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
      stdio: ["ignore", logFd, logFd]
    });
    child.unref();
    fs.closeSync(logFd);
  } catch (error) {
    writeBoundedHookDiagnostic(error);
  }
  return 0;
}
export {
  runSync
};
