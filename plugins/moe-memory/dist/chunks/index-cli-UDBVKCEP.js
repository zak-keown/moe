// @generated — do not edit; see scripts/build-runtime.mjs
import { createRequire as __createRequire } from 'module';
const require = __createRequire(import.meta.url);
import {
  shouldSkipConversation
} from "./chunk-SW5YMIYD.js";
import {
  JournalStore
} from "./chunk-XQQVRDY6.js";
import {
  parseConversation
} from "./chunk-NSDW7PUB.js";
import "./chunk-22YHH63V.js";
import {
  generateExchangeEmbedding,
  initEmbeddings
} from "./chunk-TD4KRVGL.js";
import {
  getAllExchanges,
  getFileLastIndexed,
  initDatabase,
  insertExchange
} from "./chunk-X4QDSJ7Q.js";
import {
  findJsonlFiles,
  getArchiveDir,
  getConversationSourceDirs,
  getDbPath,
  getExcludedProjects
} from "./chunk-YFLZKW2J.js";
import "./chunk-OYWI4M6D.js";
import {
  summarizeConversation
} from "./chunk-HSI3HVDR.js";
import "./chunk-KVDJIHLR.js";
import "./chunk-NH4NDHAK.js";
import "./chunk-ZCVHMAKN.js";
import {
  formatErrorSentinel,
  isErroredSentinel,
  shouldQueueForSummary
} from "./chunk-YAXDOI5O.js";
import "./chunk-XRZM5UX2.js";

// src/index-cli.ts
import fs3 from "node:fs";
import path3 from "node:path";
import { createInterface } from "node:readline";

