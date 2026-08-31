/**
 * The two record types.
 *
 * A **conversation exchange** is harvested: sync copies a transcript out of
 * `~/.claude/projects` or `~/.codex/sessions` and the indexer derives rows from
 * it. Nobody chose to write it down.
 *
 * A **journal entry** is deliberate: the model called `process_thoughts` and a
 * markdown file was written. It is authored content with different privacy
 * properties — a project entry belongs to the codebase, a user entry belongs to
 * the person.
 *
 * They share one encoder and one SQLite file and nothing else. Distinct tables,
 * distinct MCP tools, distinct result types. This file is where that boundary
 * is stated.
 *
 * Reconciliation note: private-journal-mcp's own `types.ts` was entirely dead —
 * `JournalEntry`, `ServerConfig` and `ProcessThoughtsRequest` had zero importers
 * anywhere in its src or tests, while its live journal shape was retyped inline
 * in four places. The names below are re-established as the single declaration
 * those four sites now share.
 */

export interface ToolCall {
  id: string;
  exchangeId: string;
  toolName: string;
  toolInput?: unknown;
  toolResult?: string;
  isError: boolean;
  timestamp: string;
}

export type ConversationHarness = "claude" | "codex";

export interface ConversationExchange {
  id: string;
  project: string;
  timestamp: string;
  userMessage: string;
  assistantMessage: string;
  archivePath: string;
  lineStart: number;
  lineEnd: number;

  // Conversation structure
  parentUuid?: string | undefined;
  isSidechain?: boolean | undefined;

  // Session context
  harness?: ConversationHarness | undefined;
  sessionId?: string | undefined;
  cwd?: string | undefined;
  gitBranch?: string | undefined;
  claudeVersion?: string | undefined;
  agentVersion?: string | undefined;
  model?: string | undefined;
  modelProvider?: string | undefined;

  // Thinking metadata
  thinkingLevel?: string | undefined;
  thinkingDisabled?: boolean | undefined;
  thinkingTriggers?: string | undefined; // JSON array

  // Tool calls (populated separately)
  toolCalls?: ToolCall[] | undefined;
}

/** A conversation-search hit. */
export interface SearchResult {
  exchange: ConversationExchange;
  /** Cosine similarity, or undefined in `mode: 'text'` where there is no vector. */
  similarity?: number | undefined;
  snippet: string;
  /** The conversation's AI summary sidecar, when one exists and is not an error sentinel. */
  summary?: string | undefined;
}

export interface MultiConceptResult {
  exchange: ConversationExchange;
  snippet: string;
  conceptSimilarities: number[];
  averageSimilarity: number;
}

// ---------------------------------------------------------------------------
// Journal
// ---------------------------------------------------------------------------

/**
 * Which journal a record belongs to.
 *
 * Upstream this was derived at read time from which directory the file happened
 * to be walked out of, and was not stored. It is a column now: derivation broke
 * the moment both roots resolved to the same directory.
 */
export type JournalScope = "project" | "user";

/**
 * The six thought categories, in the order they are rendered into an entry.
 *
 * `project_notes` routes to the project journal; the other five route to the
 * user journal. Snake_case because these are MCP wire names.
 */
export interface JournalThoughts {
  reflections?: string | undefined;
  observations?: string | undefined;
  project_notes?: string | undefined;
  user_context?: string | undefined;
  technical_insights?: string | undefined;
  world_knowledge?: string | undefined;
}

/** The rendered `## Heading` for each thought category, in entry order. */
export const JOURNAL_SECTION_HEADINGS: ReadonlyArray<[keyof JournalThoughts, string]> = [
  ["reflections", "Reflections"],
  ["observations", "Observations"],
  ["project_notes", "Project Notes"],
  ["user_context", "User Context"],
  ["technical_insights", "Technical Insights"],
  ["world_knowledge", "World Knowledge"],
];

/** One journal entry as it exists on disk and in the index. */
export interface JournalEntry {
  /** Stable id: the entry's absolute path is not stable, the id is. */
  id: string;
  /** Absolute path of the markdown file, refreshed from the walk on every index. */
  path: string;
  scope: JournalScope;
  /** Epoch milliseconds. */
  timestamp: number;
  /** Frontmatter-stripped, header-stripped body — what gets embedded. */
  text: string;
  /** Rendered section headings present in the entry, e.g. `['Reflections']`. */
  sections: string[];
}

/** A journal-search hit. */
export interface JournalSearchResult {
  entry: JournalEntry;
  /** Cosine similarity in [-1, 1]. 1 for `list_recent_entries`, which does not rank. */
  score: number;
  excerpt: string;
}
