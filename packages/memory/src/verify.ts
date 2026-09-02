import fs from "node:fs";
import path from "node:path";
import { getAllExchanges, getFileLastIndexed, initDatabase } from "./db.js";
import { parseConversation } from "./parser.js";
import { findJsonlFiles, getArchiveDir, getExcludedProjects } from "./paths.js";
import { isErroredSentinel } from "./summary-sentinel.js";
import { shouldSkipConversation } from "./sync.js";

export interface VerificationResult {
  missing: Array<{ path: string; reason: string }>;
  orphaned: Array<{ uuid: string; path: string }>;
  outdated: Array<{ path: string; fileTime: number; dbTime: number }>;
  corrupted: Array<{ path: string; error: string }>;
}

export async function verifyIndex(): Promise<VerificationResult> {
  const result: VerificationResult = {
    missing: [],
    orphaned: [],
    outdated: [],
    corrupted: [],
  };

  const archiveDir = getArchiveDir();

  // Track all files we find
  const foundFiles = new Set<string>();

  // Find all conversation files
  if (!fs.existsSync(archiveDir)) {
    return result;
  }

  // Initialize database once for all checks
  const db = initDatabase();

  const projects = fs.readdirSync(archiveDir);
  const excludedProjects = getExcludedProjects();
  const excludedDirSet = new Set(excludedProjects);
  let totalChecked = 0;

  for (const project of projects) {
    if (excludedProjects.includes(project)) {
      console.log(`\nSkipping excluded project: ${project}`);
      continue;
    }

    const projectPath = path.join(archiveDir, project);
    const stat = fs.statSync(projectPath);

    if (!stat.isDirectory()) continue;

    const files = findJsonlFiles(projectPath, excludedDirSet);

    for (const file of files) {
      totalChecked++;

      if (totalChecked % 100 === 0) {
        console.log(`  Checked ${totalChecked} conversations...`);
      }

      const conversationPath = path.join(projectPath, file);
      foundFiles.add(conversationPath);

      // A conversation the user marked DO-NOT-INDEX (CR-075/CR-076) has no
      // summary by design — sync.ts's summarize gate is
      // `shouldQueueForSummary(summaryPath) && !shouldSkipConversation(destFile)`,
      // so it never gets one. Reporting that as "missing" turned a respected
      // opt-out into an apparent index defect, and `index --repair` would then
      // re-index and externally summarize exactly the conversation the user
      // excluded. It is still tracked in `foundFiles` above so it is never
      // reported as orphaned either.
      if (shouldSkipConversation(conversationPath)) {
        continue;
      }

      const summaryPath = conversationPath.replace(".jsonl", "-summary.txt");

      // Check for missing or errored summary. An error sentinel (#96) means a
      // previous summarization failed — verify treats it as "missing" so repair
      // re-attempts it rather than reporting the conversation as healthy.
      if (!fs.existsSync(summaryPath)) {
        result.missing.push({ path: conversationPath, reason: "No summary file" });
        continue;
      }
      if (isErroredSentinel(fs.readFileSync(summaryPath, "utf-8"))) {
        result.missing.push({
          path: conversationPath,
          reason: "Previous summarization failed (error sentinel)",
        });
        continue;
      }

      // Check if file is outdated (modified after last_indexed)
      const lastIndexed = getFileLastIndexed(db, conversationPath);
      if (lastIndexed !== null) {
        const fileStat = fs.statSync(conversationPath);
        if (fileStat.mtimeMs > lastIndexed) {
          result.outdated.push({
            path: conversationPath,
            fileTime: fileStat.mtimeMs,
            dbTime: lastIndexed,
          });
        }
      }

      // Try parsing to detect corruption
      try {
        await parseConversation(conversationPath, project, conversationPath);
      } catch (error) {
        result.corrupted.push({
          path: conversationPath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  console.log(`Verified ${totalChecked} conversations.`);

  // Check for orphaned database entries
  const dbExchanges = getAllExchanges(db);
  db.close();

  for (const exchange of dbExchanges) {
    if (!foundFiles.has(exchange.archivePath)) {
      result.orphaned.push({
        uuid: exchange.id,
        path: exchange.archivePath,
      });
    }
  }

  return result;
}

export interface RepairOptions {
  /**
   * Skip AI summary generation. Mirrors `moe-memory index --no-summaries`, which
   * every other indexing entry point already had; `repair` did not, so its only
   * code path required live Claude auth.
   */
  noSummaries?: boolean | undefined;
}

export async function repairIndex(
  issues: VerificationResult,
  options: RepairOptions = {},
): Promise<void> {
  console.log("Repairing index...");

  // To avoid circular dependencies, we import the indexer functions dynamically
  const { initDatabase, insertExchange, deleteExchange } = await import("./db.js");
  const { parseConversation } = await import("./parser.js");
  const { initEmbeddings, generateExchangeEmbedding } = await import("./embeddings.js");
  const { summarizeConversation } = await import("./summarizer.js");
  const { formatErrorSentinel } = await import("./summary-sentinel.js");

  const db = initDatabase();
  await initEmbeddings();

  // Remove orphaned entries first
  for (const orphan of issues.orphaned) {
    console.log(`Removing orphaned entry: ${orphan.uuid}`);
    deleteExchange(db, orphan.uuid);
  }

  // Re-index missing and outdated conversations
  const toReindex = [...issues.missing.map((m) => m.path), ...issues.outdated.map((o) => o.path)];

  for (const conversationPath of toReindex) {
    // Defense in depth (CR-075/CR-076): verifyIndex no longer classifies a
    // marked conversation as missing, but `issues` can be handed in from an
    // older database state (a saved --verify report, a caller that built its
    // own VerificationResult), so refuse to summarize or index one here too.
    if (shouldSkipConversation(conversationPath)) {
      console.log(`Skipping DO-NOT-INDEX conversation: ${conversationPath}`);
      continue;
    }

    console.log(`Re-indexing: ${conversationPath}`);
    try {
      // Extract project name from path
      const archiveDir = getArchiveDir();
      const relativePath = conversationPath.replace(archiveDir + path.sep, "");
      const project = relativePath.split(path.sep)[0] ?? "unknown";

      // Parse conversation
      const exchanges = await parseConversation(conversationPath, project, conversationPath);

      if (exchanges.length === 0) {
        console.log(`  Skipped (no exchanges)`);
        continue;
      }

      // Generate/update summary.
      //
      // A summarizer failure no longer aborts the re-index. Upstream this whole
      // block was one try/catch, so a transient API error meant the exchanges
      // were never indexed either — which made repair the one indexing path that
      // could not run without live Claude auth. It now writes the same error
      // sentinel the indexer and sync write (#96) and carries on.
      const summaryPath = conversationPath.replace(".jsonl", "-summary.txt");
      if (options.noSummaries) {
        console.log("  Skipping summary (--no-summaries)");
      } else {
        try {
          const summary = await summarizeConversation(exchanges);
          fs.writeFileSync(summaryPath, summary, "utf-8");
          console.log(`  Created summary: ${summary.split(/\s+/).length} words`);
        } catch (error) {
          try {
            fs.writeFileSync(summaryPath, formatErrorSentinel(error), "utf-8");
          } catch {}
          console.log(
            `  Summary failed, continuing with index: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }

      // Index exchanges
      for (const exchange of exchanges) {
        const toolNames = exchange.toolCalls?.map((tc) => tc.toolName);
        const embedding = await generateExchangeEmbedding(
          exchange.userMessage,
          exchange.assistantMessage,
          toolNames,
        );
        insertExchange(db, exchange, embedding, toolNames);
      }

      console.log(`  Indexed ${exchanges.length} exchanges`);
    } catch (error) {
      console.error(`Failed to re-index ${conversationPath}:`, error);
    }
  }

  db.close();

  // Report corrupted files (manual intervention needed)
  if (issues.corrupted.length > 0) {
    console.log("\n⚠️  Corrupted files (manual review needed):");
    for (const c of issues.corrupted) {
      console.log(`  ${c.path}: ${c.error}`);
    }
  }

  console.log("✅ Repair complete.");
}
