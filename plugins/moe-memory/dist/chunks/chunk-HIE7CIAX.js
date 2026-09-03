// @generated — do not edit; see scripts/build-runtime.mjs
import { createRequire as __createRequire } from 'module';
const require = __createRequire(import.meta.url);
import {
  generateQueryEmbedding,
  initEmbeddings
} from "./chunk-QGTMUDP7.js";
import {
  initDatabase
} from "./chunk-LUAEQ7DI.js";
import {
  isErroredSentinel
} from "./chunk-YAXDOI5O.js";

// src/vector-readiness.ts
function assessVectorReadiness(db) {
  const exchangeTotal = db.prepare("SELECT COUNT(*) AS c FROM exchanges").get().c;
  const journalTotal = db.prepare("SELECT COUNT(*) AS c FROM journal_entries").get().c;
  const total = exchangeTotal + journalTotal;
  const exchangePending = db.prepare("SELECT COUNT(*) AS c FROM exchanges WHERE embedding_version < 3").get().c;
  const journalPending = db.prepare("SELECT COUNT(*) AS c FROM journal_entries WHERE embedding_version < 3").get().c;
  const remaining = exchangePending + journalPending;
  const futureExchanges = db.prepare("SELECT COUNT(*) AS c FROM exchanges WHERE embedding_version > 3").get().c;
  const futureJournals = db.prepare("SELECT COUNT(*) AS c FROM journal_entries WHERE embedding_version > 3").get().c;
  if (futureExchanges > 0 || futureJournals > 0) {
    return {
      state: "blocked",
      reason: "Database contains records with embedding version > 3 (from a newer runtime)",
      total,
      remaining,
      fromVersion: 2,
      toVersion: 3
    };
  }
  if (remaining === 0) {
    return { state: "ready", total, remaining: 0, fromVersion: 2, toVersion: 3 };
  }
  return { state: "upgrading", total, remaining, fromVersion: 2, toVersion: 3 };
}
function isVectorQueryAuthorized(db) {
  const readiness = assessVectorReadiness(db);
  return readiness.state === "ready";
}
function vectorReadinessMessage(readiness) {
  switch (readiness.state) {
    case "ready":
      return `Vector search ready (${readiness.total} records at version 3)`;
    case "upgrading":
      return `Vector search upgrading: ${readiness.remaining}/${readiness.total} records remaining`;
    case "blocked":
      return `Vector search blocked: ${readiness.reason}`;
  }
}

// src/search.ts
import fs from "node:fs";
import readline from "node:readline";
function buildSearchFilters(options) {
  const parts = [];
  const params = [];
  if (options.after) {
    parts.push("e.timestamp >= ?");
    params.push(options.after);
  }
  if (options.before) {
    parts.push("e.timestamp <= ?");
    params.push(options.before);
  }
  if (options.project) {
    parts.push("e.project = ?");
    params.push(options.project);
  }
  if (options.session_id) {
    parts.push("e.session_id = ?");
    params.push(options.session_id);
  }
  if (options.git_branch) {
    parts.push("e.git_branch = ?");
    params.push(options.git_branch);
  }
  if (options.git_commit) {
    parts.push("e.git_commit = ?");
    params.push(options.git_commit);
  }
  return {
    sql: parts.length ? `AND ${parts.join(" AND ")}` : "",
    params
  };
}
function hasMetadataFilters(options) {
  return Boolean(
    options.project || options.session_id || options.git_branch || options.git_commit || options.after || options.before
  );
}
var EXCHANGE_SELECT_COLUMNS = `
        e.id,
        e.project,
        e.timestamp,
        e.user_message,
        e.assistant_message,
        e.archive_path,
        e.line_start,
        e.line_end,
        e.parent_uuid,
        e.is_sidechain,
        e.harness,
        e.session_id,
        e.cwd,
        e.git_branch,
        e.git_commit,
        e.claude_version,
        e.agent_version,
        e.model,
        e.model_provider,
        e.thinking_level,
        e.thinking_disabled,
        e.thinking_triggers`;
