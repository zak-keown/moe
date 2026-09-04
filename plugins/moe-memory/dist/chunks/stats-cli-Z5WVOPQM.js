// @generated — do not edit; see scripts/build-runtime.mjs
import { createRequire as __createRequire } from 'module';
const require = __createRequire(import.meta.url);
import {
  countJournalEntries,
  initDatabase
} from "./chunk-X4QDSJ7Q.js";
import {
  getDbPath
} from "./chunk-YFLZKW2J.js";
import "./chunk-OYWI4M6D.js";
import "./chunk-NH4NDHAK.js";
import "./chunk-XRZM5UX2.js";

// src/stats.ts
import { DatabaseSync } from "node:sqlite";
async function getIndexStats(dbPath) {
  const resolvedDbPath = dbPath || getDbPath();
  const fs = await import("node:fs");
  if (!fs.existsSync(resolvedDbPath)) {
    return {
      totalConversations: 0,
      conversationsWithSummaries: 0,
      conversationsWithoutSummaries: 0,
      totalExchanges: 0,
      projectCount: 0
    };
  }
  const db = new DatabaseSync(resolvedDbPath, { readOnly: true });
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    const hasExchanges = tables.some((t) => t.name === "exchanges");
    if (!hasExchanges) {
      return {
        totalConversations: 0,
        conversationsWithSummaries: 0,
        conversationsWithoutSummaries: 0,
        totalExchanges: 0,
        projectCount: 0
      };
    }
    const totalConversations = db.prepare("SELECT COUNT(DISTINCT archive_path) as count FROM exchanges").get();
    const { hasRealSummary } = await import("./summary-sentinel-SZIFJFYT.js");
    const conversationPaths = db.prepare("SELECT DISTINCT archive_path FROM exchanges").all();
    let withSummariesCount = 0;
    for (const { archive_path } of conversationPaths) {
      const summaryPath = archive_path.replace(".jsonl", "-summary.txt");
      if (hasRealSummary(summaryPath)) {
        withSummariesCount++;
      }
    }
    const totalExchanges = db.prepare("SELECT COUNT(*) as count FROM exchanges").get();
    const dateRange = db.prepare("SELECT MIN(timestamp) as earliest, MAX(timestamp) as latest FROM exchanges").get();
    const projectCount = db.prepare("SELECT COUNT(DISTINCT project) as count FROM exchanges").get();
    const topProjects = db.prepare(`
      SELECT project, COUNT(DISTINCT archive_path) as count
      FROM exchanges
      GROUP BY project
      ORDER BY count DESC
      LIMIT 10
    `).all();
    return {
      totalConversations: totalConversations.count,
      conversationsWithSummaries: withSummariesCount,
      conversationsWithoutSummaries: totalConversations.count - withSummariesCount,
      totalExchanges: totalExchanges.count,
      dateRange: dateRange?.earliest ? {
        earliest: dateRange.earliest,
        latest: dateRange.latest
      } : void 0,
      projectCount: projectCount.count,
      topProjects
    };
  } finally {
    db.close();
  }
}
function formatStats(stats) {
  let output = "Moe Memory Index Statistics\n";
  output += `${"=".repeat(50)}

`;
  output += `Total Conversations: ${stats.totalConversations.toLocaleString()}
`;
  output += `Total Exchanges: ${stats.totalExchanges.toLocaleString()}

`;
  output += `With Summaries: ${stats.conversationsWithSummaries.toLocaleString()}
`;
  output += `Without Summaries: ${stats.conversationsWithoutSummaries.toLocaleString()}
`;
  if (stats.conversationsWithoutSummaries > 0) {
    const percentage = (stats.conversationsWithoutSummaries / stats.totalConversations * 100).toFixed(1);
    output += `  (${percentage}% missing summaries)
`;
  }
  output += "\n";
  if (stats.dateRange) {
    output += `Date Range:
`;
    output += `  Earliest: ${new Date(stats.dateRange.earliest).toLocaleDateString()}
`;
    output += `  Latest: ${new Date(stats.dateRange.latest).toLocaleDateString()}

`;
  }
  output += `Unique Projects: ${stats.projectCount.toLocaleString()}

`;
  if (stats.topProjects && stats.topProjects.length > 0) {
    output += `Top Projects by Conversation Count:
`;
    for (const { project, count } of stats.topProjects) {
      const displayProject = project || "(unknown)";
      output += `  ${count.toString().padStart(4)} - ${displayProject}
`;
    }
  }
  return output;
}

// src/stats-cli.ts
var HELP = `
Usage: moe-memory stats

Display statistics about the index.

Shows:
- Total conversations and exchanges
- Conversations with/without AI summaries
- Date range coverage
- Project breakdown
- Top projects by conversation count
- Journal entries, by scope

EXAMPLES:
  # Show index statistics
  moe-memory stats
`;
async function runStats(args) {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(HELP);
    return 0;
  }
  try {
    const stats = await getIndexStats();
    let output = formatStats(stats);
    const db = initDatabase();
    try {
      const project = countJournalEntries(db, "project");
      const user = countJournalEntries(db, "user");
      output += `
Journal Entries: ${(project + user).toLocaleString()}
`;
      output += `  Project: ${project.toLocaleString()}
`;
      output += `  User:    ${user.toLocaleString()}
`;
    } finally {
      db.close();
    }
    console.log(output);
    return 0;
  } catch (error) {
    console.error("Error getting stats:", error);
    return 1;
  }
}
export {
  runStats
};
