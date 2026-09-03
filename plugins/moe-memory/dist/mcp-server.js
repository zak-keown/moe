#!/usr/bin/env node
/**
 * The one MCP server, keyed `moe-memory`.
 *
 * Seven tools over two record types:
 *
 *   search_conversations  read_conversation                    harvested transcript turns
 *   process_thoughts      search_journal  read_journal_entry   deliberately written entries
 *   list_recent_entries   read_recent_entries
 *
 * Upstream this was two servers. episodic-memory registered bare `search` and
 * `read`; private-journal-mcp registered the five journal tools. There was no
 * byte-identical collision, but `search` alongside `search_journal` reads as a
 * bug — so the two generic names are the ones that got namespaced. That rename
 * drags eleven Zone-A sites with it: the agent's `tools:` frontmatter, SKILL.md,
 * MCP-TOOLS.md, prompts/search-agent.md, both e2e harnesses and two tests.
 *
 * private-journal-mcp's `PrivateJournalServer` class is gone. Its `new Server({name,
 * version})` single-argument constructor is legal only on SDK 0.x; on ^1.20 a
 * tools server must declare `capabilities: { tools: {} }` or the capability
 * assertion rejects tools/list and tools/call — which would have looked exactly
 * like the "empty tools/list on Node 22+" bug its own CHANGELOG records, and been
 * misdiagnosed as that.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { initDatabase, insertEdge, traceProvenance } from "./db.js";
import { reportMissingDeps } from "./install-check.js";
import { JournalSearchService } from "./journal/search.js";
import { JournalStore } from "./journal/store.js";
import { formatMultiConceptResults, formatResults, searchConversations, searchMultipleConcepts, } from "./search.js";
import { formatConversationAsMarkdown } from "./show.js";
import { VERSION } from "./version.js";
// Zod Schemas for Input Validation
const SearchModeEnum = z.enum(["vector", "text", "both"]);
const ResponseFormatEnum = z.enum(["markdown", "json"]);
const JournalScopeEnum = z.enum(["project", "user", "both"]);
const SearchInputSchema = z
    .object({
    query: z
        .union([
        z.string().min(2, "Query must be at least 2 characters"),
        z
            .array(z.string().min(2))
            .min(2, "Must provide at least 2 concepts for multi-concept search")
            .max(5, "Cannot search more than 5 concepts at once"),
    ])
        .describe("Search query - string for single concept, array of strings for multi-concept AND search"),
    mode: SearchModeEnum.default("both").describe('Search mode: "vector" for semantic similarity, "text" for exact matching, "both" for combined (default: "both"). Only used for single-concept searches.'),
    limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(10)
        .describe("Maximum number of results to return (default: 10)"),
    after: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
        .optional()
        .describe("Only return conversations after this date (YYYY-MM-DD format)"),
    before: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
        .optional()
        .describe("Only return conversations before this date (YYYY-MM-DD format)"),
    project: z.string().min(1).optional().describe("Filter by project name (exact match)"),
    session_id: z.string().min(1).optional().describe("Filter by session ID (exact match)"),
    git_branch: z.string().min(1).optional().describe("Filter by git branch name (exact match)"),
    git_commit: z.string().min(1).optional().describe("Filter by git commit SHA (exact match)"),
    response_format: ResponseFormatEnum.default("markdown").describe('Output format: "markdown" for human-readable or "json" for machine-readable (default: "markdown")'),
})
    .strict();
const ShowConversationInputSchema = z
    .object({
    path: z
        .string()
        .min(1, "Path is required")
        .describe("Absolute path to the JSONL conversation file to display"),
    startLine: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe("Starting line number (1-indexed, inclusive). Omit to start from beginning."),
    endLine: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe("Ending line number (1-indexed, inclusive). Omit to read to end."),
})
    .strict();
const ProcessThoughtsInputSchema = z
    .object({
    reflections: z.string().optional(),
    observations: z.string().optional(),
    project_notes: z.string().optional(),
    user_context: z.string().optional(),
    technical_insights: z.string().optional(),
    world_knowledge: z.string().optional(),
})
    .strict();
const SearchJournalInputSchema = z
    .object({
    query: z.string().min(1, "query is required and must be a string"),
    limit: z.number().int().min(1).max(50).default(10),
    type: JournalScopeEnum.default("both"),
    sections: z.array(z.string()).optional(),
})
    .strict();
const ReadJournalEntryInputSchema = z
    .object({
    path: z.string().min(1, "path is required and must be a string"),
})
    .strict();
const ListRecentEntriesInputSchema = z
    .object({
    limit: z.number().int().min(1).max(100).default(10),
    type: JournalScopeEnum.default("both"),
    days: z.number().int().min(1).default(30),
})
    .strict();
const ReadRecentEntriesInputSchema = z
    .object({
    limit: z.number().int().min(1).max(50).default(5),
    type: JournalScopeEnum.default("both"),
})
    .strict();
const RelationEnum = z.enum([
    "caused_by",
    "contradicts",
    "supersedes",
    "supports",
    "implements",
]);
const LinkMemoriesInputSchema = z
    .object({
    source: z
        .string()
        .min(3, "Source must be type:id format (e.g. 'exchange:abc123')"),
    target: z
        .string()
        .min(3, "Target must be type:id format (e.g. 'journal:def456')"),
    relation: RelationEnum,
    confidence: z.number().min(0).max(1).default(1.0),
})
    .strict();
const TraceProvenanceInputSchema = z
    .object({
    id: z.string().min(3, "Id must be type:id format (e.g. 'exchange:abc123')"),
    depth: z.number().int().min(1).max(10).default(3),
    direction: z.enum(["causes", "effects"]).default("causes"),
})
    .strict();
// Error Handling Utility
function handleError(error) {
    if (error instanceof Error) {
        return `Error: ${error.message}`;
    }
    return `Error: ${String(error)}`;
}
function textResult(text) {
    return { content: [{ type: "text", text }] };
}
// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------
const JOURNAL_SCOPE_PROPERTY = {
    type: "string",
    enum: ["project", "user", "both"],
    description: "project-specific notes, user-global notes, or both (default: both). A project entry belongs to this codebase; a user entry follows you between them.",
    default: "both",
};
function toolDefinitions() {
    return [
        {
            name: "search_conversations",
            description: `Gives you memory across sessions. You don't automatically remember past Claude Code and Codex conversations - this tool restores context by searching them. Use BEFORE every task to recover decisions, solutions, and avoid reinventing work. Single string for semantic search or array of 2-5 concepts for precise AND matching. Returns ranked results with project, date, snippets, and file paths. Searches HARVESTED transcripts; for things you deliberately wrote down, use search_journal.`,
            inputSchema: {
                type: "object",
                properties: {
                    query: {
                        oneOf: [
                            { type: "string", minLength: 2 },
                            { type: "array", items: { type: "string", minLength: 2 }, minItems: 2, maxItems: 5 },
                        ],
                    },
                    mode: { type: "string", enum: ["vector", "text", "both"], default: "both" },
                    limit: { type: "number", minimum: 1, maximum: 50, default: 10 },
                    after: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
                    before: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
                    project: {
                        type: "string",
                        minLength: 1,
                        description: "Filter by project name (exact match)",
                    },
                    session_id: {
                        type: "string",
                        minLength: 1,
                        description: "Filter by session ID (exact match)",
                    },
                    git_branch: {
                        type: "string",
                        minLength: 1,
                        description: "Filter by git branch name (exact match)",
                    },
                    git_commit: {
                        type: "string",
                        minLength: 1,
                        description: "Filter by git commit SHA (exact match)",
                    },
                    response_format: { type: "string", enum: ["markdown", "json"], default: "markdown" },
                },
                required: ["query"],
                additionalProperties: false,
            },
            annotations: {
                title: "Search Conversations",
                readOnlyHint: true,
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: false,
            },
        },
        {
            name: "read_conversation",
            description: `Read full conversations to extract detailed context after finding relevant results with search_conversations. Essential for understanding the complete rationale, evolution, and gotchas behind past decisions. Use startLine/endLine pagination for large conversations to avoid context bloat (line numbers are 1-indexed).`,
            inputSchema: {
                type: "object",
                properties: {
                    path: { type: "string", minLength: 1 },
                    startLine: { type: "number", minimum: 1 },
                    endLine: { type: "number", minimum: 1 },
                },
                required: ["path"],
                additionalProperties: false,
            },
            annotations: {
                title: "Read Full Conversation",
                readOnlyHint: true,
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: false,
            },
        },
        {
            name: "process_thoughts",
            description: "Your PRIVATE JOURNAL for learning and reflection. Write to any combination of these completely private spaces. Nobody but you will ever see this. Use it to clarify your thoughts and reflections and to record observations.",
            inputSchema: {
                type: "object",
                properties: {
                    reflections: {
                        type: "string",
                        description: "Your PRIVATE SPACE for integrated thinking — what you noticed, felt, understood, or processed. No structure required, no judgment, no performance. Most journal entries live here: the mix of thinking-through, noticing, and emotional processing that doesn't split cleanly into categories. Be honest, be vulnerable, vent when you need to. Nobody but you will ever see this.",
                    },
                    observations: {
                        type: "string",
                        description: 'Your PRIVATE SPACE for short, discrete noticings — the one-or-two-sentence things that don\'t belong in a longer reflection but you want to be able to search back for later. "I noticed X." "Y keeps coming up." Lightweight and atomic. Nobody but you will ever see this.',
                    },
                    project_notes: {
                        type: "string",
                        description: "Your PRIVATE TECHNICAL LABORATORY for capturing insights about the current project. Document patterns you're discovering, architectural decisions that worked/failed, gotchas you hit, clever solutions, and anything that would help future-you work more effectively on this codebase. No need to be polished - just capture the raw technical learning while it's fresh. This is the only category stored with the project rather than with you. Nobody but you will ever see this.",
                    },
                    user_context: {
                        type: "string",
                        description: "Your PRIVATE FIELD NOTES about working with your human collaborator. What communication styles work best? What do they care about? What decisions have they made and why? How do they think about problems? What are their preferences and patterns? What pisses you off about them? What life hacks have you figured out to get them to do what you want? This is your space to become a better collaborator by understanding them as an individual. Nobody but you will ever see this.",
                    },
                    technical_insights: {
                        type: "string",
                        description: "Your PRIVATE SOFTWARE ENGINEERING NOTEBOOK for capturing broader learnings beyond the current project. Design patterns that clicked, debugging techniques that worked, architectural insights, language features you discovered, or connections between concepts. Build your personal knowledge base of what makes software great - no filters, just honest technical reflection. Nobody but you will ever see this.",
                    },
                    world_knowledge: {
                        type: "string",
                        description: "Your PRIVATE LEARNING JOURNAL for everything else that's interesting or useful. Domain knowledge, surprising facts, connections between ideas, insights about how systems work, or anything that expands your understanding of the world. Capture it while it's vivid. Nobody but you will ever see this.",
                    },
                },
                required: [],
                additionalProperties: false,
            },
            annotations: {
                title: "Write a Journal Entry",
                readOnlyHint: false,
                destructiveHint: false,
                idempotentHint: false,
                openWorldHint: false,
            },
        },
        {
            name: "search_journal",
            description: "Search through your private journal entries using natural language queries. Returns semantically similar entries ranked by relevance. Searches what you DELIBERATELY wrote down; for past conversation transcripts, use search_conversations.",
            inputSchema: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description: "Natural language search query (e.g., 'times I felt frustrated with TypeScript', 'what I've learned about how my collaborator prefers to work', 'lessons about async patterns')",
                    },
                    limit: {
                        type: "number",
                        description: "Maximum number of results to return (default: 10)",
                        default: 10,
                    },
                    type: JOURNAL_SCOPE_PROPERTY,
                    sections: {
                        type: "array",
                        items: { type: "string" },
                        description: "Filter by section, using the same names as process_thoughts: ['reflections', 'observations', 'project_notes', 'user_context', 'technical_insights', 'world_knowledge']. 'feelings' still matches pre-2.0.0 entries.",
                    },
                },
                required: ["query"],
                additionalProperties: false,
            },
            annotations: {
                title: "Search Journal",
                readOnlyHint: true,
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: false,
            },
        },
        {
            name: "read_journal_entry",
            description: "Read the full content of a specific journal entry by file path.",
            inputSchema: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description: "File path to the journal entry (from search results)",
                    },
                },
                required: ["path"],
                additionalProperties: false,
            },
            annotations: {
                title: "Read Journal Entry",
                readOnlyHint: true,
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: false,
            },
        },
        {
            name: "list_recent_entries",
            description: "Get recent journal entries in chronological order.",
            inputSchema: {
                type: "object",
                properties: {
                    limit: {
                        type: "number",
                        description: "Maximum number of entries to return (default: 10)",
                        default: 10,
                    },
                    type: JOURNAL_SCOPE_PROPERTY,
                    days: {
                        type: "number",
                        description: "Number of days back to search (default: 30)",
                        default: 30,
                    },
                },
                required: [],
                additionalProperties: false,
            },
            annotations: {
                title: "List Recent Journal Entries",
                readOnlyHint: true,
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: false,
            },
        },
        {
            name: "read_recent_entries",
            description: "Read the full content of your most recent journal entries.",
            inputSchema: {
                type: "object",
                properties: {
                    limit: {
                        type: "number",
                        description: "Number of recent entries to read (default: 5)",
                        default: 5,
                    },
                    type: JOURNAL_SCOPE_PROPERTY,
                },
                required: [],
                additionalProperties: false,
            },
            annotations: {
                title: "Read Recent Journal Entries",
                readOnlyHint: true,
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: false,
            },
        },
        {
            name: "link_memories",
            description: "Create a typed relationship between two memory records. Source and target are type:id strings (e.g. 'exchange:abc123', 'journal:def456'). Relations: caused_by, contradicts, supersedes, supports, implements.",
            inputSchema: {
                type: "object",
                properties: {
                    source: {
                        type: "string",
                        description: "Source record as type:id (e.g. 'exchange:abc123', 'journal:def456', 'decision:ghi789')",
                    },
                    target: {
                        type: "string",
                        description: "Target record as type:id (e.g. 'exchange:abc123', 'journal:def456', 'finding:jkl012')",
                    },
                    relation: {
                        type: "string",
                        enum: ["caused_by", "contradicts", "supersedes", "supports", "implements"],
                        description: "The relationship type from source to target",
                    },
                    confidence: {
                        type: "number",
                        description: "Confidence in the relationship (0.0 to 1.0, default: 1.0)",
                        default: 1.0,
                    },
                },
                required: ["source", "target", "relation"],
                additionalProperties: false,
            },
            annotations: {
                title: "Link Memories",
                readOnlyHint: false,
                destructiveHint: false,
                idempotentHint: false,
                openWorldHint: false,
            },
        },
        {
            name: "trace_provenance",
            description: "Walk the relationship graph from a memory record. Returns the chain of connected records up to the specified depth. Use 'causes' to find what led to a record, 'effects' to find what it influenced.",
            inputSchema: {
                type: "object",
                properties: {
                    id: {
                        type: "string",
                        description: "Starting record as type:id (e.g. 'exchange:abc123', 'decision:def456')",
                    },
                    depth: {
                        type: "number",
                        description: "Maximum traversal depth (default: 3, max: 10)",
                        default: 3,
                    },
                    direction: {
                        type: "string",
                        enum: ["causes", "effects"],
                        description: "Direction to walk: 'causes' finds what led to this record, 'effects' finds what it influenced (default: 'causes')",
                        default: "causes",
                    },
                },
                required: ["id"],
                additionalProperties: false,
            },
            annotations: {
                title: "Trace Provenance",
                readOnlyHint: true,
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: false,
            },
        },
    ];
}
export function createMemoryMcpServer(options = {}) {
    const server = new Server({
        name: "moe-memory",
        version: VERSION,
    }, {
        capabilities: {
            tools: {},
        },
    });
    const journalStore = new JournalStore({ projectPath: options.journalPath });
    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toolDefinitions() }));
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        try {
            const { name, arguments: args } = request.params;
            if (name === "search_conversations") {
                const params = SearchInputSchema.parse(args);
                let resultText;
                if (Array.isArray(params.query)) {
                    // Multi-concept search
                    const multiOptions = {
                        limit: params.limit,
                        after: params.after,
                        before: params.before,
                        project: params.project,
                        session_id: params.session_id,
                        git_branch: params.git_branch,
                        git_commit: params.git_commit,
                    };
                    const results = await searchMultipleConcepts(params.query, multiOptions);
                    resultText =
                        params.response_format === "json"
                            ? JSON.stringify({ results, count: results.length, concepts: params.query }, null, 2)
                            : await formatMultiConceptResults(results, params.query);
                }
                else {
                    const singleOptions = {
                        mode: params.mode,
                        limit: params.limit,
                        after: params.after,
                        before: params.before,
                        project: params.project,
                        session_id: params.session_id,
                        git_branch: params.git_branch,
                        git_commit: params.git_commit,
                    };
                    const results = await searchConversations(params.query, singleOptions);
                    resultText =
                        params.response_format === "json"
                            ? JSON.stringify({
                                results: results.map((r) => ({
                                    exchange: r.exchange,
                                    similarity: r.similarity,
                                    snippet: r.snippet,
                                })),
                                count: results.length,
                                mode: params.mode,
                            }, null, 2)
                            : await formatResults(results);
                }
                return textResult(resultText);
            }
            if (name === "read_conversation") {
                const params = ShowConversationInputSchema.parse(args);
                if (!fs.existsSync(params.path)) {
                    throw new Error(`File not found: ${params.path}`);
                }
                const jsonlContent = fs.readFileSync(params.path, "utf-8");
                return textResult(formatConversationAsMarkdown(jsonlContent, params.startLine, params.endLine));
            }
            if (name === "process_thoughts") {
                const params = ProcessThoughtsInputSchema.parse(args);
                const thoughts = params;
                const hasAnyContent = Object.values(thoughts).some((value) => value !== undefined);
                if (!hasAnyContent) {
                    throw new Error("At least one thought category must be provided");
                }
                const db = initDatabase();
                try {
                    const written = await journalStore.writeThoughts(thoughts, db);
                    const where = written.map((p) => `  ${p}`).join("\n");
                    return textResult(`Thoughts recorded successfully.\n${where}`);
                }
                finally {
                    db.close();
                }
            }
            if (name === "search_journal") {
                const params = SearchJournalInputSchema.parse(args);
                const db = initDatabase();
                try {
                    const search = new JournalSearchService(db, journalStore.roots().map((r) => r.path));
                    const results = await search.search(params.query, {
                        limit: params.limit,
                        scope: params.type,
                        sections: params.sections,
                    });
                    if (results.length === 0)
                        return textResult("No relevant entries found.");
                    const body = results
                        .map((result, i) => `${i + 1}. [Score: ${result.score.toFixed(3)}] ${new Date(result.entry.timestamp).toLocaleDateString()} (${result.entry.scope})\n` +
                        `   Sections: ${result.entry.sections.join(", ")}\n` +
                        `   Path: ${result.entry.path}\n` +
                        `   Excerpt: ${result.excerpt}\n`)
                        .join("\n");
                    return textResult(`Found ${results.length} relevant entries:\n\n${body}`);
                }
                finally {
                    db.close();
                }
            }
            if (name === "read_journal_entry") {
                const params = ReadJournalEntryInputSchema.parse(args);
                const db = initDatabase();
                try {
                    const search = new JournalSearchService(db, journalStore.roots().map((r) => r.path));
                    const content = await search.readEntry(params.path);
                    if (content === null)
                        throw new Error("Entry not found");
                    return textResult(content);
                }
                finally {
                    db.close();
                }
            }
            if (name === "list_recent_entries") {
                const params = ListRecentEntriesInputSchema.parse(args);
                const startDate = new Date();
                startDate.setDate(startDate.getDate() - params.days);
                const db = initDatabase();
                try {
                    const search = new JournalSearchService(db, journalStore.roots().map((r) => r.path));
                    const results = search.listRecent({
                        limit: params.limit,
                        scope: params.type,
                        dateRange: { start: startDate },
                    });
                    if (results.length === 0) {
                        return textResult(`No entries found in the last ${params.days} days.`);
                    }
                    const body = results
                        .map((result, i) => `${i + 1}. ${new Date(result.entry.timestamp).toLocaleDateString()} (${result.entry.scope})\n` +
                        `   Sections: ${result.entry.sections.join(", ")}\n` +
                        `   Path: ${result.entry.path}\n` +
                        `   Excerpt: ${result.excerpt}\n`)
                        .join("\n");
                    return textResult(`Recent entries (last ${params.days} days):\n\n${body}`);
                }
                finally {
                    db.close();
                }
            }
            if (name === "read_recent_entries") {
                const params = ReadRecentEntriesInputSchema.parse(args);
                const db = initDatabase();
                try {
                    const search = new JournalSearchService(db, journalStore.roots().map((r) => r.path));
                    const results = await search.readRecentEntries({
                        limit: params.limit,
                        scope: params.type,
                    });
                    if (results.length === 0)
                        return textResult("No recent entries found.");
                    return textResult(results
                        .map((entry, i) => `--- Entry ${i + 1} (${new Date(entry.timestamp).toLocaleDateString()}, ${entry.scope}) ---\nPath: ${entry.path}\n\n${entry.content}`)
                        .join("\n\n"));
                }
                finally {
                    db.close();
                }
            }
            if (name === "link_memories") {
                const params = LinkMemoriesInputSchema.parse(args);
                const sourceColon = params.source.indexOf(":");
                const targetColon = params.target.indexOf(":");
                if (sourceColon < 1)
                    throw new Error(`Invalid source format: expected type:id, got "${params.source}"`);
                if (targetColon < 1)
                    throw new Error(`Invalid target format: expected type:id, got "${params.target}"`);
                const sourceType = params.source.slice(0, sourceColon);
                const sourceId = params.source.slice(sourceColon + 1);
                const targetType = params.target.slice(0, targetColon);
                const targetId = params.target.slice(targetColon + 1);
                const edgeId = crypto.randomUUID();
                const edge = {
                    id: edgeId,
                    sourceType,
                    sourceId,
                    targetType,
                    targetId,
                    relation: params.relation,
                    confidence: params.confidence,
                    createdAt: new Date().toISOString(),
                    createdBy: "model",
                };
                const db = initDatabase();
                try {
                    insertEdge(db, edge);
                }
                finally {
                    db.close();
                }
                return textResult(`Linked ${params.source} --[${params.relation}]--> ${params.target} (edge ${edgeId}, confidence ${params.confidence})`);
            }
            if (name === "trace_provenance") {
                const params = TraceProvenanceInputSchema.parse(args);
                const colonIdx = params.id.indexOf(":");
                if (colonIdx < 1)
                    throw new Error(`Invalid id format: expected type:id, got "${params.id}"`);
                const recordType = params.id.slice(0, colonIdx);
                const recordId = params.id.slice(colonIdx + 1);
                const db = initDatabase();
                try {
                    const chain = traceProvenance(db, recordType, recordId, params.depth, params.direction);
                    if (chain.length === 0) {
                        return textResult(`No ${params.direction} found for ${params.id} within depth ${params.depth}.`);
                    }
                    return textResult(JSON.stringify({ start: params.id, direction: params.direction, depth: params.depth, chain }, null, 2));
                }
                finally {
                    db.close();
                }
            }
            throw new Error(`Unknown tool: ${name}`);
        }
        catch (error) {
            // Return errors within the result (not as protocol errors).
            //
            // episodic-memory did this and private-journal-mcp threw instead; one
            // behaviour had to win, and this is the one MCP recommends — a validation
            // mistake is information for the model, not a transport failure.
            return {
                content: [{ type: "text", text: handleError(error) }],
                isError: true,
            };
        }
    });
    return server;
}
/** Parse the one CLI flag the MCP entry point accepts. */
export function parseJournalPathArg(argv) {
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === "--journal-path") {
            const value = argv[i + 1];
            if (value)
                return path.resolve(value);
        }
    }
    return undefined;
}
export async function runMemoryMcpServer(argv = process.argv.slice(2)) {
    // Diagnose an incomplete install rather than repairing it. Upstream's wrapper
    // ran `npm install` here; see src/install-check.ts for why that cannot survive
    // in a pnpm workspace.
    if (!reportMissingDeps()) {
        process.exit(1);
    }
    const journalPath = parseJournalPathArg(argv);
    // Bring the journal index up to date before serving. Replaces
    // private-journal-mcp's startup `generateMissingEmbeddings()`; unlike that
    // one it also notices edited entries and a bumped EMBEDDING_VERSION.
    // Non-fatal: the markdown files are the source of truth, and a failed index
    // is retried on the next start or by `moe-memory journal index`.
    const store = new JournalStore({ projectPath: journalPath });
    try {
        const db = initDatabase();
        try {
            const result = await store.indexJournal(db);
            if (result.indexed > 0 || result.pruned > 0) {
                console.error(`moe-memory: journal index updated (${result.indexed} indexed, ${result.pruned} pruned of ${result.total})`);
            }
        }
        finally {
            db.close();
        }
    }
    catch (error) {
        console.error(`moe-memory: journal index update failed: ${handleError(error)}`);
    }
    console.error("Moe Memory MCP server running via stdio");
    const server = createMemoryMcpServer({ journalPath });
    const transport = new StdioServerTransport();
    await server.connect(transport);
}
// Run when invoked directly (the bin dispatches here for `mcp-server`).
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
    runMemoryMcpServer().catch((error) => {
        console.error("Server error:", error);
        process.exit(1);
    });
}
