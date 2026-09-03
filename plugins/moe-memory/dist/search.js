/**
 * Conversation-exchange retrieval: sqlite-vec KNN, SQL LIKE, or both.
 *
 * This is the implementation that WON the reconciliation. private-journal-mcp's
 * `search.ts` scanned every `.embedding` JSON sidecar into memory and scored it
 * in JS; journal entries now get rows in the same store and are queried through
 * journal/search.ts, which reuses `l2DistanceToCosineSimilarity` from here.
 */
import fs from "node:fs";
import readline from "node:readline";
import { initDatabase } from "./db.js";
import { generateQueryEmbedding, initEmbeddings } from "./embeddings.js";
import { isErroredSentinel } from "./summary-sentinel.js";
/**
 * Build the AND-clause and bound-parameter list that constrains a search
 * by the optional time and metadata filters. Bound parameters keep us
 * safe from SQL injection without regex-based input scrubbing.
 */
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
        params,
    };
}
/**
 * True when any filter in `buildSearchFilters` will add a WHERE predicate.
 *
 * vec0 applies its KNN `k` limit BEFORE that WHERE clause runs, so when a
 * filter is active the vector query has to over-fetch candidates and trim
 * afterwards (CR-074) — otherwise a date window (or any other filter) can
 * discard every one of the `k` nearest neighbours and return nothing even
 * though rows matching both the query and the window exist. `after`/`before`
 * were missing here even though `buildSearchFilters` has always emitted
 * `e.timestamp >= ?` / `<= ?` for them.
 */