function exchangeFromRow(row) {
  return {
    id: row.id,
    project: row.project,
    timestamp: row.timestamp,
    userMessage: row.user_message,
    assistantMessage: row.assistant_message,
    archivePath: row.archive_path,
    lineStart: row.line_start,
    lineEnd: row.line_end,
    parentUuid: row.parent_uuid || void 0,
    isSidechain: Boolean(row.is_sidechain),
    harness: row.harness === "codex" ? "codex" : "claude",
    sessionId: row.session_id || void 0,
    cwd: row.cwd || void 0,
    gitBranch: row.git_branch || void 0,
    gitCommit: row.git_commit || void 0,
    claudeVersion: row.claude_version || void 0,
    agentVersion: row.agent_version || void 0,
    model: row.model || void 0,
    modelProvider: row.model_provider || void 0,
    thinkingLevel: row.thinking_level || void 0,
    thinkingDisabled: row.thinking_disabled === null ? void 0 : Boolean(row.thinking_disabled),
    thinkingTriggers: row.thinking_triggers || void 0
  };
}
function l2DistanceToCosineSimilarity(distance) {
  const similarity = 1 - distance * distance / 2;
  return Math.max(-1, Math.min(1, similarity));
}
function validateISODate(dateStr, paramName) {
  const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!isoDateRegex.test(dateStr)) {
    throw new Error(
      `Invalid ${paramName} date: "${dateStr}". Expected YYYY-MM-DD format (e.g., 2025-10-01)`
    );
  }
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ${paramName} date: "${dateStr}". Not a valid calendar date.`);
  }
}
async function searchConversations(query, options = {}) {
  const { limit = 10, mode = "both", after, before } = options;
  if (after) validateISODate(after, "--after");
  if (before) validateISODate(before, "--before");
  const db = initDatabase();
  let results = [];
  const { sql: filterClause, params: filterParams } = buildSearchFilters(options);
  if (mode === "vector" || mode === "both") {
    if (!isVectorQueryAuthorized(db)) {
      if (mode === "vector") {
        db.close();
        return [];
      }
    } else {
      await initEmbeddings();
      const queryEmbedding = await generateQueryEmbedding(query);
      const k = hasMetadataFilters(options) ? limit * 3 : limit;
      const stmt = db.prepare(`
        SELECT
          ${EXCHANGE_SELECT_COLUMNS},
          vec.distance
        FROM vec_exchanges AS vec
        JOIN exchanges AS e ON vec.id = e.id
        WHERE vec.embedding MATCH ?
          AND k = ?
          AND e.is_sidechain = 0
          AND e.embedding_version = 3
          ${filterClause}
        ORDER BY vec.distance ASC
      `);
      results = stmt.all(
        new Uint8Array(new Float32Array(queryEmbedding).buffer),
        k,
        ...filterParams
      );
      if (results.length > limit) {
        results = results.slice(0, limit);
      }
    }
  }
  if (mode === "text" || mode === "both") {
    const textStmt = db.prepare(`
      SELECT
        ${EXCHANGE_SELECT_COLUMNS},
        NULL as distance
      FROM exchanges AS e
      WHERE (e.user_message LIKE ? OR e.assistant_message LIKE ?)
        AND e.is_sidechain = 0
        ${filterClause}
      ORDER BY e.timestamp DESC
      LIMIT ?
    `);
    const textResults = textStmt.all(
      `%${query}%`,
      `%${query}%`,
      ...filterParams,
      limit
    );
    if (mode === "both") {
      const seenIds = new Set(results.map((r) => r.id));
      for (const textResult of textResults) {
        if (!seenIds.has(textResult.id)) {
          results.push(textResult);
        }
      }
    } else {
      results = textResults;
    }
  }
  db.close();
  return results.map((row) => {
    const exchange = exchangeFromRow(row);
    const summaryPath = row.archive_path.replace(".jsonl", "-summary.txt");
    let summary;
    if (fs.existsSync(summaryPath)) {
      const raw = fs.readFileSync(summaryPath, "utf-8");
      if (!isErroredSentinel(raw)) {
        summary = raw.trim();
      }
    }
    const snippetText = exchange.userMessage.substring(0, 200).replace(/\s+/g, " ").trim();
    const snippet = snippetText + (exchange.userMessage.length > 200 ? "..." : "");
    return {
      exchange,
      // CR-073: gate on whether THIS ROW carries a real vector distance, not
      // on the overall search mode. In `mode: "both"`, a hit that only the
      // LIKE query found (never returned by vec0's KNN) has `distance: null`
      // and must not be scored — the merge loop above pushes such rows into
      // the very same `results` array vector hits live in.
      similarity: row.distance === null ? void 0 : l2DistanceToCosineSimilarity(row.distance),
      snippet,
      summary
    };
  });
}
async function countLines(filePath) {
  try {
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Number.POSITIVE_INFINITY
    });
    let count = 0;
    for await (const line of rl) {
      if (line.trim()) count++;
    }
    return count;
  } catch {
    return 0;
  }
}
function getFileSizeInKB(filePath) {
  try {
    const stats = fs.statSync(filePath);
    return Math.round(stats.size / 1024 * 10) / 10;
  } catch {
    return 0;
  }
}
function isoDay(timestamp) {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return timestamp;
  return parsed.toISOString().slice(0, 10);
}
function toolSummaryLine(exchange) {
  if (!exchange.toolCalls || exchange.toolCalls.length === 0) return null;
  const toolCounts = /* @__PURE__ */ new Map();
  for (const tc of exchange.toolCalls) {
    toolCounts.set(tc.toolName, (toolCounts.get(tc.toolName) || 0) + 1);
  }
  return Array.from(toolCounts.entries()).map(([name, count]) => `${name}(${count})`).join(", ");
}
async function formatResults(results) {
  if (results.length === 0) {
    return "No results found.";
  }
  let output = `Found ${results.length} relevant conversation${results.length > 1 ? "s" : ""}:

`;
  let index = 0;
  for (const result of results) {
    index++;
    const date = isoDay(result.exchange.timestamp);
    const simPct = result.similarity !== void 0 ? Math.round(result.similarity * 100) : null;
    output += `${index}. [${result.exchange.project}, ${date}]`;
    if (simPct !== null) {
      output += ` - ${simPct}% match`;
    }
    output += "\n";
    if (result.summary && result.summary.length < 300) {
      output += `   ${result.summary}
`;
    }
    output += `   "${result.snippet}"
`;
    const tools = toolSummaryLine(result.exchange);
    if (tools) output += `   Tools: ${tools}
`;
    const fileSizeKB = getFileSizeInKB(result.exchange.archivePath);
    const totalLines = await countLines(result.exchange.archivePath);
    const lineRange = `${result.exchange.lineStart}-${result.exchange.lineEnd}`;
    output += `   Lines ${lineRange} in ${result.exchange.archivePath} (${fileSizeKB}KB, ${totalLines} lines)

`;
  }
  return output;
}
async function searchMultipleConcepts(concepts, options = {}) {
  const { limit = 10 } = options;
  if (concepts.length === 0) {
    return [];
  }
  const conceptResults = await Promise.all(
    concepts.map(
      (concept) => searchConversations(concept, { ...options, limit: limit * 5, mode: "vector" })
    )
  );
  const conversationMap = /* @__PURE__ */ new Map();
  conceptResults.forEach((results, conceptIndex) => {
    for (const result of results) {
      const key = result.exchange.archivePath;
      const bucket = conversationMap.get(key);
      if (bucket) {
        bucket.push({ ...result, conceptIndex });
      } else {
        conversationMap.set(key, [{ ...result, conceptIndex }]);
      }
    }
  });
  const multiConceptResults = [];
  for (const results of conversationMap.values()) {
    const representedConcepts = new Set(results.map((r) => r.conceptIndex));
    if (representedConcepts.size !== concepts.length) continue;
    const conceptSimilarities = concepts.map((_concept, index) => {
      const result = results.find((r) => r.conceptIndex === index);
      return result?.similarity ?? 0;
    });
    const averageSimilarity = conceptSimilarities.reduce((sum, sim) => sum + sim, 0) / conceptSimilarities.length;
    const firstResult = results[0];
    if (!firstResult) continue;
    multiConceptResults.push({
      exchange: firstResult.exchange,
      snippet: firstResult.snippet,
      conceptSimilarities,
      averageSimilarity
    });
  }
  multiConceptResults.sort((a, b) => b.averageSimilarity - a.averageSimilarity);
  return multiConceptResults.slice(0, limit);
}
async function formatMultiConceptResults(results, concepts) {
  if (results.length === 0) {
    return `No conversations found matching all concepts: ${concepts.join(", ")}`;
  }
  let output = `Found ${results.length} conversation${results.length > 1 ? "s" : ""} matching all concepts [${concepts.join(" + ")}]:

`;
  let index = 0;
  for (const result of results) {
    index++;
    const date = isoDay(result.exchange.timestamp);
    const avgPct = Math.round(result.averageSimilarity * 100);
    output += `${index}. [${result.exchange.project}, ${date}] - ${avgPct}% avg match
`;
    const scores = result.conceptSimilarities.map((sim, i) => `${concepts[i] ?? `concept ${i + 1}`}: ${Math.round(sim * 100)}%`).join(", ");
    output += `   Concepts: ${scores}
`;
    output += `   "${result.snippet}"
`;
    const tools = toolSummaryLine(result.exchange);
    if (tools) output += `   Tools: ${tools}
`;
    const fileSizeKB = getFileSizeInKB(result.exchange.archivePath);
    const totalLines = await countLines(result.exchange.archivePath);
    const lineRange = `${result.exchange.lineStart}-${result.exchange.lineEnd}`;
    output += `   Lines ${lineRange} in ${result.exchange.archivePath} (${fileSizeKB}KB, ${totalLines} lines)

`;
  }
  return output;
}

export {
  assessVectorReadiness,
  isVectorQueryAuthorized,
  vectorReadinessMessage,
  l2DistanceToCosineSimilarity,
  searchConversations,
  formatResults,
  searchMultipleConcepts,
  formatMultiConceptResults
};