// src/indexer.ts
import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
var embeddingsAvailable = false;
async function tryInitEmbeddings() {
  try {
    await initEmbeddings();
    embeddingsAvailable = true;
    return true;
  } catch {
    console.error("moe-memory: embedding model unavailable; text will be stored without vectors");
    embeddingsAvailable = false;
    return false;
  }
}
async function tryGenerateEmbedding(userMessage, assistantMessage, toolNames) {
  if (!embeddingsAvailable) return null;
  try {
    return await generateExchangeEmbedding(userMessage, assistantMessage, toolNames);
  } catch {
    return null;
  }
}
process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS = "20000";
EventEmitter.defaultMaxListeners = 20;
async function processBatch(items, processor, concurrency) {
  const results = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);
  }
  return results;
}
function sessionIdForSummary(exchanges) {
  return exchanges.find((exchange) => exchange.sessionId)?.sessionId;
}
function excludeByResolvedProject(exchanges, excludedProjects) {
  if (excludedProjects.length === 0) return exchanges;
  const excluded = new Set(excludedProjects);
  return exchanges.filter((exchange) => !excluded.has(exchange.project));
}
async function indexConversations(limitToProject, maxConversations, concurrency = 1, noSummaries = false) {
  console.log("Initializing database...");
  const db = initDatabase();
  console.log("Loading embedding model...");
  await tryInitEmbeddings();
  if (noSummaries) {
    console.log("\u26A0\uFE0F  Running in no-summaries mode (skipping AI summaries)");
  }
  console.log("Scanning for conversation files...");
  const sourceDirs = getConversationSourceDirs();
  const ARCHIVE_DIR = getArchiveDir();
  let totalExchanges = 0;
  let conversationsProcessed = 0;
  const excludedProjects = getExcludedProjects();
  const excludedDirSet = new Set(excludedProjects);
  for (const sourceDir of sourceDirs) {
    const projects = fs.readdirSync(sourceDir);
    for (const project of projects) {
      if (excludedProjects.includes(project)) {
        console.log(`
Skipping excluded project: ${project}`);
        continue;
      }
      if (limitToProject && project !== limitToProject) continue;
      const projectPath = path.join(sourceDir, project);
      const stat = fs.statSync(projectPath);
      if (!stat.isDirectory()) continue;
      const files = findJsonlFiles(projectPath, excludedDirSet);
      if (files.length === 0) continue;
      console.log(`
Processing project: ${project} (${files.length} conversations)`);
      if (concurrency > 1) console.log(`  Concurrency: ${concurrency}`);
      const projectArchive = path.join(ARCHIVE_DIR, project);
      fs.mkdirSync(projectArchive, { recursive: true });
      const toProcess = [];
      for (const file of files) {
        const sourcePath = path.join(projectPath, file);
        const archivePath = path.join(projectArchive, file);
        if (!fs.existsSync(archivePath)) {
          fs.mkdirSync(path.dirname(archivePath), { recursive: true });
          fs.copyFileSync(sourcePath, archivePath);
          console.log(`  Archived: ${file}`);
        }
        if (shouldSkipConversation(archivePath)) {
          console.log(`  Skipping DO-NOT-INDEX conversation: ${file}`);
          continue;
        }
        const exchanges = excludeByResolvedProject(
          await parseConversation(sourcePath, project, archivePath),
          excludedProjects
        );
        if (exchanges.length === 0) {
          console.log(`  Skipped ${file} (no exchanges)`);
          continue;
        }
        toProcess.push({
          file,
          sourcePath,
          archivePath,
          summaryPath: archivePath.replace(".jsonl", "-summary.txt"),
          exchanges
        });
      }
      if (!noSummaries) {
        const needsSummary = toProcess.filter((c) => shouldQueueForSummary(c.summaryPath));
        if (needsSummary.length > 0) {
          console.log(
            `  Generating ${needsSummary.length} summaries (concurrency: ${concurrency})...`
          );
          await processBatch(
            needsSummary,
            async (conv) => {
              try {
                const summary = await summarizeConversation(
                  conv.exchanges,
                  sessionIdForSummary(conv.exchanges)
                );
                fs.writeFileSync(conv.summaryPath, summary, "utf-8");
                const wordCount = summary.split(/\s+/).length;
                console.log(`  \u2713 ${conv.file}: ${wordCount} words`);
                return summary;
              } catch (error) {
                try {
                  fs.writeFileSync(conv.summaryPath, formatErrorSentinel(error), "utf-8");
                } catch {
                }
                console.log(`  \u2717 ${conv.file}: ${error}`);
                return null;
              }
            },
            concurrency
          );
        }
      } else {
        console.log(`  Skipping ${toProcess.length} summaries (--no-summaries mode)`);
      }
      for (const conv of toProcess) {
        for (const exchange of conv.exchanges) {
          const toolNames = exchange.toolCalls?.map((tc) => tc.toolName);
          const embedding = await tryGenerateEmbedding(
            exchange.userMessage,
            exchange.assistantMessage,
            toolNames
          );
          insertExchange(db, exchange, embedding, toolNames);
        }
        totalExchanges += conv.exchanges.length;
        conversationsProcessed++;
        if (maxConversations && conversationsProcessed >= maxConversations) {
          console.log(`
Reached limit of ${maxConversations} conversations`);
          db.close();
          console.log(
            `\u2705 Indexing complete! Conversations: ${conversationsProcessed}, Exchanges: ${totalExchanges}`
          );
          return;
        }
      }
    }
  }
  db.close();
  console.log(
    `
\u2705 Indexing complete! Conversations: ${conversationsProcessed}, Exchanges: ${totalExchanges}`
  );
}
async function indexSession(sessionId, _concurrency = 1, noSummaries = false) {
  console.log(`Indexing session: ${sessionId}`);
  const sourceDirs = getConversationSourceDirs();
  const ARCHIVE_DIR = getArchiveDir();
  const excludedProjects = getExcludedProjects();
  const excludedDirSet = new Set(excludedProjects);
  let found = false;
  for (const sourceDir of sourceDirs) {
    const projects = fs.readdirSync(sourceDir);
    for (const project of projects) {
      if (excludedProjects.includes(project)) continue;
      const projectPath = path.join(sourceDir, project);
      if (!fs.statSync(projectPath).isDirectory()) continue;
      const files = findJsonlFiles(projectPath, excludedDirSet).filter(
        (f) => f.includes(sessionId)
      );
      if (files.length > 0) {
        const file = files[0];
        if (!file) continue;
        found = true;
        const sourcePath = path.join(projectPath, file);
        const db = initDatabase();
        await tryInitEmbeddings();
        const projectArchive = path.join(ARCHIVE_DIR, project);
        fs.mkdirSync(projectArchive, { recursive: true });
        const archivePath = path.join(projectArchive, file);
        if (!fs.existsSync(archivePath)) {
          fs.mkdirSync(path.dirname(archivePath), { recursive: true });
          fs.copyFileSync(sourcePath, archivePath);
        }
        if (shouldSkipConversation(archivePath)) {
          console.log(`Skipping DO-NOT-INDEX conversation: ${sessionId}`);
          db.close();
          break;
        }
        const exchanges = excludeByResolvedProject(
          await parseConversation(sourcePath, project, archivePath),
          excludedProjects
        );
        if (exchanges.length > 0) {
          const summaryPath = archivePath.replace(".jsonl", "-summary.txt");
          if (!noSummaries && shouldQueueForSummary(summaryPath)) {
            fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
            try {
              const summary = await summarizeConversation(
                exchanges,
                sessionIdForSummary(exchanges)
              );
              fs.writeFileSync(summaryPath, summary, "utf-8");
              console.log(`Summary: ${summary.split(/\s+/).length} words`);
            } catch (error) {
              try {
                fs.writeFileSync(summaryPath, formatErrorSentinel(error), "utf-8");
              } catch {
              }
              console.log(
                `Summary failed: ${error instanceof Error ? error.message : String(error)}`
              );
            }
          }
          for (const exchange of exchanges) {
            const toolNames = exchange.toolCalls?.map((tc) => tc.toolName);
            const embedding = await tryGenerateEmbedding(
              exchange.userMessage,
              exchange.assistantMessage,
              toolNames
            );
            insertExchange(db, exchange, embedding, toolNames);
          }
          console.log(`\u2705 Indexed session ${sessionId}: ${exchanges.length} exchanges`);
        }
        db.close();
        break;
      }
    }
    if (found) break;
  }
  if (!found) {
    console.log(`Session ${sessionId} not found`);
  }
}
async function indexUnprocessed(concurrency = 1, noSummaries = false) {
  console.log("Finding unprocessed conversations...");
  if (concurrency > 1) console.log(`Concurrency: ${concurrency}`);
  if (noSummaries) console.log("\u26A0\uFE0F  Running in no-summaries mode (skipping AI summaries)");
  const db = initDatabase();
  await tryInitEmbeddings();
  const sourceDirs = getConversationSourceDirs();
  const ARCHIVE_DIR = getArchiveDir();
  const excludedProjects = getExcludedProjects();
  const excludedDirSet = new Set(excludedProjects);
  const unprocessed = [];
  for (const sourceDir of sourceDirs) {
    const projects = fs.readdirSync(sourceDir);
    for (const project of projects) {
      if (excludedProjects.includes(project)) continue;
      const projectPath = path.join(sourceDir, project);
      if (!fs.statSync(projectPath).isDirectory()) continue;
      const files = findJsonlFiles(projectPath, excludedDirSet);
      for (const file of files) {
        const sourcePath = path.join(projectPath, file);
        const projectArchive = path.join(ARCHIVE_DIR, project);
        const archivePath = path.join(projectArchive, file);
        const summaryPath = archivePath.replace(".jsonl", "-summary.txt");
        const hw = db.prepare(
          "SELECT COALESCE(MAX(line_end), 0) as maxLine FROM exchanges WHERE archive_path = ?"
        ).get(archivePath);
        const maxIndexedLine = hw.maxLine;
        fs.mkdirSync(path.dirname(archivePath), { recursive: true });
        if (!fs.existsSync(archivePath) || maxIndexedLine > 0) {
          fs.copyFileSync(sourcePath, archivePath);
        }
        if (shouldSkipConversation(archivePath)) {
          continue;
        }
        const exchanges = excludeByResolvedProject(
          await parseConversation(sourcePath, project, archivePath),
          excludedProjects
        );
        const newExchanges = maxIndexedLine > 0 ? exchanges.filter((e) => e.lineStart > maxIndexedLine) : exchanges;
        if (newExchanges.length === 0) continue;
        unprocessed.push({
          project,
          file,
          sourcePath,
          archivePath,
          summaryPath,
          exchanges: newExchanges
        });
      }
    }
  }
  if (unprocessed.length === 0) {
    console.log("\u2705 All conversations are already processed!");
    db.close();
    return;
  }
  console.log(`Found ${unprocessed.length} unprocessed conversations`);
  if (!noSummaries) {
    const needsSummary = unprocessed.filter((c) => shouldQueueForSummary(c.summaryPath));
    if (needsSummary.length > 0) {
      console.log(`Generating ${needsSummary.length} summaries (concurrency: ${concurrency})...
`);
      await processBatch(
        needsSummary,
        async (conv) => {
          try {
            const summary = await summarizeConversation(
              conv.exchanges,
              sessionIdForSummary(conv.exchanges)
            );
            fs.writeFileSync(conv.summaryPath, summary, "utf-8");
            const wordCount = summary.split(/\s+/).length;
            console.log(`  \u2713 ${conv.project}/${conv.file}: ${wordCount} words`);
            return summary;
          } catch (error) {
            try {
              fs.writeFileSync(conv.summaryPath, formatErrorSentinel(error), "utf-8");
            } catch {
            }
            console.log(`  \u2717 ${conv.project}/${conv.file}: ${error}`);
            return null;
          }
        },
        concurrency
      );
    }
  } else {
    console.log(
      `Skipping summaries for ${unprocessed.length} conversations (--no-summaries mode)
`
    );
  }
  console.log(`
Indexing...`);
  for (const conv of unprocessed) {
    for (const exchange of conv.exchanges) {
      const toolNames = exchange.toolCalls?.map((tc) => tc.toolName);
      const embedding = await tryGenerateEmbedding(
        exchange.userMessage,
        exchange.assistantMessage,
        toolNames
      );
      insertExchange(db, exchange, embedding, toolNames);
    }
  }
  db.close();
  console.log(`
\u2705 Processed ${unprocessed.length} conversations`);
}

