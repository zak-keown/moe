/**
 * `moe-memory index` — index, verify, repair or rebuild the conversation index.
 *
 * Collapses two upstream layers: `cli/index-conversations.js` (flag parsing,
 * the `--rebuild` confirmation prompt, help text) and `dist/index-cli.js`
 * (subcommand dispatch). They were separate only because one was a shim that
 * spawned the other.
 */

import fs from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { initDatabase } from "./db.js";
import { indexConversations, indexSession, indexUnprocessed } from "./indexer.js";
import { JournalStore } from "./journal/store.js";
import { getArchiveDir, getDbPath } from "./paths.js";
import { repairIndex, verifyIndex } from "./verify.js";

const HELP = `
Usage: moe-memory index [COMMAND] [OPTIONS]

COMMANDS:
  (default)      Index all conversations
  --cleanup      Process only unindexed conversations (fast, cheap)
  --session ID   Index specific session (used by the SessionStart hook)
  --verify       Check index health
  --repair       Fix detected issues
  --rebuild      Delete DB and re-index everything (requires confirmation)

OPTIONS:
  --concurrency N    Parallel summarization (1-16, default: 1)
  -c N               Short form of --concurrency
  --no-summaries     Skip AI summary generation (free, but no summaries in results)
  --help, -h         Show this help

EXAMPLES:
  # Index all unprocessed (recommended for backfill)
  moe-memory index --cleanup

  # Index with 8 parallel summarizations (8x faster)
  moe-memory index --cleanup --concurrency 8

  # Index without AI summaries (free, fast)
  moe-memory index --cleanup --no-summaries

  # Check index health
  moe-memory index --verify

  # Fix any issues found
  moe-memory index --repair

  # Nuclear option (deletes everything, re-indexes)
  moe-memory index --rebuild

WORKFLOW:
  1. Initial setup: moe-memory index --cleanup
  2. Ongoing: auto-indexed by the SessionStart hook (moe-memory sync)
  3. Health check: moe-memory index --verify (weekly)
  4. Recovery: moe-memory index --repair (if issues found)
`;

function getConcurrency(args: string[]): number {
  const idx = args.findIndex((arg) => arg === "--concurrency" || arg === "-c");
  if (idx !== -1) {
    const raw = args[idx + 1];
    if (raw) {
      const value = Number.parseInt(raw, 10);
      if (value >= 1 && value <= 16) return value;
    }
  }
  return 1; // default
}

function askConfirmation(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "yes");
    });
  });
}

export async function runIndex(args: string[]): Promise<number> {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(HELP);
    return 0;
  }

  const concurrency = getConcurrency(args);
  const noSummaries = args.includes("--no-summaries");
  const command = args[0];

  if (command === "--session") {
    const sessionId = args[1];
    if (!sessionId) {
      console.error("Usage: moe-memory index --session <session-id>");
      return 1;
    }
    await indexSession(sessionId, concurrency, noSummaries);
    return 0;
  }

  if (command === "--cleanup") {
    await indexUnprocessed(concurrency, noSummaries);
    return 0;
  }

  if (command === "--verify") {
    console.log("Verifying conversation index...");
    const issues = await verifyIndex();

    console.log("\n=== Verification Results ===");
    console.log(`Missing summaries: ${issues.missing.length}`);
    console.log(`Orphaned entries: ${issues.orphaned.length}`);
    console.log(`Outdated files: ${issues.outdated.length}`);
    console.log(`Corrupted files: ${issues.corrupted.length}`);

    if (issues.missing.length > 0) {
      console.log("\nMissing summaries:");
      for (const m of issues.missing) console.log(`  ${m.path}`);
    }

    const total =
      issues.missing.length +
      issues.orphaned.length +
      issues.outdated.length +
      issues.corrupted.length;
    if (total > 0) {
      console.log("\nRun with --repair to fix these issues.");
      return 1;
    }
    console.log("\n✅ Index is healthy!");
    return 0;
  }

  if (command === "--repair") {
    console.log("Verifying conversation index...");
    const issues = await verifyIndex();
    if (issues.missing.length + issues.orphaned.length + issues.outdated.length > 0) {
      await repairIndex(issues, { noSummaries });
    } else {
      console.log("✅ No issues to repair!");
    }
    return 0;
  }

  if (command === "--rebuild") {
    console.log("⚠️  This will DELETE the entire database and re-index everything.");
    if (!args.includes("--yes") && !(await askConfirmation("Are you sure? [yes/NO]: "))) {
      console.log("Cancelled");
      return 0;
    }

    console.log("Rebuilding entire index...");

    const dbPath = getDbPath();
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
      console.log("Deleted existing database");
    }

    const archiveDir = getArchiveDir();
    if (fs.existsSync(archiveDir)) {
      for (const project of fs.readdirSync(archiveDir)) {
        const projectPath = path.join(archiveDir, project);
        if (!fs.statSync(projectPath).isDirectory()) continue;
        const summaries = fs.readdirSync(projectPath).filter((f) => f.endsWith("-summary.txt"));
        for (const summary of summaries) {
          fs.unlinkSync(path.join(projectPath, summary));
        }
      }
      console.log("Deleted all summary files");
    }

    console.log("Re-indexing all conversations...");
    await indexConversations(undefined, undefined, concurrency, noSummaries);

    // Re-index the journal too.
    //
    // `getDbPath()` is ONE database holding both record types — conversation
    // turns and journal entries (src/db.ts). So `--rebuild` deletes the journal
    // index as well, and re-indexing conversations does not bring it back: the
    // command used to return 0 having silently emptied half the store. Journal
    // markdown is the source of truth and always survives, so nothing was
    // unrecoverable, but the user was never told they now had to run
    // `moe-memory journal index` by hand, and a search would just quietly
    // return nothing.
    //
    // Failure here is reported and does not fail the rebuild: the conversation
    // re-index above may have taken hours and cost money in summarisation, and
    // throwing that away over a journal walk would be the worse outcome.
    console.log("Re-indexing the journal...");
    const journalDb = initDatabase();
    try {
      const journal = await new JournalStore().indexJournal(journalDb);
      console.log(
        `✅ Journal re-indexed: ${journal.indexed} indexed, ${journal.failed} failed, ${journal.total} entries on disk`,
      );
    } catch (error) {
      console.error(
        `⚠️  Journal re-index failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      console.error("    Run `moe-memory journal index` to retry. Your entries are safe on disk.");
    } finally {
      journalDb.close();
    }
    return 0;
  }

  await indexConversations(undefined, undefined, concurrency, noSummaries);
  return 0;
}
