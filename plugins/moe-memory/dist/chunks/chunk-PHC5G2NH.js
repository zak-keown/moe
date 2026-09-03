// @generated — do not edit; see scripts/build-runtime.mjs
import { createRequire as __createRequire } from 'module';
const require = __createRequire(import.meta.url);
import {
  findJsonlFiles,
  getExcludedProjects
} from "./chunk-YFLZKW2J.js";
import {
  SUMMARIZER_CONTEXT_MARKER
} from "./chunk-NH4NDHAK.js";
import {
  formatErrorSentinel,
  shouldQueueForSummary
} from "./chunk-YAXDOI5O.js";

// src/sync.ts
import fs from "node:fs";
import path from "node:path";
var EXCLUSION_MARKER = "<INSTRUCTIONS-TO-MOE-MEMORY>DO NOT INDEX THIS CHAT</INSTRUCTIONS-TO-MOE-MEMORY>";
var LEGACY_EXCLUSION_MARKER = "<INSTRUCTIONS-TO-EPISODIC-MEMORY>DO NOT INDEX THIS CHAT</INSTRUCTIONS-TO-EPISODIC-MEMORY>";
var EXCLUSION_MARKERS = [
  EXCLUSION_MARKER,
  LEGACY_EXCLUSION_MARKER,
  "Only use NO_INSIGHTS_FOUND",
  SUMMARIZER_CONTEXT_MARKER
];
function shouldSkipConversation(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return EXCLUSION_MARKERS.some((marker) => content.includes(marker));
  } catch {
    return false;
  }
}
function copyIfNewer(src, dest) {
  const destDir = path.dirname(dest);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  if (fs.existsSync(dest)) {
    const srcStat = fs.statSync(src);
    const destStat = fs.statSync(dest);
    if (destStat.mtimeMs >= srcStat.mtimeMs) {
      return false;
    }
  }
  const tempDest = `${dest}.tmp.${process.pid}`;
  fs.copyFileSync(src, tempDest);
  fs.renameSync(tempDest, dest);
  return true;
}
function extractSessionIdFromPath(filePath) {
  const basename = path.basename(filePath, ".jsonl");
  const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
  const matches = basename.match(uuidPattern);
  return matches?.[matches.length - 1] ?? null;
}
async function syncConversations(sourceDir, destDir, options = {}) {
  const result = {
    copied: 0,
    skipped: 0,
    indexed: 0,
    summarized: 0,
    errors: []
  };
  if (!fs.existsSync(sourceDir)) {
    return result;
  }
  const filesToIndex = [];
  const filesToSummarize = [];
  const projects = fs.readdirSync(sourceDir);
  const excludedProjects = getExcludedProjects();
  const excludedDirSet = new Set(excludedProjects);
  for (const project of projects) {
    if (excludedProjects.includes(project)) {
      console.log(`
Skipping excluded project: ${project}`);
      continue;
    }
    const projectPath = path.join(sourceDir, project);
    const stat = fs.statSync(projectPath);
    if (!stat.isDirectory()) continue;
    const files = findJsonlFiles(projectPath, excludedDirSet);
    for (const file of files) {
      const srcFile = path.join(projectPath, file);
      const destFile = path.join(destDir, project, file);
      try {
        const wasCopied = copyIfNewer(srcFile, destFile);
        if (wasCopied) {
          result.copied++;
          filesToIndex.push(destFile);
        } else {
          result.skipped++;
        }
        if (!options.skipSummaries) {
          const summaryPath = destFile.replace(".jsonl", "-summary.txt");
          if (shouldQueueForSummary(summaryPath) && !shouldSkipConversation(destFile)) {
            const sessionId = extractSessionIdFromPath(destFile);
            if (sessionId) {
              filesToSummarize.push({ path: destFile, sessionId });
            }
          }
        }
      } catch (error) {
        result.errors.push({
          file: srcFile,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }
  if (!options.skipIndex && filesToIndex.length > 0) {
    const { initDatabase, insertExchange } = await import("./db-MUTYZPUC.js");
    const { initEmbeddings, generateExchangeEmbedding } = await import("./embeddings-5HWUD4V3.js");
    const { parseConversation } = await import("./parser-OZTBPBQF.js");
    const db = initDatabase();
    let embeddingsReady = false;
    try {
      await initEmbeddings();
      embeddingsReady = true;
    } catch {
      console.error("moe-memory: embedding model unavailable; text will be stored without vectors");
    }
    for (const file of filesToIndex) {
      try {
        if (shouldSkipConversation(file)) {
          continue;
        }
        const project = path.basename(path.dirname(file));
        const exchanges = await parseConversation(file, project, file);
        for (const exchange of exchanges) {
          const toolNames = exchange.toolCalls?.map((tc) => tc.toolName);
          let embedding = null;
          if (embeddingsReady) {
            try {
              embedding = await generateExchangeEmbedding(
                exchange.userMessage,
                exchange.assistantMessage,
                toolNames
              );
            } catch {
            }
          }
          insertExchange(db, exchange, embedding, toolNames);
        }
        result.indexed++;
      } catch (error) {
        result.errors.push({
          file,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    db.close();
  }
  if (!options.skipSummaries && filesToSummarize.length > 0) {
    const { parseConversation } = await import("./parser-OZTBPBQF.js");
    const { summarizeConversation } = await import("./summarizer-BEQGKIDK.js");
    const summaryLimit = options.summaryLimit ?? 10;
    const toSummarize = filesToSummarize.slice(0, summaryLimit);
    const remaining = filesToSummarize.length - toSummarize.length;
    console.log(`Generating summaries for ${toSummarize.length} conversation(s)...`);
    if (remaining > 0) {
      console.log(`  (${remaining} more need summaries - will process on next sync)`);
    }
    for (const { path: filePath, sessionId } of toSummarize) {
      try {
        const project = path.basename(path.dirname(filePath));
        const exchanges = await parseConversation(filePath, project, filePath);
        if (exchanges.length === 0) {
          const summaryPath2 = filePath.replace(".jsonl", "-summary.txt");
          fs.writeFileSync(summaryPath2, "", "utf-8");
          continue;
        }
        console.log(`  Summarizing ${path.basename(filePath)} (${exchanges.length} exchanges)...`);
        const summary = await summarizeConversation(exchanges, sessionId);
        const summaryPath = filePath.replace(".jsonl", "-summary.txt");
        fs.writeFileSync(summaryPath, summary, "utf-8");
        result.summarized++;
      } catch (error) {
        try {
          const summaryPath = filePath.replace(".jsonl", "-summary.txt");
          fs.writeFileSync(summaryPath, formatErrorSentinel(error), "utf-8");
        } catch {
        }
        result.errors.push({
          file: filePath,
          error: `Summary generation failed: ${error instanceof Error ? error.message : String(error)}`
        });
      }
    }
  }
  return result;
}

export {
  shouldSkipConversation,
  syncConversations
};