// src/verify.ts
import fs2 from "node:fs";
import path2 from "node:path";
async function verifyIndex() {
  const result = {
    missing: [],
    orphaned: [],
    outdated: [],
    corrupted: []
  };
  const archiveDir = getArchiveDir();
  const foundFiles = /* @__PURE__ */ new Set();
  if (!fs2.existsSync(archiveDir)) {
    return result;
  }
  const db = initDatabase();
  try {
    const projects = fs2.readdirSync(archiveDir);
    const excludedProjects = getExcludedProjects();
    const excludedDirSet = new Set(excludedProjects);
    let totalChecked = 0;
    for (const project of projects) {
      if (excludedProjects.includes(project)) {
        console.log(`
Skipping excluded project: ${project}`);
        continue;
      }
      const projectPath = path2.join(archiveDir, project);
      const stat = fs2.statSync(projectPath);
      if (!stat.isDirectory()) continue;
      const files = findJsonlFiles(projectPath, excludedDirSet);
      for (const file of files) {
        totalChecked++;
        if (totalChecked % 100 === 0) {
          console.log(`  Checked ${totalChecked} conversations...`);
        }
        const conversationPath = path2.join(projectPath, file);
        foundFiles.add(conversationPath);
        if (shouldSkipConversation(conversationPath)) {
          continue;
        }
        const summaryPath = conversationPath.replace(".jsonl", "-summary.txt");
        if (!fs2.existsSync(summaryPath)) {
          result.missing.push({ path: conversationPath, reason: "No summary file" });
          continue;
        }
        if (isErroredSentinel(fs2.readFileSync(summaryPath, "utf-8"))) {
          result.missing.push({
            path: conversationPath,
            reason: "Previous summarization failed (error sentinel)"
          });
          continue;
        }
        const lastIndexed = getFileLastIndexed(db, conversationPath);
        if (lastIndexed !== null) {
          const fileStat = fs2.statSync(conversationPath);
          if (fileStat.mtimeMs > lastIndexed) {
            result.outdated.push({
              path: conversationPath,
              fileTime: fileStat.mtimeMs,
              dbTime: lastIndexed
            });
          }
        }
        try {
          await parseConversation(conversationPath, project, conversationPath);
        } catch (error) {
          result.corrupted.push({
            path: conversationPath,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    }
    console.log(`Verified ${totalChecked} conversations.`);
    const dbExchanges = getAllExchanges(db);
    for (const exchange of dbExchanges) {
      if (!foundFiles.has(exchange.archivePath)) {
        result.orphaned.push({
          uuid: exchange.id,
          path: exchange.archivePath
        });
      }
    }
    return result;
  } finally {
    db.close();
  }
}
async function repairIndex(issues, options = {}) {
  console.log("Repairing index...");
  const { initDatabase: initDatabase2, insertExchange: insertExchange2, deleteExchange } = await import("./db-SNCDV7GU.js");
  const { parseConversation: parseConversation2 } = await import("./parser-OZTBPBQF.js");
  const { initEmbeddings: initEmbeddings2, generateExchangeEmbedding: generateExchangeEmbedding2 } = await import("./embeddings-MIYVCACC.js");
  const { summarizeConversation: summarizeConversation2 } = await import("./summarizer-JX2L5D3P.js");
  const { formatErrorSentinel: formatErrorSentinel2 } = await import("./summary-sentinel-SZIFJFYT.js");
  const db = initDatabase2();
  await initEmbeddings2();
  for (const orphan of issues.orphaned) {
    console.log(`Removing orphaned entry: ${orphan.uuid}`);
    deleteExchange(db, orphan.uuid);
  }
  const toReindex = [...issues.missing.map((m) => m.path), ...issues.outdated.map((o) => o.path)];
  for (const conversationPath of toReindex) {
    if (shouldSkipConversation(conversationPath)) {
      console.log(`Skipping DO-NOT-INDEX conversation: ${conversationPath}`);
      continue;
    }
    console.log(`Re-indexing: ${conversationPath}`);
    try {
      const archiveDir = getArchiveDir();
      const relativePath = conversationPath.replace(archiveDir + path2.sep, "");
      const project = relativePath.split(path2.sep)[0] ?? "unknown";
      const exchanges = await parseConversation2(conversationPath, project, conversationPath);
      if (exchanges.length === 0) {
        console.log(`  Skipped (no exchanges)`);
        continue;
      }
      const summaryPath = conversationPath.replace(".jsonl", "-summary.txt");
      if (options.noSummaries) {
        console.log("  Skipping summary (--no-summaries)");
      } else {
        try {
          const summary = await summarizeConversation2(exchanges);
          fs2.writeFileSync(summaryPath, summary, "utf-8");
          console.log(`  Created summary: ${summary.split(/\s+/).length} words`);
        } catch (error) {
          try {
            fs2.writeFileSync(summaryPath, formatErrorSentinel2(error), "utf-8");
          } catch {
          }
          console.log(
            `  Summary failed, continuing with index: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
      for (const exchange of exchanges) {
        const toolNames = exchange.toolCalls?.map((tc) => tc.toolName);
        const embedding = await generateExchangeEmbedding2(
          exchange.userMessage,
          exchange.assistantMessage,
          toolNames
        );
        insertExchange2(db, exchange, embedding, toolNames);
      }
      console.log(`  Indexed ${exchanges.length} exchanges`);
    } catch (error) {
      console.error(`Failed to re-index ${conversationPath}:`, error);
    }
  }
  db.close();
  if (issues.corrupted.length > 0) {
    console.log("\n\u26A0\uFE0F  Corrupted files (manual review needed):");
    for (const c of issues.corrupted) {
      console.log(`  ${c.path}: ${c.error}`);
    }
  }
  console.log("\u2705 Repair complete.");
}

// src/index-cli.ts
var HELP = `
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
function getConcurrency(args) {
  const idx = args.findIndex((arg) => arg === "--concurrency" || arg === "-c");
  if (idx !== -1) {
    const raw = args[idx + 1];
    if (raw) {
      const value = Number.parseInt(raw, 10);
      if (value >= 1 && value <= 16) return value;
    }
  }
  return 1;
}
function askConfirmation(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "yes");
    });
  });
}
async function runIndex(args) {
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
    const total = issues.missing.length + issues.orphaned.length + issues.outdated.length + issues.corrupted.length;
    if (total > 0) {
      console.log("\nRun with --repair to fix these issues.");
      return 1;
    }
    console.log("\n\u2705 Index is healthy!");
    return 0;
  }
  if (command === "--repair") {
    console.log("Verifying conversation index...");
    const issues = await verifyIndex();
    if (issues.missing.length + issues.orphaned.length + issues.outdated.length > 0) {
      await repairIndex(issues, { noSummaries });
    } else {
      console.log("\u2705 No issues to repair!");
    }
    return 0;
  }
  if (command === "--rebuild") {
    console.log("\u26A0\uFE0F  This will DELETE the entire database and re-index everything.");
    if (!args.includes("--yes") && !await askConfirmation("Are you sure? [yes/NO]: ")) {
      console.log("Cancelled");
      return 0;
    }
    console.log("Rebuilding entire index...");
    const dbPath = getDbPath();
    if (fs3.existsSync(dbPath)) {
      fs3.unlinkSync(dbPath);
      console.log("Deleted existing database");
    }
    const archiveDir = getArchiveDir();
    if (fs3.existsSync(archiveDir)) {
      for (const project of fs3.readdirSync(archiveDir)) {
        const projectPath = path3.join(archiveDir, project);
        if (!fs3.statSync(projectPath).isDirectory()) continue;
        const summaries = fs3.readdirSync(projectPath).filter((f) => f.endsWith("-summary.txt"));
        for (const summary of summaries) {
          fs3.unlinkSync(path3.join(projectPath, summary));
        }
      }
      console.log("Deleted all summary files");
    }
    console.log("Re-indexing all conversations...");
    await indexConversations(void 0, void 0, concurrency, noSummaries);
    console.log("Re-indexing the journal...");
    const journalDb = initDatabase();
    try {
      const journal = await new JournalStore().indexJournal(journalDb);
      console.log(
        `\u2705 Journal re-indexed: ${journal.indexed} indexed, ${journal.failed} failed, ${journal.total} entries on disk`
      );
    } catch (error) {
      console.error(
        `\u26A0\uFE0F  Journal re-index failed: ${error instanceof Error ? error.message : String(error)}`
      );
      console.error("    Run `moe-memory journal index` to retry. Your entries are safe on disk.");
    } finally {
      journalDb.close();
    }
    return 0;
  }
  await indexConversations(void 0, void 0, concurrency, noSummaries);
  return 0;
}
export {
  runIndex
};