function hasMetadataFilters(options) {
    return Boolean(options.project || options.session_id || options.git_branch || options.git_commit || options.after || options.before);
}
const EXCHANGE_SELECT_COLUMNS = `
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
        parentUuid: row.parent_uuid || undefined,
        isSidechain: Boolean(row.is_sidechain),
        harness: row.harness === "codex" ? "codex" : "claude",
        sessionId: row.session_id || undefined,
        cwd: row.cwd || undefined,
        gitBranch: row.git_branch || undefined,
        gitCommit: row.git_commit || undefined,
        claudeVersion: row.claude_version || undefined,
        agentVersion: row.agent_version || undefined,
        model: row.model || undefined,
        modelProvider: row.model_provider || undefined,
        thinkingLevel: row.thinking_level || undefined,
        thinkingDisabled: row.thinking_disabled === null ? undefined : Boolean(row.thinking_disabled),
        thinkingTriggers: row.thinking_triggers || undefined,
    };
}
/**
 * Convert an L2 (Euclidean) distance between two unit-normalized vectors
 * into a cosine similarity in [-1, 1].
 *
 * For unit vectors u, v:  ||u - v||^2 = 2 - 2 * cos(u, v)
 * Therefore:               cos(u, v) = 1 - d^2 / 2
 *
 * ⚠️ Valid ONLY because src/embeddings.ts passes `normalize: true`. That coupling
 * is invisible to the compiler: flip normalisation and every score here is
 * silently wrong with no type error and no exception. Both record types share the
 * encoder, so both share this constraint — journal/search.ts calls this function.
 */
export function l2DistanceToCosineSimilarity(distance) {
    const similarity = 1 - (distance * distance) / 2;
    return Math.max(-1, Math.min(1, similarity));
}
function validateISODate(dateStr, paramName) {
    const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!isoDateRegex.test(dateStr)) {
        throw new Error(`Invalid ${paramName} date: "${dateStr}". Expected YYYY-MM-DD format (e.g., 2025-10-01)`);
    }
    // Verify it's actually a valid date
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) {
        throw new Error(`Invalid ${paramName} date: "${dateStr}". Not a valid calendar date.`);
    }
}
export async function searchConversations(query, options = {}) {
    const { limit = 10, mode = "both", after, before } = options;
    // Validate date parameters
    if (after)
        validateISODate(after, "--after");
    if (before)
        validateISODate(before, "--before");
    const db = initDatabase();
    let results = [];
    const { sql: filterClause, params: filterParams } = buildSearchFilters(options);
    if (mode === "vector" || mode === "both") {
        // Vector similarity search.
        // vec0 applies KNN before WHERE, so when extra metadata filters are
        // active we ask for more candidates than `limit` and trim afterwards.
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
        ${filterClause}
      ORDER BY vec.distance ASC
    `);
        results = stmt.all(Buffer.from(new Float32Array(queryEmbedding).buffer), k, ...filterParams);
        if (results.length > limit) {
            results = results.slice(0, limit);
        }
    }
    if (mode === "text" || mode === "both") {
        // Text search
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
        const textResults = textStmt.all(`%${query}%`, `%${query}%`, ...filterParams, limit);
        if (mode === "both") {
            // Merge and deduplicate by ID
            const seenIds = new Set(results.map((r) => r.id));
            for (const textResult of textResults) {
                if (!seenIds.has(textResult.id)) {
                    results.push(textResult);
                }
            }
        }
        else {
            results = textResults;
        }
    }
    db.close();
    return results.map((row) => {
        const exchange = exchangeFromRow(row);
        // Try to load summary if available. Skip error sentinels (#96) so failed
        // summarizations don't surface as the conversation's summary in results.
        const summaryPath = row.archive_path.replace(".jsonl", "-summary.txt");
        let summary;
        if (fs.existsSync(summaryPath)) {
            const raw = fs.readFileSync(summaryPath, "utf-8");
            if (!isErroredSentinel(raw)) {
                summary = raw.trim();
            }
        }
        // Create snippet (first 200 chars, collapse newlines)
        const snippetText = exchange.userMessage.substring(0, 200).replace(/\s+/g, " ").trim();
        const snippet = snippetText + (exchange.userMessage.length > 200 ? "..." : "");
        return {
            exchange,
            // CR-073: gate on whether THIS ROW carries a real vector distance, not
            // on the overall search mode. In `mode: "both"`, a hit that only the
            // LIKE query found (never returned by vec0's KNN) has `distance: null`
            // and must not be scored — the merge loop above pushes such rows into
            // the very same `results` array vector hits live in.
            similarity: row.distance === null ? undefined : l2DistanceToCosineSimilarity(row.distance),
            snippet,
            summary,
        };
    });
}
// Helper function to count lines in a file efficiently
async function countLines(filePath) {
    try {
        const fileStream = fs.createReadStream(filePath);
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Number.POSITIVE_INFINITY,
        });
        let count = 0;
        for await (const line of rl) {
            if (line.trim())
                count++;
        }
        return count;
    }
    catch {
        return 0; // Return 0 if file can't be read
    }
}
// Helper function to get file size in KB
function getFileSizeInKB(filePath) {
    try {
        const stats = fs.statSync(filePath);
        return Math.round((stats.size / 1024) * 10) / 10; // Round to 1 decimal place
    }
    catch {
        return 0;
    }
}
function isoDay(timestamp) {
    const parsed = new Date(timestamp);
    if (Number.isNaN(parsed.getTime()))
        return timestamp;
    return parsed.toISOString().slice(0, 10);
}
function toolSummaryLine(exchange) {
    if (!exchange.toolCalls || exchange.toolCalls.length === 0)
        return null;
    const toolCounts = new Map();
    for (const tc of exchange.toolCalls) {
        toolCounts.set(tc.toolName, (toolCounts.get(tc.toolName) || 0) + 1);
    }
    return Array.from(toolCounts.entries())
        .map(([name, count]) => `${name}(${count})`)
        .join(", ");
}
export async function formatResults(results) {
    if (results.length === 0) {
        return "No results found.";
    }
    let output = `Found ${results.length} relevant conversation${results.length > 1 ? "s" : ""}:\n\n`;
    // Process results sequentially to get file metadata
    let index = 0;
    for (const result of results) {
        index++;
        const date = isoDay(result.exchange.timestamp);
        const simPct = result.similarity !== undefined ? Math.round(result.similarity * 100) : null;
        // Header with match percentage
        output += `${index}. [${result.exchange.project}, ${date}]`;
        if (simPct !== null) {
            output += ` - ${simPct}% match`;
        }
        output += "\n";
        // Show summary only if it's concise (< 300 chars)
        if (result.summary && result.summary.length < 300) {
            output += `   ${result.summary}\n`;
        }
        // Show snippet
        output += `   "${result.snippet}"\n`;
        const tools = toolSummaryLine(result.exchange);
        if (tools)
            output += `   Tools: ${tools}\n`;
        // Get file metadata
        const fileSizeKB = getFileSizeInKB(result.exchange.archivePath);
        const totalLines = await countLines(result.exchange.archivePath);
        const lineRange = `${result.exchange.lineStart}-${result.exchange.lineEnd}`;
        // File information with metadata (clean format for smart tool selection)
        output += `   Lines ${lineRange} in ${result.exchange.archivePath} (${fileSizeKB}KB, ${totalLines} lines)\n\n`;
    }
    return output;
}
export async function searchMultipleConcepts(concepts, options = {}) {
    const { limit = 10 } = options;
    if (concepts.length === 0) {
        return [];
    }
    // Search for each concept independently
    const conceptResults = await Promise.all(concepts.map((concept) => searchConversations(concept, { ...options, limit: limit * 5, mode: "vector" })));
    // Build map of conversation path -> array of results (one per concept)
    const conversationMap = new Map();
    conceptResults.forEach((results, conceptIndex) => {
        for (const result of results) {
            const key = result.exchange.archivePath;
            const bucket = conversationMap.get(key);
            if (bucket) {
                bucket.push({ ...result, conceptIndex });
            }
            else {
                conversationMap.set(key, [{ ...result, conceptIndex }]);
            }
        }
    });
    // Find conversations that match ALL concepts
    const multiConceptResults = [];
    for (const results of conversationMap.values()) {
        // Check if all concepts are represented
        const representedConcepts = new Set(results.map((r) => r.conceptIndex));
        if (representedConcepts.size !== concepts.length)
            continue;
        const conceptSimilarities = concepts.map((_concept, index) => {
            const result = results.find((r) => r.conceptIndex === index);
            return result?.similarity ?? 0;
        });
        const averageSimilarity = conceptSimilarities.reduce((sum, sim) => sum + sim, 0) / conceptSimilarities.length;
        // Use the first result's exchange data (they're all from the same conversation)
        const firstResult = results[0];
        if (!firstResult)
            continue;
        multiConceptResults.push({
            exchange: firstResult.exchange,
            snippet: firstResult.snippet,
            conceptSimilarities,
            averageSimilarity,
        });
    }
    // Sort by average similarity (highest first)
    multiConceptResults.sort((a, b) => b.averageSimilarity - a.averageSimilarity);
    // Apply limit
    return multiConceptResults.slice(0, limit);
}
export async function formatMultiConceptResults(results, concepts) {
    if (results.length === 0) {
        return `No conversations found matching all concepts: ${concepts.join(", ")}`;
    }
    let output = `Found ${results.length} conversation${results.length > 1 ? "s" : ""} matching all concepts [${concepts.join(" + ")}]:\n\n`;
    // Process results sequentially to get file metadata
    let index = 0;
    for (const result of results) {
        index++;
        const date = isoDay(result.exchange.timestamp);
        const avgPct = Math.round(result.averageSimilarity * 100);
        // Header with average match percentage
        output += `${index}. [${result.exchange.project}, ${date}] - ${avgPct}% avg match\n`;
        // Show individual concept scores
        const scores = result.conceptSimilarities
            .map((sim, i) => `${concepts[i] ?? `concept ${i + 1}`}: ${Math.round(sim * 100)}%`)
            .join(", ");
        output += `   Concepts: ${scores}\n`;
        // Show snippet
        output += `   "${result.snippet}"\n`;
        const tools = toolSummaryLine(result.exchange);
        if (tools)
            output += `   Tools: ${tools}\n`;
        // Get file metadata
        const fileSizeKB = getFileSizeInKB(result.exchange.archivePath);
        const totalLines = await countLines(result.exchange.archivePath);
        const lineRange = `${result.exchange.lineStart}-${result.exchange.lineEnd}`;
        // File information with metadata (clean format for smart tool selection)
        output += `   Lines ${lineRange} in ${result.exchange.archivePath} (${fileSizeKB}KB, ${totalLines} lines)\n\n`;
    }
    return output;
}
