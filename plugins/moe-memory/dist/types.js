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
/** The rendered `## Heading` for each thought category, in entry order. */
export const JOURNAL_SECTION_HEADINGS = [
    ["reflections", "Reflections"],
    ["observations", "Observations"],
    ["project_notes", "Project Notes"],
    ["user_context", "User Context"],
    ["technical_insights", "Technical Insights"],
    ["world_knowledge", "World Knowledge"],
];
